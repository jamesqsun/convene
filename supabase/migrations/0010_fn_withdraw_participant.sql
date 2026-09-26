-- Participant withdrawal.
--
-- Removes only the withdrawing person: releases their reservation and date assignment and closes
-- their slot. The event survives with two or more people left; with fewer it is cancelled for
-- everyone and the remaining bookings are released too. Serialized under the event row lock so
-- concurrent withdrawals cannot leave a one-person event. Repeated calls are idempotent.
--
-- Returns: withdrawn | event_cancelled | already_withdrawn | already_cancelled.
-- Error codes: event_not_found, not_participant, event_started.

-- Frees the booking without touching membership history.
create or replace function release_booking(p_event_id uuid, p_user_id uuid) returns void
language plpgsql as $$
begin
  delete from participant_reservations where event_id = p_event_id and user_id = p_user_id;
  delete from user_date_assignments where event_id = p_event_id and user_id = p_user_id;
  update availability_slots s
    set status = 'cancelled', revision = revision + 1
    from event_participants p
    where p.event_id = p_event_id and p.user_id = p_user_id and s.id = p.slot_id;
end $$;

create or replace function cancel_event(p_event_id uuid, p_now timestamptz) returns void
language plpgsql as $$
declare
  remaining uuid;
begin
  update events set status = 'cancelled', cancelled_at = p_now where id = p_event_id;
  for remaining in
    select user_id from event_participants where event_id = p_event_id and withdrawn_at is null
  loop
    perform release_booking(p_event_id, remaining);
    insert into notification_jobs (event_id, recipient_id, type)
      values (p_event_id, remaining, 'cancellation')
      on conflict do nothing;
  end loop;
end $$;

create or replace function withdraw_participant(p_event_id uuid, p_user_id uuid, p_now timestamptz default now())
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_event events%rowtype;
  v_participant event_participants%rowtype;
  v_remaining int;
begin
  select * into v_event from events where id = p_event_id for update;
  if not found then raise exception 'event_not_found'; end if;
  select * into v_participant from event_participants where event_id = p_event_id and user_id = p_user_id;
  if not found then raise exception 'not_participant'; end if;
  if v_event.status = 'cancelled' then return 'already_cancelled'; end if;
  if v_participant.withdrawn_at is not null then return 'already_withdrawn'; end if;
  -- Attendance is assumed once the event starts; leaving is only possible before then.
  if p_now >= v_event.starts_at then raise exception 'event_started'; end if;

  update event_participants set withdrawn_at = p_now where event_id = p_event_id and user_id = p_user_id;
  perform release_booking(p_event_id, p_user_id);

  select count(*)::int into v_remaining
    from event_participants where event_id = p_event_id and withdrawn_at is null;
  if v_remaining >= 2 then
    insert into notification_jobs (event_id, recipient_id, type, payload)
      select p_event_id, user_id, 'participant_left', jsonb_build_object('remaining', v_remaining)
      from event_participants where event_id = p_event_id and withdrawn_at is null
      on conflict do nothing;
    return 'withdrawn';
  end if;

  perform cancel_event(p_event_id, p_now);
  return 'event_cancelled';
end $$;

revoke execute on function release_booking(uuid, uuid) from public, anon, authenticated;
revoke execute on function cancel_event(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function withdraw_participant(uuid, uuid, timestamptz) from public, anon, authenticated;
