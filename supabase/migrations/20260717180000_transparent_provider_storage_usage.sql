-- Forward correction for projects that already applied the initial provider-usage
-- migration. This remains read-only and service-role-only.

begin;

create or replace function public.get_provider_storage_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service authorization required.' using errcode = '42501';
  end if;

  with object_sizes as (
    select
      objects.id,
      objects.bucket_id,
      case
        when objects.metadata->'size' is null
          or pg_catalog.jsonb_typeof(objects.metadata->'size') = 'null'
          or pg_catalog.btrim(pg_catalog.coalesce(objects.metadata->>'size', '')) = ''
          then 'missing'
        when pg_catalog.jsonb_typeof(objects.metadata->'size') in ('number', 'string')
          and pg_catalog.btrim(objects.metadata->>'size') ~ '^[0-9]+$'
          and (pg_catalog.btrim(objects.metadata->>'size'))::numeric <= 9223372036854775807
          then 'usable'
        else 'invalid'
      end as size_state,
      case
        when pg_catalog.jsonb_typeof(objects.metadata->'size') in ('number', 'string')
          and pg_catalog.btrim(objects.metadata->>'size') ~ '^[0-9]+$'
          and (pg_catalog.btrim(objects.metadata->>'size'))::numeric <= 9223372036854775807
          then (pg_catalog.btrim(objects.metadata->>'size'))::bigint
        else null
      end as size_bytes
    from storage.objects objects
  ), bucket_usage as (
    select
      buckets.id as bucket_id,
      pg_catalog.coalesce(pg_catalog.sum(object_sizes.size_bytes), 0)::bigint as total_bytes,
      pg_catalog.count(object_sizes.id)::bigint as object_count,
      pg_catalog.count(object_sizes.id) filter (where object_sizes.size_state = 'usable')::bigint as objects_with_usable_size,
      pg_catalog.count(object_sizes.id) filter (where object_sizes.size_state = 'missing')::bigint as objects_missing_size,
      pg_catalog.count(object_sizes.id) filter (where object_sizes.size_state = 'invalid')::bigint as objects_invalid_size
    from storage.buckets buckets
    left join object_sizes on object_sizes.bucket_id = buckets.id
    group by buckets.id
  ), project_usage as (
    select
      pg_catalog.coalesce(pg_catalog.sum(bucket_usage.total_bytes), 0)::bigint as total_bytes,
      pg_catalog.coalesce(pg_catalog.sum(bucket_usage.object_count), 0)::bigint as object_count,
      pg_catalog.coalesce(pg_catalog.sum(bucket_usage.objects_with_usable_size), 0)::bigint as objects_with_usable_size,
      pg_catalog.coalesce(pg_catalog.sum(bucket_usage.objects_missing_size), 0)::bigint as objects_missing_size,
      pg_catalog.coalesce(pg_catalog.sum(bucket_usage.objects_invalid_size), 0)::bigint as objects_invalid_size,
      pg_catalog.count(*)::bigint as bucket_count
    from bucket_usage
  )
  select pg_catalog.jsonb_build_object(
    'supabase', pg_catalog.jsonb_build_object(
      'available', true,
      'complete', project_usage.objects_missing_size = 0 and project_usage.objects_invalid_size = 0,
      'totalBytes', project_usage.total_bytes,
      'objectCount', project_usage.object_count,
      'objectsWithUsableSize', project_usage.objects_with_usable_size,
      'objectsMissingSize', project_usage.objects_missing_size,
      'objectsInvalidSize', project_usage.objects_invalid_size,
      'objectsWithoutUsableSize', project_usage.objects_missing_size + project_usage.objects_invalid_size,
      'bucketCount', project_usage.bucket_count,
      'buckets', pg_catalog.coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'bucket', bucket_usage.bucket_id,
              'totalBytes', bucket_usage.total_bytes,
              'objectCount', bucket_usage.object_count,
              'objectsWithUsableSize', bucket_usage.objects_with_usable_size,
              'objectsMissingSize', bucket_usage.objects_missing_size,
              'objectsInvalidSize', bucket_usage.objects_invalid_size,
              'complete', bucket_usage.objects_missing_size = 0 and bucket_usage.objects_invalid_size = 0
            ) order by bucket_usage.bucket_id
          )
          from bucket_usage
        ),
        '[]'::jsonb
      ),
      'source', 'current_storage_objects_in_this_project',
      'checkedAt', pg_catalog.statement_timestamp()
    )
  )
  into result
  from project_usage;

  return result;
end;
$$;

revoke all on function public.get_provider_storage_usage() from public, anon, authenticated;
grant execute on function public.get_provider_storage_usage() to service_role;

comment on function public.get_provider_storage_usage() is
  'Service-only, read-only current project totals derived from live storage.objects metadata, with completeness diagnostics.';

commit;
