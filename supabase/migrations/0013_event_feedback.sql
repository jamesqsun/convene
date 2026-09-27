-- Private overall feedback, separate from per-person friendship answers.
create table event_feedback (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  text text not null check (length(btrim(text)) between 1 and 2000),
  memories_updated boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table event_feedback enable row level security;
alter table preference_memories drop constraint preference_memories_source_check;
alter table preference_memories add constraint preference_memories_source_check
  check (source in ('onboarding', 'seed', 'event_feedback'));
