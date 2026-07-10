-- Add an optional portfolio banner to creative profiles.
alter table public.creative_members
  add column if not exists cover_image text;

notify pgrst, 'reload schema';
