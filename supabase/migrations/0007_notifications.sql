-- Web push subscriptions and the post-commit notification queue.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  failure_count int not null default 0,
  -- Set when the push service reports the subscription gone (404/410).
  retired_at timestamptz,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on push_subscriptions (user_id) where retired_at is null;

-- Written inside the same transaction as the assignment or withdrawal; sent after commit.
create table notification_jobs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  type text not null check (type in ('assignment', 'participant_left', 'cancellation')),
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Deduplication: one job per event, recipient, and type.
  unique (event_id, recipient_id, type)
);

create index notification_jobs_due_idx on notification_jobs (next_attempt_at) where status = 'pending';

-- Per-device delivery outcome for a job.
create table notification_deliveries (
  job_id uuid not null references notification_jobs(id) on delete cascade,
  subscription_id uuid not null references push_subscriptions(id) on delete cascade,
  status text not null check (status in ('sent', 'failed', 'retired')),
  attempts int not null default 1,
  last_status_code int,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (job_id, subscription_id)
);
