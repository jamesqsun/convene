-- Dated availability. Saving a slot authorizes a later batch; it never books anything itself.

create table availability_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  -- Half-open [start, end) in UTC.
  "window" tstzrange not null,
  starts_at timestamptz generated always as (lower("window")) stored,
  ends_at timestamptz generated always as (upper("window")) stored,
  -- Snapshot of the owner's city time zone when the slot was saved.
  timezone text not null,
  status text not null default 'pending'
    check (status in ('pending', 'filled', 'paused', 'expired', 'cancelled')),
  -- Bumped on every edit and on fill so stale planning snapshots are rejected at commit.
  revision int not null default 1,
  assigned_event_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    lower_inc("window") and not upper_inc("window")
    and lower("window") is not null and upper("window") is not null
    and not isempty("window")
  ),
  check (status <> 'filled' or assigned_event_id is not null),
  -- One person's live slots may touch but never overlap; concurrent inserts are covered too.
  exclude using gist (user_id with =, "window" with &&)
    where (status in ('pending', 'paused', 'filled'))
);

create index availability_slots_pending_window_idx
  on availability_slots using gist ("window") where status = 'pending';

create index availability_slots_owner_idx on availability_slots (user_id, starts_at);

create trigger availability_slots_set_updated_at
  before update on availability_slots
  for each row execute function set_updated_at();
