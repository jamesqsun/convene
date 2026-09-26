-- Contact fields live in the existing private users.profile JSON (owner-only RLS).
-- No contact data is added to public summaries, memories, or embeddings.
set search_path=public,extensions;
alter table hangouts add column communication_platform text
  check(communication_platform in ('Phone','Discord','WhatsApp','Instagram','Telegram'));

create function convene_contact_value(p_profile jsonb,p_platform text) returns text
language plpgsql immutable set search_path=public as $$
declare value text;
begin
  if not coalesce(p_profile->'platforms' ? p_platform,false) then return null; end if;
  value:=case when p_platform='Phone' then p_profile->>'phone' else p_profile->'handles'->>p_platform end;
  if p_platform in ('Phone','WhatsApp') then
    value:=regexp_replace(value,'[[:space:]().-]','','g');
    if value ~ '^\+[1-9][0-9]{7,14}$' then return value; end if;
  elsif p_platform in ('Discord','Instagram','Telegram') and value ~ '^@?[A-Za-z0-9_.#-]{1,100}$' then
    return regexp_replace(value,'^@','');
  end if;
  return null;
end $$;

-- Preserve the existing reservation guard and validate the chosen communication
-- channel under the same participant locks before persisting it on the event.
create or replace function schedule_convene_hangout(p_user_id uuid,p_hangout jsonb)
returns void language plpgsql set search_path=public,extensions as $$
declare participant uuid; participant_ids uuid[]; start_at timestamptz; end_at timestamptz; desired_mode text; channel text;
begin
  select array_agg(value::uuid order by value) into participant_ids from jsonb_array_elements_text(p_hangout->'participantIds');
  if cardinality(participant_ids)<>2 or not(p_user_id=any(participant_ids)) or participant_ids[1]=participant_ids[2] then raise exception 'schedule_conflict'; end if;
  start_at:=(p_hangout->>'start')::timestamptz;
  end_at:=(p_hangout->>'end')::timestamptz;
  desired_mode:=case when (p_hangout->>'seededVenue')::boolean then 'in_person' else 'online' end;
  channel:=p_hangout->>'communicationPlatform';
  if start_at<now() or end_at<=start_at or channel is null or channel not in ('Phone','Discord','WhatsApp','Instagram','Telegram') then raise exception 'schedule_conflict'; end if;
  foreach participant in array participant_ids loop
    perform pg_advisory_xact_lock(hashtextextended(participant::text,0));
    perform 1 from users where id=participant and convene_contact_value(profile,channel) is not null for update;
    if not found then raise exception 'schedule_conflict'; end if;
    perform 1 from availability_blocks a where a.user_id=participant and a.start_time<=start_at and a.end_time>=end_at and a.mode in ('either',desired_mode) for update;
    if not found then raise exception 'schedule_conflict'; end if;
    if exists(select 1 from booking_reservations b where b.user_id=participant and b.during && tstzrange(start_at,end_at,'[)')) then raise exception 'schedule_conflict'; end if;
  end loop;
  if exists(select 1 from connections c where c.user_id=any(participant_ids) and c.other_id=any(participant_ids) and c.status in ('blocked','declined')) then raise exception 'schedule_conflict'; end if;
  insert into hangouts(id,activity_id,start_time,end_time,reason,score,seeded_venue,communication_platform)
    values((p_hangout->>'id')::uuid,p_hangout->>'activityId',start_at,end_at,p_hangout->>'reason',(p_hangout->>'score')::integer,(p_hangout->>'seededVenue')::boolean,channel);
  foreach participant in array participant_ids loop
    insert into hangout_participants(hangout_id,user_id) values((p_hangout->>'id')::uuid,participant);
    insert into booking_reservations(hangout_id,user_id,during) values((p_hangout->>'id')::uuid,participant,tstzrange(start_at,end_at,'[)'));
  end loop;
exception when exclusion_violation then raise exception 'schedule_conflict';
end $$;
revoke all on function convene_contact_value(jsonb,text),schedule_convene_hangout(uuid,jsonb) from public,anon,authenticated;
grant execute on function convene_contact_value(jsonb,text),schedule_convene_hangout(uuid,jsonb) to service_role;
