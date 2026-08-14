begin;

alter table public.creative_members
  add column if not exists location text;

alter table public.creative_members
  drop constraint if exists creative_members_location_length;

alter table public.creative_members
  add constraint creative_members_location_length
  check (location is null or char_length(btrim(location)) <= 160);

notify pgrst, 'reload schema';
commit;
