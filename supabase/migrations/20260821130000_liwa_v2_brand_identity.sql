begin;

insert into public.website_studio_entries (entry_key, entry_type, published_data)
values (
  'global.brand',
  'global',
  '{"logoUrl":"/brand/liwa-collectives-v2.png","logoAlt":"Liwa Collectives logo"}'::jsonb
)
on conflict (entry_key) do update
set published_data = public.website_studio_entries.published_data || excluded.published_data,
    draft_data = case
      when public.website_studio_entries.draft_data is null then null
      else public.website_studio_entries.draft_data || excluded.published_data
    end,
    updated_at = now();

insert into public.website_studio_entries (entry_key, entry_type, published_data)
values (
  'global.appearance',
  'global',
  '{"primaryTextColor":"#f7f7f4","secondaryTextColor":"#b6bfc1","mutedTextColor":"#939c9d","accentColor":"#f3a257","dividerLineColor":"#445241"}'::jsonb
)
on conflict (entry_key) do update
set published_data = public.website_studio_entries.published_data || excluded.published_data,
    draft_data = case
      when public.website_studio_entries.draft_data is null then null
      else public.website_studio_entries.draft_data || excluded.published_data
    end,
    updated_at = now();

commit;
