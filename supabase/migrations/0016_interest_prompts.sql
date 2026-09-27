create table interest_prompts (
  id uuid primary key,
  text text not null check (length(btrim(text)) between 1 and 400),
  created_at timestamptz not null default now()
);
create table interest_responses (
  prompt_id uuid not null references interest_prompts(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  answer text check (answer in ('yes', 'no')),
  answered_at timestamptz,
  memories_updated boolean not null default false,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  claim_id uuid,
  primary key (prompt_id, user_id)
);
alter table interest_prompts enable row level security;
alter table interest_responses enable row level security;
create index interest_responses_pending_idx on interest_responses(next_attempt_at)
  where answer is not null and not memories_updated;
alter table notification_jobs alter column event_id drop not null;
alter table notification_jobs add column prompt_id uuid references interest_prompts(id) on delete cascade;
alter table notification_jobs drop constraint notification_jobs_type_check;
alter table notification_jobs add constraint notification_jobs_type_check
  check (type in ('assignment', 'participant_left', 'cancellation', 'feedback_reminder', 'interest_prompt'));
alter table notification_jobs add constraint notification_jobs_target_check check (
  (type = 'interest_prompt' and prompt_id is not null and event_id is null) or
  (type <> 'interest_prompt' and event_id is not null and prompt_id is null)
);
create unique index notification_jobs_prompt_recipient_idx on notification_jobs(prompt_id, recipient_id, type)
  where prompt_id is not null;
alter table preference_memories drop constraint preference_memories_source_check;
alter table preference_memories add constraint preference_memories_source_check
  check (source in ('onboarding', 'seed', 'event_feedback', 'interest_prompt'));
