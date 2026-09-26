-- Apply after 202609240001_initial.sql. No external scheduler is installed by this migration.
set search_path = public, extensions;
alter table availability_blocks
  add column during tstzrange generated always as (tstzrange(start_time,end_time,'[)')) stored,
  add column status text not null default 'pending' check(status in ('pending','filled','paused','expired','cancelled')),
  add column interests text[] not null default '{}',
  add column goals text[] not null default '{}' check(goals <@ array['new','friends']::text[]),
  add column revision integer not null default 1,
  add column hangout_id uuid references hangouts(id);
-- Previously saved windows did not explicitly authorize automatic matching.
update availability_blocks set status='paused' where user_id in (select id from users where not seeded);
create index availability_pending_overlap on availability_blocks using gist(during) where status='pending';
create index availability_expiration on availability_blocks(end_time) where status in ('pending','paused');
create index availability_assigned_event on availability_blocks(hangout_id) where hangout_id is not null;
-- Native point GiST supplies a conservative geographic shortlist without an
-- additional extension. The worker checks exact great-circle distances afterwards.
alter table users add column location_point point generated always as (
  case when profile->'location'->>'longitude' is not null and profile->'location'->>'latitude' is not null
    then point((profile->'location'->>'longitude')::float8,(profile->'location'->>'latitude')::float8) end
) stored;
create index users_location_gist on users using gist(location_point);
create function nearby_user_ids(p_user uuid) returns setof uuid language sql stable set search_path=public as $$
  with origin as (
    select location_point[0] as lon,location_point[1] as lat,
      (profile->>'radiusKm')::float8/110.0 as dy,
      least(180.0,(profile->>'radiusKm')::float8/(110.0*greatest(0.000001,cos(radians(location_point[1]))))) as dx
    from users where id=p_user and location_point is not null
  )
  select u.id from origin o join users u on
    u.location_point <@ box(point(o.lon-o.dx,o.lat-o.dy),point(o.lon+o.dx,o.lat+o.dy))
    or u.location_point <@ box(point(o.lon-360-o.dx,o.lat-o.dy),point(o.lon-360+o.dx,o.lat+o.dy))
    or u.location_point <@ box(point(o.lon+360-o.dx,o.lat-o.dy),point(o.lon+360+o.dx,o.lat+o.dy))
$$;

create table matching_jobs (
  slot_id uuid not null references availability_blocks(id) on delete cascade,
  revision integer not null,
  state text not null default 'ready' check(state in ('ready','processing','done','failed')),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  token uuid,
  attempts integer not null default 0,
  cursor_id uuid,
  primary key(slot_id, revision)
);
create index matching_jobs_ready on matching_jobs(next_attempt_at,slot_id) where state='ready';
create index matching_jobs_leases on matching_jobs(lease_until) where state='processing';
alter table matching_jobs enable row level security;
revoke all on matching_jobs from public,anon,authenticated;
grant all on matching_jobs to service_role;

create function slot_revision() returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='UPDATE' then new.revision := old.revision+1; end if;
  return new;
end $$;
create trigger availability_revision before update on availability_blocks for each row execute function slot_revision();
create function enqueue_slot() returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='pending' and new.end_time>now() and exists(select 1 from users where id=new.user_id and not seeded) then
    insert into matching_jobs(slot_id,revision) values(new.id,new.revision) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger availability_enqueue after insert or update on availability_blocks for each row execute function enqueue_slot();
create function refresh_profile_slots() returns trigger language plpgsql set search_path=public as $$
begin
  if new.profile is distinct from old.profile then
    update availability_blocks set status=status where user_id=new.id and status='pending';
  end if;
  return new;
end $$;
create trigger profile_matching after update of profile on users for each row execute function refresh_profile_slots();
create function refresh_connection_slots() returns trigger language plpgsql set search_path=public as $$
begin
  update availability_blocks set status=status where user_id in (new.user_id,new.other_id) and status='pending';
  return new;
end $$;
create trigger connection_matching after insert or update on connections for each row execute function refresh_connection_slots();

