create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

do $$
begin
  if to_regprocedure('public.check_team_invite(text)') is not null then
    revoke execute on function public.check_team_invite(text) from public, anon, authenticated;
  end if;

  if to_regprocedure('public.claim_team_invite()') is not null then
    revoke execute on function public.claim_team_invite() from public, anon, authenticated;
  end if;
end;
$$;

drop function if exists public.check_team_invite(text);
drop function if exists public.claim_team_invite();

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
  if requester_id is null then
    raise exception 'Authentication required.';
  end if;

  if private.has_role(requester_id, array['super_admin', 'admin']) then
    return new;
  end if;

  if requester_email = lower(old.email)
    and old.status in ('invited', 'active')
    and old.user_id is null
    and new.user_id = requester_id
    and lower(new.email) = lower(old.email)
  then
    new.id := old.id;
    new.email := old.email;
    new.role := old.role;
    new.status := case when old.status = 'invited' then 'active' else old.status end;
    new.creative_member_id := old.creative_member_id;
    new.invited_by := old.invited_by;
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
    return new;
  end if;

  raise exception 'Only admins can change team access fields.';
end;
$$;

revoke all on function private.guard_admin_user_self_update() from public;

alter table public.admin_users enable row level security;

drop policy if exists "Team members can read team records" on public.admin_users;
create policy "Team members can read team records"
on public.admin_users
for select
to authenticated
using (
  private.has_role(auth.uid(), array['super_admin', 'admin'])
  or user_id = auth.uid()
  or (
    lower(email) = lower(auth.jwt() ->> 'email')
    and status in ('invited', 'active', 'disabled')
  )
);

drop policy if exists "Admins can insert team records" on public.admin_users;
create policy "Admins can insert team records"
on public.admin_users
for insert
to authenticated
with check (private.has_role(auth.uid(), array['super_admin', 'admin']));

drop policy if exists "Admins can update team records" on public.admin_users;
create policy "Admins can update team records"
on public.admin_users
for update
to authenticated
using (
  private.has_role(auth.uid(), array['super_admin', 'admin'])
  or (
    lower(email) = lower(auth.jwt() ->> 'email')
    and status in ('invited', 'active')
    and (user_id is null or user_id = auth.uid())
  )
)
with check (
  private.has_role(auth.uid(), array['super_admin', 'admin'])
  or (
    lower(email) = lower(auth.jwt() ->> 'email')
    and status in ('invited', 'active')
    and user_id = auth.uid()
  )
);

drop policy if exists "Super admins can delete team records" on public.admin_users;
create policy "Super admins can delete team records"
on public.admin_users
for delete
to authenticated
using (private.is_owner(auth.uid()) and user_id is distinct from auth.uid());

drop trigger if exists admin_users_guard_self_update on public.admin_users;
create trigger admin_users_guard_self_update
before update on public.admin_users
for each row execute function private.guard_admin_user_self_update();

notify pgrst, 'reload schema';
