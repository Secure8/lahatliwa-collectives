-- Project ownership/RLS correction and cleanup-worker coordination.
-- Run after creative_access_contributor_requests.sql and project_media_cleanup.sql.
alter table public.storage_cleanup_jobs add column if not exists next_retry_at timestamptz, add column if not exists worker_id text, add column if not exists locked_at timestamptz, add column if not exists started_at timestamptz;
create index if not exists storage_cleanup_eligible_idx on public.storage_cleanup_jobs(status, next_retry_at, created_at);

create or replace function private.can_create_project(check_user_id uuid)
returns boolean language sql stable security definer set search_path = public, private, pg_temp as $$
  select private.has_role(check_user_id, array['super_admin','admin','editor','creative']);
$$;

create or replace function private.guard_project_ownership()
returns trigger language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or not private.can_create_project(auth.uid()) then raise exception 'Project creation is not allowed.'; end if;
    new.owner_user_id := auth.uid(); new.created_by := auth.uid();
  else
    -- Normal editing can never accidentally transfer ownership.
    new.owner_user_id := old.owner_user_id; new.created_by := old.created_by;
  end if;
  return new;
end;
$$;
drop trigger if exists projects_guard_ownership on public.projects;
create trigger projects_guard_ownership before insert or update on public.projects for each row execute function private.guard_project_ownership();

drop policy if exists "Team can insert project drafts" on public.projects;
drop policy if exists "Team can update allowed projects" on public.projects;
drop policy if exists "Admins can delete allowed projects" on public.projects;
drop policy if exists "Team can delete allowed projects" on public.projects;
create policy "Team can insert own projects" on public.projects for insert to authenticated with check (private.can_create_project(auth.uid()) and owner_user_id = auth.uid() and created_by = auth.uid());
create policy "Team can update editable projects" on public.projects for update to authenticated using (private.can_edit_project(auth.uid(), id)) with check (private.can_edit_project(auth.uid(), id));
create policy "Team can delete managed projects" on public.projects for delete to authenticated using (private.can_manage_project(auth.uid(), id));

create or replace function private.valid_cleanup_path(path text)
returns boolean language sql immutable set search_path = pg_catalog as $$
  select path is not null and path <> '' and path !~ '^[a-z]+://' and path !~ '(^|/)\.\.(/|$)' and path !~ '^/' and length(path) <= 1024;
$$;

create or replace function private.claim_storage_cleanup_jobs(p_batch_size integer, p_worker_id text)
returns table(id uuid, bucket_name text, object_path text, attempt_count integer)
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service worker authentication required.'; end if;
  return query with candidates as (
    select j.id from public.storage_cleanup_jobs j
    where (j.status = 'pending' or (j.status = 'failed' and (j.next_retry_at is null or j.next_retry_at <= now())) or (j.status = 'processing' and j.locked_at < now() - interval '15 minutes'))
      and j.attempt_count < 8 and private.valid_cleanup_path(j.object_path)
    order by j.created_at for update skip locked limit greatest(1, least(p_batch_size, 100))
  ) update public.storage_cleanup_jobs j set status='processing', worker_id=p_worker_id, locked_at=now(), started_at=now()
  from candidates c where j.id=c.id returning j.id,j.bucket_name,j.object_path,j.attempt_count;
end;
$$;

create or replace function private.finish_storage_cleanup_job(p_job_id uuid, p_success boolean, p_error text default null)
returns void language plpgsql security definer set search_path = public, private, pg_temp as $$
declare attempts integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service worker authentication required.'; end if;
  select attempt_count into attempts from public.storage_cleanup_jobs where id=p_job_id for update;
  if not found then return; end if;
  if p_success then update public.storage_cleanup_jobs set status='completed',completed_at=now(),last_error=null,worker_id=null,locked_at=null where id=p_job_id;
  else
    attempts := attempts + 1;
    update public.storage_cleanup_jobs set attempt_count=attempts,last_error=left(coalesce(p_error,'Storage deletion failed.'),500),worker_id=null,locked_at=null,
      status=case when attempts >= 8 then 'manual_review' else 'failed' end,
      next_retry_at=case attempts when 1 then now()+interval '5 minutes' when 2 then now()+interval '15 minutes' when 3 then now()+interval '1 hour' when 4 then now()+interval '6 hours' when 5 then now()+interval '24 hours' else now()+interval '1 day' end where id=p_job_id;
  end if;
end;
$$;
create or replace function public.claim_storage_cleanup_jobs(p_batch_size integer, p_worker_id text) returns table(id uuid,bucket_name text,object_path text,attempt_count integer) language sql security invoker set search_path=public,private,pg_temp as $$ select * from private.claim_storage_cleanup_jobs(p_batch_size,p_worker_id); $$;
create or replace function public.finish_storage_cleanup_job(p_job_id uuid,p_success boolean,p_error text default null) returns void language sql security invoker set search_path=public,private,pg_temp as $$ select private.finish_storage_cleanup_job(p_job_id,p_success,p_error); $$;
create or replace function private.complete_project_cleanup_paths(p_project_id uuid, p_paths text[])
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if not private.can_manage_project(auth.uid(), p_project_id) and not exists (select 1 from public.storage_cleanup_jobs where project_id=p_project_id and created_by=auth.uid()) then raise exception 'You cannot complete project cleanup jobs.'; end if;
  update public.storage_cleanup_jobs set status='completed',completed_at=now(),last_error=null
  where project_id=p_project_id and object_path=any(p_paths) and status in ('pending','failed','processing');
end; $$;
create or replace function public.complete_project_cleanup_paths(p_project_id uuid,p_paths text[]) returns void language sql security invoker set search_path=public,private,pg_temp as $$ select private.complete_project_cleanup_paths(p_project_id,p_paths); $$;
grant execute on function public.claim_storage_cleanup_jobs(integer,text) to service_role;
grant execute on function public.finish_storage_cleanup_job(uuid,boolean,text) to service_role;
grant execute on function public.complete_project_cleanup_paths(uuid,text[]) to authenticated;
grant execute on function private.claim_storage_cleanup_jobs(integer,text) to service_role;
grant execute on function private.finish_storage_cleanup_job(uuid,boolean,text) to service_role;
notify pgrst, 'reload schema';
