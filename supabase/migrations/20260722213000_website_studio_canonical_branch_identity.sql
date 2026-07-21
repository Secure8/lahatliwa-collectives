begin;

with candidate as (
  select entry_key, published_data as before_data
  from public.website_studio_entries
  where entry_key = 'branch.tech'
    and published_data->>'name' in ('Liwa Tech', 'Liwa Discovery')
  for update
), normalized as (
  update public.website_studio_entries entry
  set published_data = jsonb_set(
        jsonb_set(entry.published_data, '{name}', to_jsonb('Liwa Explore'::text), true),
        '{seoTitle}', to_jsonb('Liwa Explore'::text), true
      ),
      published_version = published_version + 1,
      published_at = now(),
      updated_at = now()
  from candidate
  where entry.entry_key = candidate.entry_key
  returning entry.entry_key, candidate.before_data, entry.published_data as after_data
)
insert into public.website_studio_revisions(
  entry_key, action, before_data, after_data, changed_fields, affected_areas, actor_user_id
)
select entry_key, 'published', before_data, after_data, array['name','seoTitle'],
       array['Services','Inquiry choices','Branch details','Admin filters'], null
from normalized;

notify pgrst, 'reload schema';
commit;
