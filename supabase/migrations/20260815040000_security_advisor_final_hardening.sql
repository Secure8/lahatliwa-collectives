begin;

-- pg_net 0.20.3 is non-relocatable and actively backs the cleanup worker's
-- net.http_post calls. Do not alter or drop it in an application migration.
-- Moving it requires a controlled Supabase maintenance window after the HTTP
-- queue and extension dependencies have been inspected.

-- Public REST wrappers remain SECURITY INVOKER. Their privileged
-- implementations live outside PostgREST's exposed public schema and retain
-- every existing ownership and role check.
create schema if not exists api_internal;
revoke all on schema api_internal from public, anon, authenticated;
grant usage on schema api_internal to anon, authenticated, service_role;

alter function public.get_public_website_studio() set schema api_internal;
alter function public.submit_creative_join_request(text,text,text,text) set schema api_internal;
alter function public.create_creative_post() set schema api_internal;
alter function public.save_creative_post(uuid,jsonb,timestamptz) set schema api_internal;
alter function public.publish_creative_post(uuid,text) set schema api_internal;
alter function public.archive_creative_post(uuid) set schema api_internal;
alter function public.restore_creative_post(uuid) set schema api_internal;
alter function public.delete_creative_post(uuid) set schema api_internal;
alter function public.moderate_creative_post(uuid,text,text) set schema api_internal;
alter function public.moderate_public_project(uuid,text) set schema api_internal;
alter function public.save_website_studio_draft(text,jsonb) set schema api_internal;
alter function public.publish_website_studio_entry(text) set schema api_internal;
alter function public.discard_website_studio_draft(text) set schema api_internal;

revoke all on all functions in schema api_internal from public, anon, authenticated;
grant execute on function api_internal.get_public_website_studio() to anon, authenticated, service_role;
grant execute on function api_internal.submit_creative_join_request(text,text,text,text) to anon, authenticated, service_role;
grant execute on function api_internal.create_creative_post(),
  api_internal.save_creative_post(uuid,jsonb,timestamptz),
  api_internal.publish_creative_post(uuid,text),
  api_internal.archive_creative_post(uuid),
  api_internal.restore_creative_post(uuid),
  api_internal.delete_creative_post(uuid),
  api_internal.moderate_creative_post(uuid,text,text),
  api_internal.moderate_public_project(uuid,text),
  api_internal.save_website_studio_draft(text,jsonb),
  api_internal.publish_website_studio_entry(text),
  api_internal.discard_website_studio_draft(text) to authenticated, service_role;

create function public.get_public_website_studio()
returns jsonb language sql stable security invoker
set search_path = pg_catalog, api_internal
as $$ select api_internal.get_public_website_studio() $$;

create function public.submit_creative_join_request(
  p_name text,
  p_email text,
  p_portfolio_url text default null,
  p_message text default null
) returns uuid language sql security invoker
set search_path = pg_catalog, api_internal
as $$ select api_internal.submit_creative_join_request(p_name,p_email,p_portfolio_url,p_message) $$;

create function public.create_creative_post()
returns public.creative_posts language plpgsql security invoker
set search_path = pg_catalog, api_internal, public
as $$ begin return api_internal.create_creative_post(); end $$;

create function public.save_creative_post(p_post_id uuid,p_document jsonb,p_expected_updated_at timestamptz default null)
returns public.creative_posts language plpgsql security invoker
set search_path = pg_catalog, api_internal, public
as $$ begin return api_internal.save_creative_post(p_post_id,p_document,p_expected_updated_at); end $$;

create function public.publish_creative_post(p_post_id uuid,p_guidelines_version text)
returns public.creative_posts language plpgsql security invoker
set search_path = pg_catalog, api_internal, public
as $$ begin return api_internal.publish_creative_post(p_post_id,p_guidelines_version); end $$;

