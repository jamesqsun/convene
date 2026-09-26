-- Per-person post-hangout feedback and the friendships it creates.

create table participant_feedback (
  event_id uuid not null references events(id) on delete cascade,
  author_id uuid not null references profiles(id) on delete cascade,
  subject_id uuid not null references profiles(id) on delete cascade,
  -- "Would you want to meet this person again?" Immutable once written.
  meet_again boolean not null,
  created_at timestamptz not null default now(),
  primary key (event_id, author_id, subject_id),
  check (author_id <> subject_id)
);

create index participant_feedback_subject_idx on participant_feedback (subject_id, event_id);

-- One row per unordered pair, created only when both answered yes about each other for the
-- same completed event. Never created manually.
create table friendships (
  user_a uuid not null references profiles(id) on delete cascade,
  user_b uuid not null references profiles(id) on delete cascade,
  provenance_event_id uuid not null references events(id),
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create index friendships_user_b_idx on friendships (user_b);
