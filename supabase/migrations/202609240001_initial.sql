-- Run once in the Supabase SQL editor, or apply with `supabase db push`.
create extension if not exists vector with schema extensions;
create extension if not exists btree_gist with schema extensions;
set search_path = public, extensions;

create table public.users (
  id uuid primary key,
  auth_id uuid unique references auth.users(id) on delete cascade,
  profile jsonb not null,
  summary text not null default '',
  seeded boolean not null default false,
  profile_embedding extensions.vector(1536),
  created_at timestamptz not null default now(),
  constraint real_user_identity check ((seeded and auth_id is null) or (not seeded and auth_id = id and auth_id is not null))
);
create table public.preference_memories (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  content jsonb not null,
  created_at timestamptz not null default now()
);
create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  mode text not null check (mode in ('online', 'in_person', 'either')),
  check (end_time > start_time)
);
create table public.connections (
  user_id uuid not null references public.users(id) on delete cascade,
  other_id uuid not null references public.users(id) on delete cascade,
  status text not null check (status in ('friend', 'met', 'blocked', 'declined')),
  hangout_count integer not null default 0 check (hangout_count >= 0),
  primary key (user_id, other_id),
  check (user_id <> other_id)
);
create table public.hangouts (
  id uuid primary key,
  activity_id text not null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled', 'completed')),
  reason text not null,
  score integer not null check (score between 0 and 100),
  seeded_venue boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create table public.hangout_participants (
  hangout_id uuid not null references public.hangouts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  primary key (hangout_id, user_id)
);
-- The exclusion constraint is the final guard even if a future code path omits locks.
create table public.booking_reservations (
  hangout_id uuid not null references public.hangouts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  during tstzrange not null,
  primary key (hangout_id, user_id),
  exclude using gist (user_id with =, during with &&)
);
create table public.feedback (
  id uuid primary key,
  hangout_id uuid not null references public.hangouts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  meet_again boolean not null,
  comments text not null default '',
  created_at timestamptz not null default now(),
  unique (hangout_id, user_id),
  foreign key (hangout_id, user_id) references public.hangout_participants(hangout_id, user_id)
);
create index availability_user_time on public.availability_blocks(user_id, start_time, end_time);
create index memories_user on public.preference_memories(user_id);
create index participants_user on public.hangout_participants(user_id);
create index feedback_user on public.feedback(user_id);
create index connection_other on public.connections(other_id);

alter table public.users enable row level security;
alter table public.preference_memories enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.connections enable row level security;
alter table public.hangouts enable row level security;
alter table public.hangout_participants enable row level security;
alter table public.booking_reservations enable row level security;
alter table public.feedback enable row level security;
create policy own_user on public.users for select to authenticated using ((select auth.uid()) = id);
create policy own_memories on public.preference_memories for select to authenticated using ((select auth.uid()) = user_id);
create policy own_availability on public.availability_blocks for select to authenticated using ((select auth.uid()) = user_id);
create policy own_connections on public.connections for select to authenticated using ((select auth.uid()) = user_id);
create policy own_feedback on public.feedback for select to authenticated using ((select auth.uid()) = user_id);
create policy own_participation on public.hangout_participants for select to authenticated using ((select auth.uid()) = user_id);
create policy participant_hangouts on public.hangouts for select to authenticated using (exists (select 1 from public.hangout_participants p where p.hangout_id = id and p.user_id = (select auth.uid())));
-- Writes are exclusively through trusted server routes, never browser clients.
revoke all on public.users, public.preference_memories, public.availability_blocks, public.connections, public.hangouts, public.hangout_participants, public.booking_reservations, public.feedback from anon, authenticated;
grant select on public.users, public.preference_memories, public.availability_blocks, public.connections, public.hangouts, public.hangout_participants, public.feedback to authenticated;
grant all on public.users, public.preference_memories, public.availability_blocks, public.connections, public.hangouts, public.hangout_participants, public.booking_reservations, public.feedback to service_role;

create function public.save_convene_profile(p_user_id uuid, p_profile jsonb, p_summary text, p_memories jsonb, p_embedding text)
returns void language plpgsql set search_path = public, extensions as $$
declare m jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  insert into users(id, auth_id, profile, summary, profile_embedding)
  values (p_user_id, p_user_id, p_profile, p_summary, p_embedding::vector)
  on conflict(id) do update set profile = excluded.profile, summary = excluded.summary, profile_embedding = excluded.profile_embedding;
  delete from preference_memories where user_id = p_user_id and content->>'source' = 'onboarding';
  for m in select * from jsonb_array_elements(p_memories) loop
    insert into preference_memories(id, user_id, content) values ((m->>'id')::uuid, p_user_id, m) on conflict(id) do nothing;
  end loop;
end;
$$;

create function public.schedule_convene_hangout(p_user_id uuid, p_hangout jsonb)
returns void language plpgsql set search_path = public, extensions as $$
declare participant uuid; participant_ids uuid[]; start_at timestamptz; end_at timestamptz; desired_mode text;
begin
  select array_agg(value::uuid order by value) into participant_ids from jsonb_array_elements_text(p_hangout->'participantIds');
  if cardinality(participant_ids) <> 2 or not (p_user_id = any(participant_ids)) or participant_ids[1] = participant_ids[2] then raise exception 'schedule_conflict'; end if;
  start_at := (p_hangout->>'start')::timestamptz;
  end_at := (p_hangout->>'end')::timestamptz;
  desired_mode := case when (p_hangout->>'seededVenue')::boolean then 'in_person' else 'online' end;
  if start_at < now() or end_at <= start_at then raise exception 'schedule_conflict'; end if;
  foreach participant in array participant_ids loop
    perform pg_advisory_xact_lock(hashtextextended(participant::text, 0));
    -- Row locks keep an availability deletion from racing finalization.
    perform 1 from availability_blocks a where a.user_id = participant and a.start_time <= start_at and a.end_time >= end_at and a.mode in ('either', desired_mode) for update;
    if not found then raise exception 'schedule_conflict'; end if;
    if exists (select 1 from booking_reservations b where b.user_id = participant and b.during && tstzrange(start_at, end_at, '[)')) then raise exception 'schedule_conflict'; end if;
  end loop;
  if exists(select 1 from connections c where c.user_id = any(participant_ids) and c.other_id = any(participant_ids) and c.status in ('blocked', 'declined')) then raise exception 'schedule_conflict'; end if;
  insert into hangouts(id, activity_id, start_time, end_time, reason, score, seeded_venue)
  values ((p_hangout->>'id')::uuid, p_hangout->>'activityId', start_at, end_at, p_hangout->>'reason', (p_hangout->>'score')::integer, (p_hangout->>'seededVenue')::boolean);
  foreach participant in array participant_ids loop
    insert into hangout_participants(hangout_id, user_id) values ((p_hangout->>'id')::uuid, participant);
    insert into booking_reservations(hangout_id, user_id, during) values ((p_hangout->>'id')::uuid, participant, tstzrange(start_at, end_at, '[)'));
  end loop;
exception when exclusion_violation then raise exception 'schedule_conflict';
end;
$$;

create function public.release_cancelled_booking() returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'cancelled' then delete from booking_reservations where hangout_id = new.id; end if;
  return new;
end;
$$;
create trigger release_booking after update of status on public.hangouts for each row execute function public.release_cancelled_booking();

create function public.submit_convene_feedback(p_user_id uuid, p_feedback jsonb, p_memory jsonb)
returns void language plpgsql set search_path = public as $$
declare h hangouts%rowtype; other_user uuid;
begin
  select * into h from hangouts where id = (p_feedback->>'hangoutId')::uuid for update;
  if h.id is null or h.status = 'cancelled' or h.end_time > now() or not exists (select 1 from hangout_participants where hangout_id = h.id and user_id = p_user_id) then raise exception 'feedback_not_allowed'; end if;
  if exists (select 1 from feedback where hangout_id = h.id and user_id = p_user_id) then raise exception 'duplicate_feedback'; end if;
  insert into feedback(id, hangout_id, user_id, rating, meet_again, comments)
  values ((p_feedback->>'id')::uuid, h.id, p_user_id, (p_feedback->>'rating')::integer, (p_feedback->>'meetAgain')::boolean, p_feedback->>'comments');
  update hangouts set status = 'completed' where id = h.id;
  if p_memory is not null then insert into preference_memories(id, user_id, content) values ((p_memory->>'id')::uuid, p_user_id, p_memory); end if;
  for other_user in select user_id from hangout_participants where hangout_id = h.id and user_id <> p_user_id loop
    insert into connections(user_id, other_id, status, hangout_count) values (p_user_id, other_user, case when (p_feedback->>'meetAgain')::boolean then 'met' else 'declined' end, 1)
    on conflict(user_id, other_id) do update set hangout_count = connections.hangout_count + 1,
      status = case when connections.status = 'blocked' then 'blocked' when not (p_feedback->>'meetAgain')::boolean then 'declined' else connections.status end;
  end loop;
end;
$$;

revoke all on function public.save_convene_profile(uuid,jsonb,text,jsonb,text) from public, anon, authenticated;
revoke all on function public.schedule_convene_hangout(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.submit_convene_feedback(uuid,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.release_cancelled_booking() from public, anon, authenticated;
grant execute on function public.save_convene_profile(uuid,jsonb,text,jsonb,text) to service_role;
grant execute on function public.schedule_convene_hangout(uuid,jsonb) to service_role;
grant execute on function public.submit_convene_feedback(uuid,jsonb,jsonb) to service_role;

-- Share participant locks with the scheduler, making block + cancel atomic.
create function public.manage_convene_connection(p_user_id uuid, p_other_id uuid, p_status text)
returns void language plpgsql set search_path = public as $$
declare participant uuid;
begin
  if p_user_id = p_other_id or p_status not in ('friend', 'blocked') then raise exception 'invalid_connection'; end if;
  for participant in select unnest(array[p_user_id,p_other_id]) order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(participant::text, 0));
  end loop;
  if not exists(select 1 from hangout_participants a join hangout_participants b on a.hangout_id=b.hangout_id where a.user_id=p_user_id and b.user_id=p_other_id) then raise exception 'invalid_connection'; end if;
  if p_status='friend' and exists(select 1 from connections where user_id=p_user_id and other_id=p_other_id and status='blocked') then raise exception 'invalid_connection'; end if;
  insert into connections(user_id,other_id,status) values(p_user_id,p_other_id,p_status)
  on conflict(user_id,other_id) do update set status=excluded.status;
  if p_status='blocked' then
    update hangouts set status='cancelled' where status='scheduled' and end_time>now() and id in (
      select a.hangout_id from hangout_participants a join hangout_participants b on a.hangout_id=b.hangout_id where a.user_id=p_user_id and b.user_id=p_other_id
    );
  end if;
end;
$$;
revoke all on function public.manage_convene_connection(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.manage_convene_connection(uuid,uuid,text) to service_role;
