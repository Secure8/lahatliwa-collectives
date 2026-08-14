begin;

alter table public.creative_members
  add column if not exists profile_image_position text not null default '50% 50%',
  add column if not exists cover_image_position text not null default '50% 50%';

alter table public.projects
  add column if not exists moderation_reason text,
  add column if not exists moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists moderated_at timestamptz;

alter table public.creative_members drop constraint if exists creative_members_profile_image_position_format;
alter table public.creative_members add constraint creative_members_profile_image_position_format
  check (profile_image_position ~ '^(100|[0-9]{1,2})% (100|[0-9]{1,2})%$');
alter table public.creative_members drop constraint if exists creative_members_cover_image_position_format;
alter table public.creative_members add constraint creative_members_cover_image_position_format
  check (cover_image_position ~ '^(100|[0-9]{1,2})% (100|[0-9]{1,2})%$');

create or replace function private.can_create_project(check_user_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select exists(select 1 from public.admin_users where user_id=check_user_id and status='active' and role in ('super_admin','creative'));
$$;

create or replace function private.can_edit_project(check_user_id uuid, check_project_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select exists(
    select 1 from public.admin_users account
    left join public.projects project on project.id=check_project_id
    where account.user_id=check_user_id and account.status='active' and (
      account.role='super_admin' or (
        account.role='creative' and (
          project.owner_user_id=check_user_id or project.created_by=check_user_id or exists(
            select 1 from public.project_creatives credit
            where credit.project_id=check_project_id
              and coalesce(credit.creative_member_id,credit.creative_id)=account.creative_member_id
              and credit.is_primary=true
          )
        )
      )
    )
  );
$$;

create or replace function private.can_manage_project(check_user_id uuid, check_project_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.can_edit_project(check_user_id,check_project_id);
$$;

revoke all on function private.can_create_project(uuid), private.can_edit_project(uuid,uuid), private.can_manage_project(uuid,uuid) from public,anon,authenticated;
grant execute on function private.can_create_project(uuid), private.can_edit_project(uuid,uuid), private.can_manage_project(uuid,uuid) to authenticated;

create or replace function public.delete_creative_post(p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private, pg_temp as $$
declare post public.creative_posts; queued integer;
begin
  select * into post from public.creative_posts where id=p_post_id for update;
  if post.id is null or not private.owns_creative_post(auth.uid(),post.id) then
    raise exception 'CREATIVE_POST_NOT_AUTHORIZED' using errcode='42501';
  end if;
  insert into public.storage_cleanup_jobs(provider,bucket_name,object_path,reason,created_by)
  select distinct 'cloudflare_r2',destination_bucket,external_file_id,'Creative post deleted',auth.uid()
  from public.external_media_objects where creative_post_id=post.id and provider='cloudflare_r2'
    and external_file_id is not null and destination_bucket is not null and status<>'deleted'
  on conflict do nothing;
  get diagnostics queued = row_count;
  update public.external_media_objects set status='cancelled',accounting_state='pending_cleanup',cleanup_status='pending',cleanup_error=null
  where creative_post_id=post.id and provider='cloudflare_r2' and status<>'deleted';
  delete from public.creative_posts where id=post.id;
  return jsonb_build_object('deleted',true,'queued',queued);
end;
$$;

drop policy if exists creative_posts_owner_delete on public.creative_posts;
create policy creative_posts_owner_delete on public.creative_posts for delete to authenticated
  using(private.owns_creative_post(auth.uid(),id));
revoke all on function public.delete_creative_post(uuid) from public,anon,service_role;
grant execute on function public.delete_creative_post(uuid) to authenticated;

create or replace function public.moderate_public_project(p_project_id uuid, p_reason text)
returns public.projects language plpgsql security definer set search_path = public, private, pg_temp as $$
declare project public.projects;
begin
  if not exists(select 1 from public.admin_users where user_id=auth.uid() and status='active' and role='super_admin') then
    raise exception 'SUPER_ADMIN_REQUIRED' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_reason,''))) not between 8 and 1000 then raise exception 'MODERATION_REASON_REQUIRED'; end if;
  update public.projects set status='draft', moderation_reason=btrim(p_reason), moderated_by=auth.uid(), moderated_at=now(), updated_at=now()
  where id=p_project_id and status='published' returning * into project;
  if project.id is null then raise exception 'PROJECT_NOT_FOUND_OR_NOT_PUBLIC'; end if;
  return project;
end;
$$;
revoke all on function public.moderate_public_project(uuid,text) from public,anon,service_role;
grant execute on function public.moderate_public_project(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
