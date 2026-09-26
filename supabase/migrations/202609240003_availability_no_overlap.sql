-- Apply after automatic_slots. Existing overlapping active slots must be
-- resolved first; this migration never deletes slots or cancels assigned plans.
-- Diagnose conflicts with the query documented in README.md.
begin;
set local search_path = public, extensions;
lock table public.availability_blocks in access exclusive mode;
do $$
begin
  if exists (
    select 1 from public.availability_blocks a
    join public.availability_blocks b
      on a.user_id=b.user_id and a.id<b.id and a.during && b.during
    where a.status in ('pending','paused','filled')
      and b.status in ('pending','paused','filled')
  ) then
    raise exception 'availability_no_overlap: resolve existing overlapping active slots before applying this migration (see README)';
  end if;
end $$;
alter table public.availability_blocks
  add constraint availability_no_overlap
  exclude using gist (user_id with =, during with &&)
  where (status in ('pending','paused','filled'));
commit;