create function claim_matching_job() returns setof matching_jobs language plpgsql set search_path=public as $$
begin
  -- Recovery works even when a worker was terminated after taking a lease.
  update matching_jobs set state='ready',token=null,lease_until=null
    where state='processing' and lease_until<now();
  update availability_blocks set status='expired' where status in ('pending','paused') and end_time<=now();
  update matching_jobs j set state='done' where state in ('ready','failed') and not exists(
    select 1 from availability_blocks a where a.id=j.slot_id and a.revision=j.revision and a.status='pending' and a.end_time>now());
  -- Failed jobs are retried in a later recovery cycle, never in a tight loop.
  update matching_jobs set state='ready',attempts=0 where state='failed' and next_attempt_at<=now();
  return query
    with candidate as (
      select j.slot_id,j.revision from matching_jobs j where j.state='ready' and j.next_attempt_at<=now()
      order by j.next_attempt_at,j.slot_id for update skip locked limit 1
    ) update matching_jobs j set state='processing',token=gen_random_uuid(),lease_until=now()+interval '2 minutes',attempts=j.attempts+1
      from candidate c where j.slot_id=c.slot_id and j.revision=c.revision returning j.*;
end $$;

create function finish_matching_job(p_slot uuid,p_revision integer,p_token uuid,p_cursor uuid,p_failed boolean default false)
returns void language plpgsql set search_path=public as $$
begin
  update matching_jobs j set
    state=case when not exists(select 1 from availability_blocks a where a.id=p_slot and a.revision=p_revision and a.status='pending') then 'done'
      when p_failed and attempts>=5 then 'failed' else 'ready' end,
    next_attempt_at=now()+case when p_failed and attempts>=5 then interval '30 minutes'
      when p_failed then interval '30 seconds'*least(attempts,5)
      when p_cursor is null then interval '5 minutes' else interval '0 seconds' end,
    cursor_id=case when p_failed then j.cursor_id else p_cursor end,
    attempts=case when p_failed then attempts else 0 end, token=null,lease_until=null
  where slot_id=p_slot and revision=p_revision and token=p_token and state='processing';
end $$;

-- Index-assisted overlap search; a full page continues from its last ID on the next job.
create function matching_candidates(p_slot uuid,p_revision integer,p_after uuid default null)
returns setof availability_blocks language sql stable set search_path=public as $$
  select b.* from availability_blocks a join availability_blocks b on b.during && a.during
  where a.id=p_slot and a.revision=p_revision and a.status='pending' and a.end_time>now()
    and b.status='pending' and b.end_time>now() and b.user_id<>a.user_id
    and (p_after is null or b.id>p_after)
    and (a.mode='either' or b.mode='either' or a.mode=b.mode)
    and ((a.mode in ('online','either') and b.mode in ('online','either')) or b.user_id in (select nearby_user_ids(a.user_id)))
    and (cardinality(a.interests)=0 or cardinality(b.interests)=0 or a.interests && b.interests)
    and not exists(select 1 from connections c where ((c.user_id=a.user_id and c.other_id=b.user_id) or (c.user_id=b.user_id and c.other_id=a.user_id)) and c.status in ('blocked','declined'))
  order by b.id limit 100
$$;

