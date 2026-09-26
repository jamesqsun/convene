-- Committed hangouts. Completion is derived: status = 'scheduled' and ends_at <= now().

create table events (
  id uuid primary key default gen_random_uuid(),
  planning_id text not null unique references planning_proposals(planning_id),
  city_key text not null,
  timezone text not null,
  local_date date not null,
  activity_id text not null,
  activity_name text not null,
  duration_minutes int not null check (duration_minutes > 0),
  -- Built from public interests only; never contains another participant's private data.
  explanation text not null default '',
  -- { provider, place_id, name, address, lat, lng, hours_verified }
  venue jsonb not null check (jsonb_typeof(venue) = 'object'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create index events_ends_at_idx on events (ends_at) where status = 'scheduled';

-- Membership history. withdrawn_at is set when someone leaves; the row stays for audit.
create table event_participants (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  -- One event per source slot.
  slot_id uuid not null unique references availability_slots(id),
  withdrawn_at timestamptz,
  primary key (event_id, user_id)
);

create index event_participants_user_idx on event_participants (user_id);

-- Active bookings only; a row is deleted when the participant is released.
create table participant_reservations (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  "window" tstzrange not null,
  primary key (event_id, user_id),
  -- No person can be booked into overlapping events, across dates and batches.
  exclude using gist (user_id with =, "window" with &&)
);

-- One assigned event per person per city-local planning date. Rows are deleted on release.
create table user_date_assignments (
  user_id uuid not null references profiles(id) on delete cascade,
  local_date date not null,
  event_id uuid not null references events(id) on delete cascade,
  primary key (user_id, local_date)
);

alter table availability_slots
  add constraint availability_slots_assigned_event_fk
  foreign key (assigned_event_id) references events(id);
