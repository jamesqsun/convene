-- Atomic group booking.
--
-- Called by the planning driver after activity, venue, and exact time have been chosen for a
-- proposal (outside any database lock). Revalidates everything the proposal assumed, then writes
-- the event, participants, reservations, date assignments, slot fills, and notification jobs in
-- one transaction. Re-running for an already committed proposal returns the existing event id.
--
-- Error codes (raised as exception messages): proposal_not_found, proposal_not_ready, group_size,
-- city_mismatch, stale_slot, outside_local_day, advance_assignment, booking_conflict.

-- Every source slot must still be pending, owned by the member, at the recorded revision, and
-- must fully contain the event.
create or replace function assert_slots_fit(p_members jsonb, p_event_range tstzrange) returns void
language plpgsql as $$
declare
  member jsonb;
  slot availability_slots%rowtype;
begin
  for member in select * from jsonb_array_elements(p_members) loop
    select * into slot from availability_slots where id = (member->>'slot_id')::uuid;
    if not found
      or slot.status <> 'pending'
      or slot.user_id <> (member->>'user_id')::uuid
      or slot.revision <> (member->>'revision')::int
      or not (slot."window" @> p_event_range)
    then
      raise exception 'stale_slot';
    end if;
  end loop;
end $$;

create or replace function insert_event_rows(
  p_proposal planning_proposals,
  p_batch planning_batches,
  p_event_range tstzrange,
  p_user_ids uuid[]
) returns uuid
language plpgsql as $$
declare
  v_event_id uuid;
begin
  insert into events (
    planning_id, city_key, timezone, local_date, activity_id, activity_name, duration_minutes,
    explanation, venue, starts_at, ends_at
  ) values (
    p_proposal.planning_id, p_batch.city_key, p_batch.timezone, p_batch.local_date,
    p_proposal.plan->>'activity_id', p_proposal.plan->>'activity_name',
    (p_proposal.plan->>'duration_minutes')::int,
    coalesce(p_proposal.plan->>'explanation', ''), p_proposal.plan->'venue',
    lower(p_event_range), upper(p_event_range)
  ) returning id into v_event_id;

  insert into event_participants (event_id, user_id, slot_id)
    select v_event_id, (m->>'user_id')::uuid, (m->>'slot_id')::uuid
    from jsonb_array_elements(p_proposal.members) m;

  insert into participant_reservations (event_id, user_id, "window")
    select v_event_id, u, p_event_range from unnest(p_user_ids) u;

  insert into user_date_assignments (user_id, local_date, event_id)
    select u, p_batch.local_date, v_event_id from unnest(p_user_ids) u;

  return v_event_id;
end $$;

create or replace function commit_group_event(p_planning_id text, p_now timestamptz default now())
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_proposal planning_proposals%rowtype;
  v_batch planning_batches%rowtype;
  v_event_range tstzrange;
  v_user_ids uuid[];
  v_slot_ids uuid[];
  v_event_id uuid;
begin
  select * into v_proposal from planning_proposals where planning_id = p_planning_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_proposal.status = 'committed' then return v_proposal.event_id; end if;
  if v_proposal.status <> 'planned' or v_proposal.plan is null then
    raise exception 'proposal_not_ready';
  end if;

  select * into v_batch from planning_batches where id = v_proposal.batch_id;
  v_event_range := tstzrange(
    (v_proposal.plan->>'starts_at')::timestamptz,
    (v_proposal.plan->>'ends_at')::timestamptz,
    '[)'
  );

  select array_agg(distinct (m->>'user_id')::uuid), array_agg((m->>'slot_id')::uuid)
    into v_user_ids, v_slot_ids
    from jsonb_array_elements(v_proposal.members) m;
  if coalesce(array_length(v_user_ids, 1), 0) not between 2 and 10
    or array_length(v_user_ids, 1) <> jsonb_array_length(v_proposal.members)
  then
    raise exception 'group_size';
  end if;

  -- Lock in a stable order (profiles, then slots) so concurrent commits cannot deadlock.
  perform 1 from profiles where id = any(v_user_ids) order by id for update;
  perform 1 from availability_slots where id = any(v_slot_ids) order by id for update;

  if exists (select 1 from profiles where id = any(v_user_ids) and city_key is distinct from v_batch.city_key) then
    raise exception 'city_mismatch';
  end if;
  perform assert_slots_fit(v_proposal.members, v_event_range);
  if not (local_day_bounds(v_batch.local_date, v_batch.timezone) @> v_event_range) then
    raise exception 'outside_local_day';
  end if;
  if lower(v_event_range) < p_now + interval '48 hours' then
    raise exception 'advance_assignment';
  end if;

  begin
    v_event_id := insert_event_rows(v_proposal, v_batch, v_event_range, v_user_ids);
  exception when unique_violation or exclusion_violation then
    raise exception 'booking_conflict';
  end;

  update availability_slots
    set status = 'filled', assigned_event_id = v_event_id, revision = revision + 1
    where id = any(v_slot_ids);

  insert into notification_jobs (event_id, recipient_id, type)
    select v_event_id, u, 'assignment' from unnest(v_user_ids) u
    on conflict do nothing;

  update planning_proposals set status = 'committed', event_id = v_event_id
    where planning_id = p_planning_id;
  return v_event_id;
end $$;

revoke execute on function assert_slots_fit(jsonb, tstzrange) from public, anon, authenticated;
revoke execute on function insert_event_rows(planning_proposals, planning_batches, tstzrange, uuid[])
  from public, anon, authenticated;
revoke execute on function commit_group_event(text, timestamptz) from public, anon, authenticated;