-- Trusted worker supplies the exact profiles and revisions it scored. Any change
-- invalidates the proposal; existing scheduler enforces participant locks and exclusions.
create function schedule_convene_slots(p_user_id uuid,p_hangout jsonb,p_slots jsonb,p_profiles jsonb)
returns void language plpgsql set search_path=public,extensions as $$
declare participant uuid; s availability_blocks%rowtype; expected jsonb; owner_ids uuid[]; slot_ids uuid[];
begin
  select array_agg(value::uuid order by value) into owner_ids from jsonb_array_elements_text(p_hangout->'participantIds');
  select array_agg((value->>'id')::uuid order by value->>'id') into slot_ids from jsonb_array_elements(p_slots);
  if cardinality(owner_ids)<>2 or owner_ids[1]=owner_ids[2] or cardinality(slot_ids)<>2 or slot_ids[1]=slot_ids[2] then raise exception 'schedule_conflict'; end if;
  foreach participant in array owner_ids loop
    perform pg_advisory_xact_lock(hashtextextended(participant::text,0));
    perform 1 from users where id=participant and profile=p_profiles->participant::text for update;
    if not found then raise exception 'schedule_conflict'; end if;
  end loop;
  perform 1 from availability_blocks where id=any(slot_ids) order by id for update;
  foreach participant in array owner_ids loop
    select * into s from availability_blocks where id=any(slot_ids) and user_id=participant;
    select value into expected from jsonb_array_elements(p_slots) where value->>'id'=s.id::text;
    if s.id is null or s.status<>'pending' or s.revision<>(expected->>'revision')::integer
      or not(s.during @> tstzrange((p_hangout->>'start')::timestamptz,(p_hangout->>'end')::timestamptz,'[)')) then raise exception 'schedule_conflict'; end if;
    if cardinality(s.goals)>0 and not (
      ('friends'=any(s.goals) and exists(select 1 from connections where user_id=participant and other_id=any(owner_ids) and status='friend'))
      or ('new'=any(s.goals) and not exists(select 1 from connections where user_id=any(owner_ids) and other_id=any(owner_ids) and status in ('friend','met'))
        and not exists(select 1 from hangout_participants a join hangout_participants b using(hangout_id) join hangouts h on h.id=a.hangout_id where a.user_id=owner_ids[1] and b.user_id=owner_ids[2] and h.status<>'cancelled'))
    ) then raise exception 'schedule_conflict'; end if;
  end loop;
  perform schedule_convene_hangout(p_user_id,p_hangout);
  update availability_blocks set status='filled',hangout_id=(p_hangout->>'id')::uuid where id=any(slot_ids);
end $$;

create function cancel_assigned_slots() returns trigger language plpgsql set search_path=public as $$
begin
  if new.status='cancelled' and old.status<>'cancelled' then
    update availability_blocks set status='cancelled' where hangout_id=new.id and status='filled';
  end if;
  return new;
end $$;
create trigger cancel_slots after update of status on hangouts for each row execute function cancel_assigned_slots();

-- Ownership, lifecycle transitions, and the scheduler share participant locks.
create function update_convene_slot(p_user uuid,p_slot uuid,p_status text,p_block jsonb default null)
returns void language plpgsql set search_path=public as $$
declare s availability_blocks%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
  select * into s from availability_blocks where id=p_slot and user_id=p_user for update;
  if s.id is null or s.status='filled' or (p_status<>'cancelled' and s.end_time<=now())
    or p_status not in ('pending','paused','cancelled') then raise exception 'schedule_conflict'; end if;
  update availability_blocks set status=p_status,hangout_id=null,
    start_time=coalesce((p_block->>'start')::timestamptz,start_time),
    end_time=coalesce((p_block->>'end')::timestamptz,end_time),
    mode=coalesce(p_block->>'mode',mode),
    interests=case when p_block is null then interests else array(select jsonb_array_elements_text(p_block->'interests')) end,
    goals=case when p_block is null then goals else array(select jsonb_array_elements_text(p_block->'goals')) end
  where id=p_slot;
end $$;

revoke all on function nearby_user_ids(uuid),slot_revision(),enqueue_slot(),refresh_profile_slots(),refresh_connection_slots(),cancel_assigned_slots(),claim_matching_job(),finish_matching_job(uuid,integer,uuid,uuid,boolean),matching_candidates(uuid,integer,uuid),schedule_convene_slots(uuid,jsonb,jsonb,jsonb),update_convene_slot(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function nearby_user_ids(uuid),claim_matching_job(),finish_matching_job(uuid,integer,uuid,uuid,boolean),matching_candidates(uuid,integer,uuid),schedule_convene_slots(uuid,jsonb,jsonb,jsonb),update_convene_slot(uuid,uuid,text,jsonb) to service_role;
