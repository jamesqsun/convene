alter table interest_prompts add column city_key text;
alter table interest_prompts add column source_url text;
create table city_interest_jobs (
  city_key text not null,
  local_date date not null,
  city_name text not null,
  timezone text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0,
  claim_id uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  prompt_id uuid references interest_prompts(id) on delete set null,
  last_error text,
  primary key (city_key, local_date)
);
alter table city_interest_jobs enable row level security;
create index city_interest_jobs_due on city_interest_jobs(next_attempt_at) where status in ('pending', 'running', 'failed');
