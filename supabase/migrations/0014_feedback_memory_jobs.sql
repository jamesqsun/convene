alter table event_feedback
  add column memory_attempts int not null default 0,
  add column memory_next_attempt_at timestamptz not null default now(),
  add column memory_lease_until timestamptz,
  add column memory_claim_id uuid;
create index event_feedback_pending_idx on event_feedback (memory_next_attempt_at)
  where not memories_updated;
