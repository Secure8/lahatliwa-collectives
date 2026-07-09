create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.guard_admin_user_access_changes()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  requester_id uuid := auth.uid();
  requester_role text;
  old_role text := case when old.role = 'owner' then 'super_admin' else old.role end;
  new_role text := case when new.role = 'owner' then 'super_admin' else new.role end;
  other_active_super_admins integer;
begin
  if requester_id is null then
    raise exception 'Authentication required.';
  end if;

  requester_role := private.user_role(requester_id);

  -- Invite claims and normal self-profile updates are still validated by the
  -- existing private.guard_admin_user_self_update trigger and RLS policies.
  if requester_role is null or requester_role not in ('super_admin', 'admin') then
    return new;
  end if;

  if old.user_id = requester_id
    and (
      new_role is distinct from old_role
      or new.status is distinct from old.status
    )
  then
    raise exception 'You cannot change your own role or access status.';
  end if;

  if requester_role = 'admin'
    and (old_role = 'super_admin' or new_role = 'super_admin')
  then
    raise exception 'Only a Super Admin can change a Super Admin account.';
  end if;

  if old_role = 'super_admin'
    and old.status = 'active'
    and (new_role <> 'super_admin' or new.status <> 'active')
  then
    perform pg_advisory_xact_lock(482910, 1);

    select count(*)
    into other_active_super_admins
    from public.admin_users
    where id <> old.id
      and status = 'active'
      and role in ('super_admin', 'owner');

    if other_active_super_admins = 0 then
      raise exception 'You cannot downgrade or disable the last active Super Admin.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_admin_user_access_changes() from public, anon, authenticated;

drop trigger if exists admin_users_guard_access_changes on public.admin_users;
create trigger admin_users_guard_access_changes
before update on public.admin_users
for each row execute function private.guard_admin_user_access_changes();

-- Team records are retained for ownership, credits, history, and audit. The
-- frontend uses status = 'disabled' instead of deleting rows.
alter table public.admin_users enable row level security;
drop policy if exists "Super admins can delete team records" on public.admin_users;
revoke delete on table public.admin_users from anon, authenticated;

notify pgrst, 'reload schema';
