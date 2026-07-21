begin;

revoke all on function private.website_studio_can_manage(uuid) from public, anon;
grant execute on function private.website_studio_can_manage(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
