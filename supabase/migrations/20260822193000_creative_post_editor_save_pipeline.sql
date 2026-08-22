-- Save the complete Creative editor state atomically. This prevents the
-- document, portfolio metadata, and taxonomy from becoming partially saved.

begin;

create or replace function public.save_creative_post_editor(
  p_post_id uuid,
  p_document jsonb,
  p_expected_updated_at timestamptz default null,
  p_title text default null,
  p_summary text default null,
  p_work_year smallint default null,
  p_external_url text default null,
  p_tags text[] default '{}',
  p_term_ids uuid[] default '{}'
)
returns public.creative_posts
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  post public.creative_posts;
  revision_number integer;
  normalized_term_ids uuid[];
  valid_term_count integer;
begin
  select * into post from public.creative_posts where id = p_post_id for update;

  if post.id is null or not private.owns_creative_post(auth.uid(), post.id) then
    raise exception 'CREATIVE_POST_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if post.status = 'archived' or post.moderation_status = 'removed' then
    raise exception 'CREATIVE_POST_LOCKED';
  end if;
  if p_expected_updated_at is not null and post.updated_at is distinct from p_expected_updated_at then
    raise exception 'CREATIVE_POST_CONFLICT';
  end if;
  if not private.valid_creative_post_document(p_document) then
    raise exception 'CREATIVE_POST_DOCUMENT_INVALID';
  end if;

  select coalesce(array_agg(distinct selected.value), '{}'::uuid[])
    into normalized_term_ids
  from unnest(coalesce(p_term_ids, '{}'::uuid[])) as selected(value)
  where selected.value is not null;

  select count(*) into valid_term_count
  from public.creative_taxonomy_terms
  where id = any(normalized_term_ids) and is_active = true;

  if valid_term_count <> cardinality(normalized_term_ids) then
    raise exception 'CREATIVE_POST_TAXONOMY_INVALID';
  end if;

  select coalesce(max(revision.revision_number), 0) + 1
    into revision_number
  from public.creative_post_revisions revision
  where revision.post_id = post.id;

  insert into public.creative_post_revisions(post_id, revision_number, document, created_by)
  values (post.id, revision_number, p_document, auth.uid());

  update public.creative_posts
  set document = p_document,
      title = nullif(btrim(coalesce(p_title, '')), ''),
      summary = nullif(btrim(coalesce(p_summary, '')), ''),
      work_year = p_work_year,
      external_url = nullif(btrim(coalesce(p_external_url, '')), ''),
      tags = coalesce(p_tags, '{}'::text[]),
      updated_at = now()
  where id = post.id
  returning * into post;

  delete from public.creative_post_taxonomy where post_id = post.id;
  insert into public.creative_post_taxonomy(post_id, term_id)
  select post.id, selected_term.term_id
  from unnest(normalized_term_ids) as selected_term(term_id);

  return post;
end;
$$;

revoke all on function public.save_creative_post_editor(uuid,jsonb,timestamptz,text,text,smallint,text,text[],uuid[]) from public, anon;
grant execute on function public.save_creative_post_editor(uuid,jsonb,timestamptz,text,text,smallint,text,text[],uuid[]) to authenticated;

commit;
