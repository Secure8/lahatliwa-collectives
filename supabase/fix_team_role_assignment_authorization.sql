-- Focused, idempotent Team role assignment correction.
-- Apply after team_rbac_upgrade.sql and fix_team_invite_security_warnings.sql.

alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check
check (role in ('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer'));

create or replace function private.guard_admin_user_self_update()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  requester_id uuid := auth.uid();
  requester_email text := lower(auth.jwt() ->> 'email');
begin
  if coalesce(current_setting('app.admin_member_lifecycle_authorized', true), '') = 'true'
    and auth.role() = 'service_role'
  then
    return new;
  end if;

  if requester_id is null then
    raise exception 'Authentication required.';
  end if;

  if private.has_role(requester_id, array['super_admin']) then
    if old.role in ('super_admin', 'owner')
      or new.role in ('super_admin', 'owner')
    then
      raise exception 'The existing Super Admin role cannot be changed or transferred.';
    end if;
    return new;
  end if;

  if requester_email = lower(old.email)
    and old.status = 'invited'
    and old.user_id is null
    and new.user_id = requester_id
    and new.status = 'active'
    and new.id is not distinct from old.id
    and new.email is not distinct from old.email
    and new.role is not distinct from old.role
    and new.display_name is not distinct from old.display_name
    and new.avatar_url is not distinct from old.avatar_url
    and new.creative_member_id is not distinct from old.creative_member_id
    and new.invited_by is not distinct from old.invited_by
    and new.created_at is not distinct from old.created_at
  then
    return new;
  end if;

  if old.user_id = requester_id then
    new.id := old.id;
    new.user_id := old.user_id;
    new.email := old.email;
    new.role := old.role;
    new.status := old.status;
    new.creative_member_id := old.creative_member_id;
    new.invited_by := old.invited_by;
    new.created_at := old.created_at;
    return new;
  end if;

  raise exception 'Only the invited account may claim this team record.';
end;
$$;

revoke all on function private.guard_admin_user_self_update() from public, anon, authenticated;

drop trigger if exists admin_users_guard_self_update on public.admin_users;
create trigger admin_users_guard_self_update
before update on public.admin_users
for each row execute function private.guard_admin_user_self_update();

drop policy if exists "Admins can insert team records" on public.admin_users;
create policy "Admins can insert team records"
on public.admin_users for insert to authenticated
with check (
  private.has_role(auth.uid(), array['super_admin'])
  and role in ('admin', 'editor', 'creative', 'viewer')
  and status = 'invited'
  and user_id is null
  and invited_by = auth.uid()
  and email is not null
);

drop policy if exists "Admins can update team records" on public.admin_users;
create policy "Admins can update team records"
on public.admin_users for update to authenticated
using (
  (
    private.has_role(auth.uid(), array['super_admin'])
    and role not in ('super_admin', 'owner')
  )
  or (
    lower(email) = lower(auth.jwt() ->> 'email')
    and role in ('admin', 'editor', 'creative', 'viewer')
    and (
      (status = 'invited' and user_id is null)
      or user_id = auth.uid()
    )
  )
)
with check (
  (
    private.has_role(auth.uid(), array['super_admin'])
    and role in ('admin', 'editor', 'creative', 'viewer')
  )
  or (
    lower(email) = lower(auth.jwt() ->> 'email')
    and role in ('admin', 'editor', 'creative', 'viewer')
    and status = 'active'
    and user_id = auth.uid()
  )
);

notify pgrst, 'reload schema';
