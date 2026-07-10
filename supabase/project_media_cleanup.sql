-- Durable cleanup records. This migration never deletes existing Storage objects.
create table if not exists public.storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(), bucket_name text not null default 'project-media', object_path text not null,
  project_id uuid references public.projects(id) on delete set null, reason text not null,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed','manual_review')),
  attempt_count integer not null default 0, last_error text, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), completed_at timestamptz
);
create unique index if not exists storage_cleanup_active_path_unique_idx on public.storage_cleanup_jobs(bucket_name, object_path) where status in ('pending','processing','failed');
create index if not exists storage_cleanup_project_status_idx on public.storage_cleanup_jobs(project_id,status,created_at);
alter table public.storage_cleanup_jobs enable row level security;
create policy "Admins can read storage cleanup jobs" on public.storage_cleanup_jobs for select to authenticated using (private.can_manage_all_content(auth.uid()));

create or replace function private.enqueue_project_media_cleanup(p_project_id uuid, p_paths text[], p_reason text)
returns integer language plpgsql security definer set search_path = public, private, pg_temp as $$
declare path text; count_rows integer := 0;
begin
  if not private.can_manage_project(auth.uid(), p_project_id) then raise exception 'You cannot manage media cleanup for this project.'; end if;
  foreach path in array p_paths loop
    if path is not null and path <> '' and path !~ '^https?://' then
      insert into public.storage_cleanup_jobs(bucket_name,object_path,project_id,reason,created_by)
      values ('project-media',path,p_project_id,p_reason,auth.uid()) on conflict do nothing; count_rows := count_rows + 1;
    end if;
  end loop; return count_rows;
end; $$;
create or replace function public.enqueue_project_media_cleanup(p_project_id uuid, p_paths text[], p_reason text)
returns integer language sql security invoker set search_path = public, private, pg_temp as $$ select private.enqueue_project_media_cleanup(p_project_id,p_paths,p_reason); $$;
grant execute on function private.enqueue_project_media_cleanup(uuid,text[],text) to authenticated;
grant execute on function public.enqueue_project_media_cleanup(uuid,text[],text) to authenticated;
notify pgrst, 'reload schema';
