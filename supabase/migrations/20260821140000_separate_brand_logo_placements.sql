begin;

insert into public.website_studio_entries (entry_key, entry_type, published_data)
values (
  'global.brand',
  'global',
  '{"headerLogoUrl":"/brand/liwa-standalone-v2.png","headerLogoAlt":"Liwa Collectives symbol","footerLogoUrl":"/brand/liwa-collectives-v2.png","footerLogoAlt":"Liwa Collectives full logo"}'::jsonb
)
on conflict (entry_key) do update
set published_data = public.website_studio_entries.published_data || excluded.published_data,
    draft_data = case
      when public.website_studio_entries.draft_data is null then null
      else public.website_studio_entries.draft_data || excluded.published_data
    end,
    updated_at = now();

commit;
