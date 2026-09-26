-- Google Calendar integration and weekly availability.

-- One connected Google account per person. Tokens are encrypted by the server before storage.
create table calendar_connections (
  user_id uuid primary key references profiles(id) on delete cascade,
  provider text not null default 'google' check (provider in ('google', 'fake')),
  account_email text not null,
  refresh_token_encrypted text not null,
  access_token_encrypted text,
  access_token_expires_at timestamptz,
  -- The dedicated "Convene" calendar in the person's account that receives matched hangouts.
  convene_calendar_id text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger calendar_connections_set_updated_at
  before update on calendar_connections
  for each row execute function set_updated_at();

-- The person's calendars, with which ones count as busy.
create table calendar_sources (
  user_id uuid not null references profiles(id) on delete cascade,
  calendar_id text not null,
  summary text not null,
  is_primary boolean not null default false,
  is_selected boolean not null default true,
  color text,
  primary key (user_id, calendar_id)
);

-- Cached busy intervals from selected calendars, owner-only. Refreshed by sync.
create table busy_blocks (
  user_id uuid not null references profiles(id) on delete cascade,
  calendar_id text not null,
  external_id text not null,
  summary text not null default '',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  is_all_day boolean not null default false,
  primary key (user_id, calendar_id, external_id),
  check (starts_at < ends_at)
);

create index busy_blocks_user_time_idx on busy_blocks (user_id, starts_at, ends_at);

-- Which weeks a person has availability for, and whether they set it or it was carried forward.
create table availability_weeks (
  user_id uuid not null references profiles(id) on delete cascade,
  -- Monday of the week in the person's city time zone.
  week_start date not null,
  status text not null check (status in ('confirmed', 'auto')),
  -- The week the pattern was copied from, when status is auto.
  copied_from date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

create trigger availability_weeks_set_updated_at
  before update on availability_weeks
  for each row execute function set_updated_at();

-- Off switches automatic carry-forward of last week's availability.
alter table profiles add column is_repeating_availability boolean not null default true;

-- A matched hangout written into the person's Convene calendar.
create table event_calendar_entries (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  calendar_id text not null,
  external_event_id text not null,
  status text not null check (status in ('created', 'cancelled', 'failed')),
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

do $$
declare
  t text;
begin
  for t in select unnest(array['calendar_connections', 'calendar_sources', 'busy_blocks', 'availability_weeks', 'event_calendar_entries']) loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
