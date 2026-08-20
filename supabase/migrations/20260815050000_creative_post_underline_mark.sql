begin;

-- Preserve the version 1 block document while allowing one additional safe,
-- semantic inline mark. Raw HTML remains forbidden.
create or replace function private.valid_creative_post_document(document jsonb)
returns boolean language plpgsql immutable set search_path = pg_catalog as $$
declare
  block jsonb;
  segment jsonb;
  item jsonb;
  media_id jsonb;
  block_type text;
  mark jsonb;
begin
  if jsonb_typeof(document) <> 'object'
    or document->>'version' <> '1'
    or jsonb_typeof(document->'blocks') <> 'array'
    or jsonb_array_length(document->'blocks') > 80
    or octet_length(document::text) > 150000
    or document::text ~* '"(html|rawhtml|css|javascript|script|style)"[[:space:]]*:'
  then return false; end if;

  for block in select value from jsonb_array_elements(document->'blocks') loop
    if jsonb_typeof(block) <> 'object' or octet_length(block::text) > 30000 then return false; end if;
    block_type := block->>'type';
    if block_type not in ('paragraph','heading','quote','bullet_list','numbered_list','divider','image_group','external_embed') then return false; end if;

    if block_type in ('paragraph','heading','quote') then
      if jsonb_typeof(block->'content') <> 'array' or jsonb_array_length(block->'content') > 200 then return false; end if;
      if block_type = 'heading' and coalesce((block->>'level')::integer, 2) not in (2,3) then return false; end if;
      for segment in select value from jsonb_array_elements(block->'content') loop
        if jsonb_typeof(segment) <> 'object'
          or jsonb_typeof(segment->'text') <> 'string'
          or length(segment->>'text') > 10000
          or (segment ? 'marks' and jsonb_typeof(segment->'marks') <> 'array')
        then return false; end if;
        for mark in select value from jsonb_array_elements(coalesce(segment->'marks','[]'::jsonb)) loop
          if jsonb_typeof(mark) <> 'string' or mark #>> '{}' not in ('bold','italic','underline') then return false; end if;
        end loop;
        if segment ? 'href' and not (segment->>'href' ~ '^https://[^[:space:]<>"'']{1,2000}$') then return false; end if;
      end loop;
    elsif block_type in ('bullet_list','numbered_list') then
      if jsonb_typeof(block->'items') <> 'array' or jsonb_array_length(block->'items') not between 1 and 40 then return false; end if;
      for item in select value from jsonb_array_elements(block->'items') loop
        if jsonb_typeof(item) <> 'string' or length(item #>> '{}') > 2000 then return false; end if;
      end loop;
    elsif block_type = 'image_group' then
      if jsonb_typeof(block->'mediaIds') <> 'array' or jsonb_array_length(block->'mediaIds') > 10 then return false; end if;
      for media_id in select value from jsonb_array_elements(block->'mediaIds') loop
        if jsonb_typeof(media_id) <> 'string' or not (media_id #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then return false; end if;
      end loop;
    elsif block_type = 'external_embed' then
      if coalesce(block->>'url','') <> '' and not coalesce(block->>'url','') ~ '^https://[^[:space:]<>"'']{1,2000}$'
        or length(coalesce(block->>'label','')) > 160
      then return false; end if;
    end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

revoke all on function private.valid_creative_post_document(jsonb) from public, anon, authenticated;

commit;
