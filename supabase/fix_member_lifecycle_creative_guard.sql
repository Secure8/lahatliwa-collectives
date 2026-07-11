-- Allow only an already-authorized service-role lifecycle transaction to pass
-- the existing creative profile self-update guard.
create or replace function private.guard_creative_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if coalesce(
       current_setting('app.admin_member_lifecycle_authorized', true),
       ''
     ) = 'true'
    and auth.role() = 'service_role'
  then
    return new;
  end if;

  if private.can_manage_all_content(auth.uid()) then return new; end if;
  if old.id is distinct from private.current_creative_member_id() then
    raise exception 'You can only update your own creative profile.';
  end if;
  new.id := old.id;
  new.slug := old.slug;
  new.is_published := old.is_published;
  new.is_featured := old.is_featured;
  new.display_order := old.display_order;
  new.created_at := old.created_at;
  return new;
end;
$$;

revoke all on function private.guard_creative_self_update() from public, anon, authenticated;
notify pgrst, 'reload schema';
