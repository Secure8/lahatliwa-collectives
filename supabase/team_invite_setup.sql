create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function public.check_team_invite(invite_email text)
returns table (
  allowed boolean,
  message text,
  status text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(trim(invite_email));
  invite_record record;
begin
  if normalized_email is null or normalized_email = '' then
    return query select false, 'Enter the email address used for your team invite.', null::text;
    return;
  end if;

  select au.status, au.role
  into invite_record
  from public.admin_users au
  where lower(au.email) = normalized_email
  limit 1;

  if not found then
    return query select false, 'This email has not been invited to the Lahat Liwa team.', null::text;
    return;
  end if;

  if invite_record.status = 'disabled' then
    return query select false, 'This team account is disabled. Ask a Super Admin to reactivate it.', invite_record.status;
    return;
  end if;

  if invite_record.status not in ('invited', 'active')
    or invite_record.role not in ('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer')
  then
    return query select false, 'This email has not been invited to the Lahat Liwa team.', invite_record.status;
    return;
  end if;

  return query select true, 'Team invite found. You can create your password.', invite_record.status;
end;
$$;

create or replace function public.claim_team_invite()
returns table (
  id uuid,
  user_id uuid,
  email text,
  display_name text,
  avatar_url text,
  role text,
  status text,
  creative_member_id uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  requester_id uuid := auth.uid();
  requester_email text := lower(auth.jwt() ->> 'email');
  claimed_record record;
begin
  if requester_id is null or requester_email is null or requester_email = '' then
    raise exception 'Authentication required.';
  end if;

  update public.admin_users au
  set
    user_id = requester_id,
    status = 'active',
    updated_at = now()
  where lower(au.email) = requester_email
    and au.status in ('invited', 'active')
    and au.role in ('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer')
    and (au.user_id is null or au.user_id = requester_id)
  returning
    au.id,
    au.user_id,
    au.email,
    au.display_name,
    au.avatar_url,
    case when au.role = 'owner' then 'super_admin' else au.role end as role,
    au.status,
    au.creative_member_id
  into claimed_record;

  if claimed_record is null then
    raise exception 'This email has not been invited to the Lahat Liwa team.';
  end if;

  return query select
    claimed_record.id,
    claimed_record.user_id,
    claimed_record.email,
    claimed_record.display_name,
    claimed_record.avatar_url,
    claimed_record.role,
    claimed_record.status,
    claimed_record.creative_member_id;
end;
$$;

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
    new.status := 'active';
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

revoke all on function public.check_team_invite(text) from public;
revoke all on function public.claim_team_invite() from public;
revoke all on function private.guard_admin_user_self_update() from public;

grant execute on function public.check_team_invite(text) to anon, authenticated;
grant execute on function public.claim_team_invite() to authenticated;

drop trigger if exists admin_users_guard_self_update on public.admin_users;
create trigger admin_users_guard_self_update
before update on public.admin_users
for each row execute function private.guard_admin_user_self_update();

notify pgrst, 'reload schema';
