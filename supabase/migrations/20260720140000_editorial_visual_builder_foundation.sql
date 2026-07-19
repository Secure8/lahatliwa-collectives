begin;

-- Additive fields used by the visual editor's integrated source cards.
-- Existing source rows remain unchanged and receive only empty defaults.
alter table public.editorial_sources
  add column if not exists publisher text not null default '',
  add column if not exists note text not null default '';

alter table public.editorial_sources drop constraint if exists editorial_sources_publisher_length;
alter table public.editorial_sources add constraint editorial_sources_publisher_length check(length(publisher) <= 180);
alter table public.editorial_sources drop constraint if exists editorial_sources_note_length;
alter table public.editorial_sources add constraint editorial_sources_note_length check(length(note) <= 1000);

-- Draft image sections may be empty while an author is composing. Non-empty
-- URLs remain limited to HTTPS or a root-relative path, and every other block
-- safety bound from the original validator is retained.
create or replace function private.valid_editorial_document(p_document jsonb)
returns boolean language plpgsql immutable set search_path=pg_catalog as $$
declare v_block jsonb; v_image jsonb; v_item jsonb; v_type text; v_url text;
begin
  if jsonb_typeof(p_document)<>'object' or p_document->>'version'<>'1'
     or jsonb_typeof(p_document->'blocks')<>'array' or jsonb_array_length(p_document->'blocks')>200 then return false; end if;
  for v_block in select value from jsonb_array_elements(p_document->'blocks') loop
    if jsonb_typeof(v_block)<>'object' or octet_length(v_block::text)>200000
       or v_block::text ~* '"(html|rawHtml|css|javascript|script)"[[:space:]]*:' then return false; end if;
    v_type:=v_block->>'type';
    if v_type not in ('paragraph','heading','quote','image','gallery','facts','callout','divider') then return false; end if;
    if v_type='paragraph' and (jsonb_typeof(v_block->'text')<>'string' or length(v_block->>'text')>10000) then return false;
    elsif v_type='heading' and (jsonb_typeof(v_block->'text')<>'string' or length(v_block->>'text')>240 or coalesce((v_block->>'level')::int,2) not in(2,3,4)) then return false;
    elsif v_type='quote' and (jsonb_typeof(v_block->'text')<>'string' or length(v_block->>'text')>3000 or length(coalesce(v_block->>'attribution',''))>240) then return false;
    elsif v_type='image' then
      v_url:=coalesce(v_block->>'url','');
      if (v_url<>'' and not (v_url ~ '^https://[^[:space:]<>"'']+$' or v_url ~ '^/([^/]|$)')) or length(coalesce(v_block->>'alt',''))>240 or length(coalesce(v_block->>'caption',''))>500 then return false; end if;
    elsif v_type='gallery' then
      if jsonb_typeof(v_block->'images')<>'array' or jsonb_array_length(v_block->'images')>12 then return false; end if;
      for v_image in select value from jsonb_array_elements(v_block->'images') loop
        v_url:=coalesce(v_image->>'url','');
        if jsonb_typeof(v_image)<>'object' or (v_url<>'' and not (v_url ~ '^https://[^[:space:]<>"'']+$' or v_url ~ '^/([^/]|$)')) or length(coalesce(v_image->>'alt',''))>240 or length(coalesce(v_image->>'caption',''))>500 then return false; end if;
      end loop;
    elsif v_type='facts' then
      if jsonb_typeof(v_block->'items')<>'array' or jsonb_array_length(v_block->'items')>20 then return false; end if;
      for v_item in select value from jsonb_array_elements(v_block->'items') loop
        if jsonb_typeof(v_item)<>'object' or length(coalesce(v_item->>'label','')) not between 1 and 100 or length(coalesce(v_item->>'value','')) not between 1 and 500 then return false; end if;
      end loop;
    elsif v_type='callout' and (coalesce(v_block->>'tone','note') not in('note','tip','warning') or length(coalesce(v_block->>'title',''))>160 or length(coalesce(v_block->>'text',''))>2000 or length(coalesce(v_block->>'linkLabel',''))>80 or (coalesce(v_block->>'linkUrl','')<>'' and not ((v_block->>'linkUrl') ~ '^https://[^[:space:]<>"'']+$' or (v_block->>'linkUrl') ~ '^/([^/]|$)'))) then return false;
    end if;
  end loop;
  return true;
exception when others then return false;
end;
$$;

comment on function private.valid_editorial_document(jsonb) is
  'Validates bounded structured Editorial documents. Empty draft image slots are allowed; populated URLs must be HTTPS or root-relative.';

-- Rollback: drop publisher/note only if no visual-editor data uses them, then
-- restore the prior validator from 20260719090000. Do not roll back by deleting
-- Editorial posts, revisions, sources, or audit events.

commit;
