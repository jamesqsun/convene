-- Profiles and generated preference memories.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check (length(name) <= 80),
  age int check (age between 18 and 120),
  -- Normalized city snapshot from the city picker. The time zone is the planning zone.
  city_key text,
  city_name text,
  city_timezone text,
  city_lat double precision,
  city_lng double precision,
  -- Private. Shown only to co-participants of an assigned, non-cancelled event.
  phone_e164 text check (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  interests text[] not null default '{}',
  -- Raw onboarding answers: owner-only, the source memories are generated from.
  onboarding_answers jsonb not null default '[]' check (jsonb_typeof(onboarding_answers) = 'array'),
  onboarding_completed_at timestamptz,
  profile_embedding vector(1536),
  -- Set whenever memories change so the next planning pass refreshes derived data first.
  embedding_stale boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((city_key is null) = (city_timezone is null)),
  check (
    onboarding_completed_at is null
    or (name <> '' and age is not null and city_key is not null and phone_e164 is not null)
  )
);

create index profiles_city_idx on profiles (city_key) where onboarding_completed_at is not null;

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create table preference_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  topic text not null check (length(topic) between 1 and 80),
  summary text not null check (length(summary) between 1 and 500),
  -- Verbatim fragments of the owner's answers that support this memory.
  evidence text[] not null default '{}',
  attributes jsonb not null default '{}' check (jsonb_typeof(attributes) = 'object'),
  confidence real not null check (confidence between 0 and 1),
  source text not null check (source in ('onboarding', 'seed')),
  -- Set when the owner edits; edited text is never presented as a verbatim answer.
  edited_at timestamptz,
  embedding vector(1536),
  embedding_stale boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index preference_memories_user_idx on preference_memories (user_id);

create trigger preference_memories_set_updated_at
  before update on preference_memories
  for each row execute function set_updated_at();

-- Any change to a memory's meaning invalidates the owner's derived profile embedding.
create or replace function mark_profile_embedding_stale() returns trigger
language plpgsql as $$
begin
  update profiles set embedding_stale = true where id = coalesce(new.user_id, old.user_id);
  return null;
end $$;

create trigger preference_memories_mark_stale
  after insert or delete or update of topic, summary, evidence, attributes, confidence
  on preference_memories
  for each row execute function mark_profile_embedding_stale();
