begin;

grant execute on function private.valid_creative_post_document(jsonb)
  to authenticated;

commit;