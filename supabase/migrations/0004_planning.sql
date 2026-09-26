-- Durable batch state so planning survives crashes and retries reproduce the same decisions.

create table planning_batches (
  id uuid primary key default gen_random_uuid(),
  city_key text not null,
  timezone text not null,
  local_date date not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  -- A pass is one run over the city/date: the main pass, then hourly catch-up passes.
  pass int not null default 0,
  lease_owner text,
  lease_expires_at timestamptz,
  attempts int not null default 0,
  -- Persisted per pass so retries score with the same clock and the same history snapshot.
  scoring_time timestamptz,
  snapshot jsonb,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_key, local_date)
);

create index planning_batches_lease_idx on planning_batches (status, lease_expires_at);

create trigger planning_batches_set_updated_at
  before update on planning_batches
  for each row execute function set_updated_at();

-- A proposed group. The stable planning_id makes commit idempotent across crash retries.
create table planning_proposals (
  planning_id text primary key,
  batch_id uuid not null references planning_batches(id) on delete cascade,
  pass int not null,
  -- [{ user_id, slot_id, revision }]
  members jsonb not null check (jsonb_typeof(members) = 'array'),
  shared_start timestamptz not null,
  shared_end timestamptz not null,
  -- Filled once activity, venue, and exact time are chosen (see commit_group_event).
  plan jsonb,
  status text not null default 'proposed'
    check (status in ('proposed', 'planned', 'committed', 'failed')),
  event_id uuid,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (shared_start < shared_end)
);

create index planning_proposals_batch_idx on planning_proposals (batch_id, status);

create trigger planning_proposals_set_updated_at
  before update on planning_proposals
  for each row execute function set_updated_at();
