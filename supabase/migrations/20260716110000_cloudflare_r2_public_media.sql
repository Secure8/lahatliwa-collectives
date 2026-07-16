-- Cloudflare R2 public-media rollout. Apply after the external-storage completion migration.
-- This migration does not copy or delete existing Supabase or Google Drive objects.

begin;

alter table public.external_media_objects
  add column if not exists media_group_id uuid,
  add column if not exists media_variant text,
  add column if not exists public_url text;

alter table public.external_media_objects drop constraint if exists external_media_objects_provider_check;
alter table public.external_media_objects add constraint external_media_objects_provider_check
  check (provider in ('supabase','google_drive','cloudflare_r2','onedrive','dropbox','s3_compatible'));

alter table public.external_media_objects drop constraint if exists external_media_objects_check;
alter table public.external_media_objects drop constraint if exists external_media_objects_provider_reference_check;
alter table public.external_media_objects add constraint external_media_objects_provider_reference_check check (
  (provider = 'supabase' and storage_connection_id is null and bucket is not null and storage_path is not null)
  or (provider = 'cloudflare_r2' and storage_connection_id is null and (status = 'deleted' or external_file_id is not null))
  or (provider not in ('supabase','cloudflare_r2') and storage_connection_id is not null)
);

alter table public.external_media_objects drop constraint if exists external_media_objects_file_category_check;
alter table public.external_media_objects add constraint external_media_objects_file_category_check check (
  file_category in (
    'project_original','project_file','profile_original',
    'project_gallery','project_cover','external_thumbnail',
    'profile_photo','profile_cover','site_image','service_image'
  )
);

alter table public.external_media_objects drop constraint if exists external_media_objects_media_variant_check;
alter table public.external_media_objects add constraint external_media_objects_media_variant_check
  check (media_variant is null or media_variant in ('thumbnail','display','expanded'));
alter table public.external_media_objects drop constraint if exists external_media_objects_r2_shape_check;
alter table public.external_media_objects add constraint external_media_objects_r2_shape_check check (
  provider <> 'cloudflare_r2' or status = 'deleted' or (
    media_group_id is not null
    and media_variant is not null
    and external_file_id is not null
    and public_url is not null
    and visibility = 'public'
    and mime_type = 'image/webp'
    and storage_connection_id is null
  )
);

create unique index if not exists external_media_r2_object_unique_idx
  on public.external_media_objects(external_file_id)
  where provider = 'cloudflare_r2' and status <> 'deleted';
create unique index if not exists external_media_r2_public_url_unique_idx
  on public.external_media_objects(public_url)
  where provider = 'cloudflare_r2' and status <> 'deleted';
create index if not exists external_media_r2_group_idx
  on public.external_media_objects(media_group_id, media_variant)
  where provider = 'cloudflare_r2';

alter table public.storage_cleanup_jobs
  add column if not exists provider text not null default 'supabase';
alter table public.storage_cleanup_jobs drop constraint if exists storage_cleanup_jobs_provider_check;
alter table public.storage_cleanup_jobs add constraint storage_cleanup_jobs_provider_check
  check (provider in ('supabase','cloudflare_r2'));

drop index if exists public.storage_cleanup_active_path_unique_idx;
create unique index storage_cleanup_active_provider_path_unique_idx
  on public.storage_cleanup_jobs(provider,bucket_name,object_path)
  where status in ('pending','processing','failed');

drop function if exists public.claim_storage_cleanup_jobs(integer,text);
drop function if exists private.claim_storage_cleanup_jobs(integer,text);

create function private.claim_storage_cleanup_jobs(p_batch_size integer, p_worker_id text)
returns table(id uuid, provider text, bucket_name text, object_path text, attempt_count integer)
language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service worker authentication required.'; end if;
  return query with candidates as (
    select j.id from public.storage_cleanup_jobs j
    where (j.status = 'pending'
      or (j.status = 'failed' and (j.next_retry_at is null or j.next_retry_at <= now()))
      or (j.status = 'processing' and j.locked_at < now() - interval '15 minutes'))
      and j.attempt_count < 8 and private.valid_cleanup_path(j.object_path)
    order by j.created_at for update skip locked limit greatest(1, least(p_batch_size, 100))
  ) update public.storage_cleanup_jobs j
    set status='processing', worker_id=p_worker_id, locked_at=now(), started_at=now()
  from candidates c where j.id=c.id
  returning j.id,j.provider,j.bucket_name,j.object_path,j.attempt_count;
end;
$$;

create function public.claim_storage_cleanup_jobs(p_batch_size integer, p_worker_id text)
returns table(id uuid,provider text,bucket_name text,object_path text,attempt_count integer)
language sql security invoker set search_path=public,private,pg_temp as $$
  select * from private.claim_storage_cleanup_jobs(p_batch_size,p_worker_id);
$$;

revoke all on function private.claim_storage_cleanup_jobs(integer,text) from public,anon,authenticated;
revoke all on function public.claim_storage_cleanup_jobs(integer,text) from public,anon,authenticated;
grant execute on function private.claim_storage_cleanup_jobs(integer,text) to service_role;
grant execute on function public.claim_storage_cleanup_jobs(integer,text) to service_role;

revoke select on table public.external_media_objects from authenticated;
grant select (
  id,owner_user_id,provider,filename,mime_type,size_bytes,width,height,duration_seconds,
  visibility,status,file_category,project_id,creative_member_id,profile_media_kind,
  preview_required,preview_provider,preview_bucket,preview_path,media_group_id,media_variant,
  public_url,replaces_media_object_id,replaced_by_media_object_id,archived_at,archive_reason,
  cleanup_status,cleanup_attempt_count,cleanup_error,uploaded_bytes,upload_expires_at,
  created_at,updated_at
) on table public.external_media_objects to authenticated;

comment on column public.external_media_objects.external_file_id is 'Server-only provider object key. Never return through public media responses.';
comment on column public.external_media_objects.public_url is 'Server-generated URL from the configured R2 public base; never accepted from an upload client.';
comment on column public.storage_cleanup_jobs.provider is 'Deletion adapter selected by the scheduled cleanup worker.';

notify pgrst, 'reload schema';
commit;