create function public.archive_creative_post(p_post_id uuid)
returns public.creative_posts language plpgsql security invoker
set search_path = pg_catalog, api_internal, public
as $$ begin return api_internal.archive_creative_post(p_post_id); end $$;

create function public.restore_creative_post(p_post_id uuid)
returns public.creative_posts language plpgsql security invoker
set search_path = pg_catalog, api_internal, public
as $$ begin return api_internal.restore_creative_post(p_post_id); end $$;

create function public.delete_creative_post(p_post_id uuid)
returns jsonb language sql security invoker
set search_path = pg_catalog, api_internal
as $$ select api_internal.delete_creative_post(p_post_id) $$;

create function public.moderate_creative_post(p_post_id uuid,p_action text,p_reason text)
returns public.creative_posts language plpgsql security invoker
set search_path = pg_catalog, api_internal, public
as $$ begin return api_internal.moderate_creative_post(p_post_id,p_action,p_reason); end $$;

create function public.moderate_public_project(p_project_id uuid,p_reason text)
returns public.projects language plpgsql security invoker
set search_path = pg_catalog, api_internal, public
as $$ begin return api_internal.moderate_public_project(p_project_id,p_reason); end $$;

create function public.save_website_studio_draft(p_entry_key text,p_data jsonb)
returns public.website_studio_entries language plpgsql security invoker
set search_path = pg_catalog, api_internal, public
as $$ begin return api_internal.save_website_studio_draft(p_entry_key,p_data); end $$;

create function public.publish_website_studio_entry(p_entry_key text)
returns public.website_studio_entries language plpgsql security invoker
set search_path = pg_catalog, api_internal, public
as $$ begin return api_internal.publish_website_studio_entry(p_entry_key); end $$;

create function public.discard_website_studio_draft(p_entry_key text)
returns public.website_studio_entries language plpgsql security invoker
set search_path = pg_catalog, api_internal, public
as $$ begin return api_internal.discard_website_studio_draft(p_entry_key); end $$;

revoke all on function public.get_public_website_studio(),
  public.submit_creative_join_request(text,text,text,text),
  public.create_creative_post(), public.save_creative_post(uuid,jsonb,timestamptz),
  public.publish_creative_post(uuid,text), public.archive_creative_post(uuid),
  public.restore_creative_post(uuid), public.delete_creative_post(uuid),
  public.moderate_creative_post(uuid,text,text), public.moderate_public_project(uuid,text),
  public.save_website_studio_draft(text,jsonb), public.publish_website_studio_entry(text),
  public.discard_website_studio_draft(text) from public, anon, authenticated, service_role;

grant execute on function public.get_public_website_studio(),
  public.submit_creative_join_request(text,text,text,text) to anon, authenticated;
grant execute on function public.create_creative_post(), public.save_creative_post(uuid,jsonb,timestamptz),
  public.publish_creative_post(uuid,text), public.archive_creative_post(uuid),
  public.restore_creative_post(uuid), public.delete_creative_post(uuid),
  public.moderate_creative_post(uuid,text,text), public.moderate_public_project(uuid,text),
  public.save_website_studio_draft(text,jsonb), public.publish_website_studio_entry(text),
  public.discard_website_studio_draft(text) to authenticated;

-- These legacy Editorial Studio routes are no longer mounted by the V1 app.
-- Remove their externally callable signed-in surface while keeping the stored
-- functions intact for data retention and a possible controlled migration.
revoke execute on function public.approve_editorial_post(uuid,text),
  public.archive_editorial_post(uuid,text), public.delete_editorial_post(uuid),
  public.publish_editorial_post(uuid), public.request_editorial_changes(uuid,text),
  public.restore_archived_editorial_post(uuid), public.restore_editorial_revision(uuid,uuid),
  public.save_editorial_revision(uuid,jsonb,text,text,text,uuid,jsonb),
  public.schedule_editorial_post(uuid,timestamptz), public.start_editorial_revision(uuid),
  public.submit_editorial_post(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
