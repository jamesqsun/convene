-- Extensions and shared helpers.
create extension if not exists vector;
create extension if not exists btree_gist;

-- Keeps updated_at honest without every write path remembering to set it.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- The UTC bounds of a calendar day in a named time zone, as a half-open range.
-- Built from wall-clock conversions rather than "date + 24 hours" so DST days are 23 or 25 hours.
create or replace function local_day_bounds(p_date date, p_timezone text) returns tstzrange
language sql immutable as $$
  select tstzrange(
    (p_date::timestamp) at time zone p_timezone,
    ((p_date + 1)::timestamp) at time zone p_timezone,
    '[)'
  )
$$;
