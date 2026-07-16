-- Authoritative current Supabase Storage object totals for the Super Admin
-- monitoring endpoint. The storage schema remains read-only.

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

  with bucket_usage as (
    select
      objects.bucket_id,
      pg_catalog.coalesce(pg_catalog.sum(
        case
          when objects.metadata->>'size' ~ '^[0-9]+$'
            then (objects.metadata->>'size')::bigint
          else 0
        end
      ), 0)::bigint as total_bytes,
      pg_catalog.count(*)::bigint as object_count
    from storage.objects objects
    group by objects.bucket_id
  )
  select pg_catalog.jsonb_build_object(
    'supabase', pg_catalog.jsonb_build_object(
      'available', true,
      'totalBytes', pg_catalog.coalesce(pg_catalog.sum(bucket_usage.total_bytes), 0),
      'objectCount', pg_catalog.coalesce(pg_catalog.sum(bucket_usage.object_count), 0),
      'buckets', pg_catalog.coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'bucket', bucket_usage.bucket_id,
            'totalBytes', bucket_usage.total_bytes,
            'objectCount', bucket_usage.object_count
          ) order by bucket_usage.total_bytes desc
        ),
        '[]'::jsonb
      ),
      'source', 'storage.objects',
      'checkedAt', pg_catalog.statement_timestamp()
    )
  )
  into result
  from bucket_usage;

  return result;
end;
$$;

revoke all on function public.get_provider_storage_usage() from public, anon, authenticated;
grant execute on function public.get_provider_storage_usage() to service_role;

comment on function public.get_provider_storage_usage() is
  'Service-only, read-only totals derived from storage.objects metadata for provider monitoring.';

commit;
