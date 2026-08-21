begin;

insert into public.website_studio_entries (entry_key, entry_type, published_data)
values (
  'page.discover',
  'page',
  '{"eyebrow":"Discover","title":"Find Creative work from Aklan.","description":"Browse selected work by discipline, specialty, industry, or the idea you have in mind."}'::jsonb
)
on conflict (entry_key) do nothing;

update public.website_studio_entries
set published_data = '{"workEyebrow":"Curated from Aklan","workTitle":"Selected work","creativesEyebrow":"People behind the work","creativesTitle":"Meet the Creatives","creativesDescription":"Open a portfolio to see selected work and availability."}'::jsonb || published_data,
    draft_data = case when draft_data is null then null else '{"workEyebrow":"Curated from Aklan","workTitle":"Selected work","creativesEyebrow":"People behind the work","creativesTitle":"Meet the Creatives","creativesDescription":"Open a portfolio to see selected work and availability."}'::jsonb || draft_data end,
    updated_at = now()
where entry_key = 'page.home';

commit;
