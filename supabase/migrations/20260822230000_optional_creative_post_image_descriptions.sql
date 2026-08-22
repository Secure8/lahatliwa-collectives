begin;

-- Descriptions remain available for accessibility, but Creatives may publish
-- visual work without being blocked by an empty optional description.
create or replace function api_internal.publish_creative_post(p_post_id uuid, p_guidelines_version text)
returns public.creative_posts
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  post public.creative_posts;
  media_count integer;
  referenced_count integer;
  missing_count integer;
begin
  select * into post from public.creative_posts where id=p_post_id for update;
  if post.id is null or not private.owns_creative_post(auth.uid(),post.id) then raise exception 'CREATIVE_POST_NOT_AUTHORIZED' using errcode='42501'; end if;
  if post.status='archived' or post.moderation_status in ('hidden','removed') then raise exception 'CREATIVE_POST_LOCKED'; end if;
  if length(btrim(coalesce(p_guidelines_version,''))) not between 1 and 40 then raise exception 'PUBLISHING_GUIDELINES_REQUIRED'; end if;
  select count(*) into media_count from public.creative_post_media where post_id=post.id;
  if media_count > 10 then raise exception 'CREATIVE_POST_MEDIA_LIMIT'; end if;
  with refs as (
    select distinct media.value::uuid id
    from jsonb_array_elements(post.document->'blocks') block
    cross join lateral jsonb_array_elements_text(coalesce(block->'mediaIds','[]'::jsonb)) media(value)
    where block->>'type'='image_group'
  )
  select count(*), count(*) filter (where m.id is null) into referenced_count,missing_count
  from refs left join public.creative_post_media m on m.id=refs.id and m.post_id=post.id;
  if missing_count > 0 or referenced_count <> media_count then raise exception 'CREATIVE_POST_MEDIA_REFERENCES_INVALID'; end if;
  if referenced_count=0 and not exists (
    select 1 from jsonb_array_elements(post.document->'blocks') block
    where (block->>'type' in ('paragraph','heading','quote') and exists (
      select 1 from jsonb_array_elements(coalesce(block->'content','[]'::jsonb)) segment
      where length(btrim(coalesce(segment->>'text',''))) > 0
    )) or (block->>'type' in ('bullet_list','numbered_list') and exists (
      select 1 from jsonb_array_elements_text(coalesce(block->'items','[]'::jsonb)) item
      where length(btrim(item)) > 0
    )) or (block->>'type'='external_embed' and length(btrim(coalesce(block->>'url',''))) > 0)
  ) then raise exception 'CREATIVE_POST_EMPTY'; end if;
  perform set_config('app.creative_post_lifecycle','true',true);
  update public.creative_posts
  set status='published',visibility='public',published_at=coalesce(published_at,now()),archived_at=null,
    publishing_guidelines_version=p_guidelines_version,guidelines_accepted_at=now(),updated_at=now()
  where id=post.id returning * into post;
  return post;
end;
$$;

notify pgrst, 'reload schema';
commit;
