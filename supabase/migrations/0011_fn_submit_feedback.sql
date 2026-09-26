-- Per-person feedback and friendship creation.
--
-- Records one directional "meet again?" answer for a completed, non-cancelled event. Answers are
-- immutable. When the second explicit yes of a pair lands, exactly one friendship row is created,
-- even under retries or concurrent submissions: the event row lock serializes the two writers and
-- the friendship primary key absorbs any duplicate.
--
-- Returns: recorded | unchanged | friendship_created.
-- Error codes: event_not_found, event_cancelled, event_not_completed, self_feedback,
-- not_participant, answer_final.

create or replace function assert_active_participant(p_event_id uuid, p_user_id uuid) returns void
language plpgsql as $$
begin
  if not exists (
    select 1 from event_participants
    where event_id = p_event_id and user_id = p_user_id and withdrawn_at is null
  ) then
    raise exception 'not_participant';
  end if;
end $$;

create or replace function submit_feedback(
  p_event_id uuid,
  p_author_id uuid,
  p_subject_id uuid,
  p_meet_again boolean,
  p_now timestamptz default now()
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_event events%rowtype;
  v_existing participant_feedback%rowtype;
  v_inserted int;
begin
  select * into v_event from events where id = p_event_id for update;
  if not found then raise exception 'event_not_found'; end if;
  if v_event.status <> 'scheduled' then raise exception 'event_cancelled'; end if;
  -- Completion is the end timestamp, whether or not any worker has run since.
  if v_event.ends_at > p_now then raise exception 'event_not_completed'; end if;
  if p_author_id = p_subject_id then raise exception 'self_feedback'; end if;
  perform assert_active_participant(p_event_id, p_author_id);
  perform assert_active_participant(p_event_id, p_subject_id);

  select * into v_existing from participant_feedback
    where event_id = p_event_id and author_id = p_author_id and subject_id = p_subject_id;
  if found then
    if v_existing.meet_again = p_meet_again then return 'unchanged'; end if;
    raise exception 'answer_final';
  end if;

  insert into participant_feedback (event_id, author_id, subject_id, meet_again, created_at)
    values (p_event_id, p_author_id, p_subject_id, p_meet_again, p_now);
  if not p_meet_again then return 'recorded'; end if;

  if not exists (
    select 1 from participant_feedback
    where event_id = p_event_id and author_id = p_subject_id and subject_id = p_author_id and meet_again
  ) then
    return 'recorded';
  end if;

  insert into friendships (user_a, user_b, provenance_event_id, created_at)
    values (least(p_author_id, p_subject_id), greatest(p_author_id, p_subject_id), p_event_id, p_now)
    on conflict do nothing;
  get diagnostics v_inserted = row_count;
  return case when v_inserted > 0 then 'friendship_created' else 'recorded' end;
end $$;

revoke execute on function assert_active_participant(uuid, uuid) from public, anon, authenticated;
revoke execute on function submit_feedback(uuid, uuid, uuid, boolean, timestamptz)
  from public, anon, authenticated;
