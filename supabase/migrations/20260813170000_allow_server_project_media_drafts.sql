begin;

-- Normal browser inserts remain bound to auth.uid(). The service role may only
-- insert the short-lived, incomplete project shell used by the R2 upload flow.
create or replace function private.guard_project_ownership()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if auth.role() = 'service_role' then
      if new.owner_user_id is null
        or new.created_by is distinct from new.owner_user_id
        or new.updated_by is distinct from new.owner_user_id
        or not private.can_create_project(new.owner_user_id)
        or new.status is distinct from 'draft'
        or new.review_status is distinct from 'draft'
        or new.media_creation_state is distinct from 'incomplete'
        or new.media_draft_expires_at is null
        or new.media_draft_expires_at <= now()
        or new.media_draft_expires_at > now() + interval '31 days'
        or new.slug is distinct from 'draft-' || new.id::text
      then
        raise exception 'Server project draft creation is not allowed.';
      end if;
    else
      if auth.uid() is null or not private.can_create_project(auth.uid()) then
        raise exception 'Project creation is not allowed.';
      end if;
      new.owner_user_id := auth.uid();
      new.created_by := auth.uid();
    end if;
  else
    new.owner_user_id := old.owner_user_id;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_project_ownership() from public, anon, authenticated;

commit;
