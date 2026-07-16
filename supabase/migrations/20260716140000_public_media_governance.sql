-- Public-media governance, migration, accounting, reservations, and reconciliation.
-- Apply after 20260716110000_cloudflare_r2_public_media.sql.
-- This migration does not discover, copy, switch, queue, or delete any media by itself.

begin;

alter table public.projects
  add column if not exists media_creation_state text not null default 'complete',
  add column if not exists media_draft_expires_at timestamptz;
alter table public.projects drop constraint if exists projects_media_creation_state_check;
alter table public.projects add constraint projects_media_creation_state_check
  check (media_creation_state in ('incomplete','complete'));

alter table public.creative_members
  add column if not exists media_creation_state text not null default 'complete',
  add column if not exists media_draft_expires_at timestamptz,
  add column if not exists media_draft_owner_user_id uuid references auth.users(id) on delete set null;
alter table public.creative_members drop constraint if exists creative_members_media_creation_state_check;
alter table public.creative_members add constraint creative_members_media_creation_state_check
  check (media_creation_state in ('incomplete','complete'));

create table if not exists public.storage_policies (
  singleton boolean primary key default true check (singleton),
  budget_bytes bigint not null default 9663676416 check (budget_bytes >= 1073741824),
  reserve_bytes bigint not null default 536870912 check (reserve_bytes >= 0),
  max_derivative_set_bytes bigint not null default 4147200 check (max_derivative_set_bytes between 1048576 and 16777216),
  large_upload_threshold_bytes bigint not null default 3145728 check (large_upload_threshold_bytes > 0),
  info_percent numeric(5,2) not null default 60,
  warning_percent numeric(5,2) not null default 75,
  strong_warning_percent numeric(5,2) not null default 85,
  restrict_large_percent numeric(5,2) not null default 90,
  pause_non_admin_percent numeric(5,2) not null default 95,
  block_percent numeric(5,2) not null default 100,
  migration_retention_days integer not null default 30 check (migration_retention_days between 1 and 365),
  provisional_retention_hours integer not null default 24 check (provisional_retention_hours between 1 and 168),
  draft_retention_hours integer not null default 72 check (draft_retention_hours between 1 and 720),
  migration_batch_size integer not null default 3 check (migration_batch_size between 1 and 10),
  reconciliation_recheck_hours integer not null default 24 check (reconciliation_recheck_hours between 1 and 168),
  emergency_supabase_fallback_enabled boolean not null default false,
  migration_paused boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (info_percent >= 0 and block_percent <= 100
    and info_percent < warning_percent and warning_percent < strong_warning_percent
    and strong_warning_percent < restrict_large_percent and restrict_large_percent < pause_non_admin_percent
    and pause_non_admin_percent < block_percent)
);
insert into public.storage_policies(singleton) values (true) on conflict (singleton) do nothing;

create table if not exists public.storage_reservations (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null unique,
  operation_kind text not null check (operation_kind in ('upload','replacement','migration','emergency_fallback')),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  creative_member_id uuid references public.creative_members(id) on delete set null,
  estimated_bytes bigint not null default 0 check (estimated_bytes >= 0),
  reserved_bytes bigint not null check (reserved_bytes > 0),
  actual_bytes bigint check (actual_bytes is null or actual_bytes >= 0),
  status text not null default 'reserved' check (status in ('reserved','consumed','released','expired')),
  policy_status text not null,
  utilization_before numeric(8,4) not null default 0,
  utilization_after numeric(8,4) not null default 0,
  override_used boolean not null default false,
  override_reason text,
  expires_at timestamptz not null,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((override_used and char_length(trim(override_reason)) between 8 and 500) or not override_used)
);
create index if not exists storage_reservations_active_idx on public.storage_reservations(status,expires_at);
create index if not exists storage_reservations_owner_idx on public.storage_reservations(owner_user_id,status);
create index if not exists storage_reservations_project_idx on public.storage_reservations(project_id,status) where project_id is not null;
create index if not exists storage_reservations_creative_idx on public.storage_reservations(creative_member_id,status) where creative_member_id is not null;

create table if not exists public.storage_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  outcome text not null check (outcome in ('allowed','blocked','completed','failed','manual_review')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists storage_audit_events_created_idx on public.storage_audit_events(created_at desc);
create index if not exists storage_audit_events_actor_idx on public.storage_audit_events(actor_user_id,created_at desc);

alter table public.external_media_objects
  add column if not exists trusted_size_bytes bigint,
  add column if not exists source_provider text,
  add column if not exists source_bucket text,
  add column if not exists source_path text,
  add column if not exists destination_bucket text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists accounting_state text not null default 'active',
  add column if not exists reservation_id uuid references public.storage_reservations(id) on delete set null,
  add column if not exists activated_at timestamptz,
  add column if not exists replaced_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists source_retention_until timestamptz,
  add column if not exists last_verified_at timestamptz,
  add column if not exists last_reconciled_at timestamptz;

-- Existing Supabase and Drive rows predate the accounting ledger. Keep them
-- renderable, but classify them as legacy rather than new active R2 media.
update public.external_media_objects
set accounting_state='legacy'
where provider in ('supabase','google_drive') and accounting_state='active' and status<>'deleted';

-- A successfully cleaned Supabase source intentionally loses its object path.
-- Preserve the provider trace while allowing that terminal ledger state.
alter table public.external_media_objects drop constraint if exists external_media_objects_provider_reference_check;
alter table public.external_media_objects add constraint external_media_objects_provider_reference_check check (
  (provider='supabase' and storage_connection_id is null and (status='deleted' or (bucket is not null and storage_path is not null)))
  or (provider='cloudflare_r2' and storage_connection_id is null and (status='deleted' or external_file_id is not null))
  or (provider not in ('supabase','cloudflare_r2') and storage_connection_id is not null)
);
alter table public.external_media_objects drop constraint if exists external_media_objects_trusted_size_check;
alter table public.external_media_objects add constraint external_media_objects_trusted_size_check
  check (trusted_size_bytes is null or trusted_size_bytes >= 0);
alter table public.external_media_objects drop constraint if exists external_media_objects_verification_status_check;
alter table public.external_media_objects add constraint external_media_objects_verification_status_check
  check (verification_status in ('unverified','pending','verified','failed','missing'));
alter table public.external_media_objects drop constraint if exists external_media_objects_accounting_state_check;
alter table public.external_media_objects add constraint external_media_objects_accounting_state_check
  check (accounting_state in ('active','legacy','provisional','retained_duplicate','pending_cleanup','reclaimable','failed','deleted','manual_review'));
create index if not exists external_media_accounting_idx on public.external_media_objects(provider,accounting_state,status);
create index if not exists external_media_owner_accounting_idx on public.external_media_objects(owner_user_id,provider,accounting_state);
create index if not exists external_media_project_accounting_idx on public.external_media_objects(project_id,provider,accounting_state) where project_id is not null;
create index if not exists external_media_creative_accounting_idx on public.external_media_objects(creative_member_id,provider,accounting_state) where creative_member_id is not null;

alter table public.storage_migrations
  alter column destination_connection_id drop not null,
  add column if not exists migration_identity text,
  add column if not exists source_record_type text,
  add column if not exists source_record_id uuid,
  add column if not exists source_field text,
  add column if not exists source_locator jsonb not null default '{}'::jsonb,
  add column if not exists source_mime_type text,
  add column if not exists source_extension text,
  add column if not exists source_checksum text,
  add column if not exists source_media_object_id uuid references public.external_media_objects(id) on delete set null,
  add column if not exists destination_media_group_id uuid,
  add column if not exists destination_bucket text,
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists creative_member_id uuid references public.creative_members(id) on delete set null,
  add column if not exists media_category text,
  add column if not exists destination_bytes bigint not null default 0,
  add column if not exists activated_at timestamptz,
  add column if not exists source_cleanup_queued_at timestamptz,
  add column if not exists source_deleted_at timestamptz,
  add column if not exists lock_token uuid,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists last_reconciled_at timestamptz,
  add column if not exists manual_review_reason text;
alter table public.storage_migrations drop constraint if exists storage_migrations_destination_provider_check;
alter table public.storage_migrations add constraint storage_migrations_destination_provider_check
  check (destination_provider in ('cloudflare_r2','google_drive','onedrive','dropbox','s3_compatible'));
alter table public.storage_migrations drop constraint if exists storage_migrations_source_provider_check;
alter table public.storage_migrations add constraint storage_migrations_source_provider_check
  check (source_provider in ('supabase','google_drive','cloudflare_r2','onedrive','dropbox','s3_compatible'));
alter table public.storage_migrations drop constraint if exists storage_migrations_status_check;
alter table public.storage_migrations add constraint storage_migrations_status_check check (status in (
  'not_started','queued','in_progress','uploaded','verified','activated','retained_for_rollback',
  'queued_for_source_deletion','completed','failed','manual_review','paused','cancelled','rolled_back',
  'copying','verifying','ready_to_switch','switched','retention_period'
));
alter table public.storage_migrations drop constraint if exists storage_migrations_source_locator_check;
alter table public.storage_migrations add constraint storage_migrations_source_locator_check
  check (jsonb_typeof(source_locator) = 'object');
create unique index if not exists storage_migrations_identity_idx on public.storage_migrations(migration_identity) where migration_identity is not null;
create index if not exists storage_migrations_work_idx on public.storage_migrations(status,locked_at,created_at);
create index if not exists storage_migrations_retention_idx on public.storage_migrations(retain_source_until,status);

alter table public.external_media_objects
  add column if not exists migration_id uuid references public.storage_migrations(id) on delete set null;
create index if not exists external_media_migration_idx on public.external_media_objects(migration_id) where migration_id is not null;

alter table public.storage_cleanup_jobs
  add column if not exists migration_id uuid references public.storage_migrations(id) on delete set null,
  add column if not exists estimated_bytes bigint check (estimated_bytes is null or estimated_bytes >= 0);
create index if not exists storage_cleanup_migration_idx on public.storage_cleanup_jobs(migration_id) where migration_id is not null;

drop function if exists public.claim_storage_cleanup_jobs(integer,text);
drop function if exists private.claim_storage_cleanup_jobs(integer,text);
create function private.claim_storage_cleanup_jobs(p_batch_size integer,p_worker_id text)
returns table(id uuid,provider text,bucket_name text,object_path text,attempt_count integer,migration_id uuid,estimated_bytes bigint)
language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if auth.role()<>'service_role' then raise exception 'Service worker authentication required.'; end if;
  return query with candidates as (
    select j.id from public.storage_cleanup_jobs j where (j.status='pending'
      or (j.status='failed' and (j.next_retry_at is null or j.next_retry_at<=now()))
      or (j.status='processing' and j.locked_at<now()-interval '15 minutes'))
      and j.attempt_count<8 and private.valid_cleanup_path(j.object_path)
    order by j.created_at for update skip locked limit greatest(1,least(p_batch_size,100))
  ) update public.storage_cleanup_jobs j set status='processing',worker_id=p_worker_id,locked_at=now(),started_at=now()
    from candidates c where j.id=c.id returning j.id,j.provider,j.bucket_name,j.object_path,j.attempt_count,j.migration_id,j.estimated_bytes;
end; $$;
create function public.claim_storage_cleanup_jobs(p_batch_size integer,p_worker_id text)
returns table(id uuid,provider text,bucket_name text,object_path text,attempt_count integer,migration_id uuid,estimated_bytes bigint)
language sql security invoker set search_path=public,private,pg_temp as $$ select * from private.claim_storage_cleanup_jobs(p_batch_size,p_worker_id); $$;
revoke all on function private.claim_storage_cleanup_jobs(integer,text) from public,anon,authenticated;
revoke all on function public.claim_storage_cleanup_jobs(integer,text) from public,anon,authenticated;
grant execute on function private.claim_storage_cleanup_jobs(integer,text) to service_role;
grant execute on function public.claim_storage_cleanup_jobs(integer,text) to service_role;

create table if not exists public.storage_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running','completed','failed')),
  requested_by uuid references auth.users(id) on delete set null,
  provider_scope text[] not null default array['cloudflare_r2','supabase']::text[],
  scanned_records integer not null default 0,
  scanned_objects integer not null default 0,
  finding_count integer not null default 0,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb check (jsonb_typeof(summary) = 'object')
);

create table if not exists public.storage_reconciliation_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.storage_reconciliation_runs(id) on delete cascade,
  finding_identity text not null,
  finding_type text not null check (finding_type in (
    'missing_r2_object','orphaned_r2_object','missing_supabase_source','retention_overdue',
    'incorrect_size','long_lived_provisional','failed_replacement','deleted_object_present',
    'broken_public_reference','migration_not_activated','duplicate_active_reference',
    'orphaned_supabase_object','unclassified_provider_object'
  )),
  provider text not null,
  severity text not null check (severity in ('info','warning','critical','manual_review')),
  media_object_id uuid references public.external_media_objects(id) on delete set null,
  migration_id uuid references public.storage_migrations(id) on delete set null,
  status text not null default 'detected' check (status in ('detected','rechecking','confirmed','cleanup_queued','resolved','manual_review')),
  first_detected_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  recheck_after timestamptz not null,
  confirmed_at timestamptz,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  unique(run_id,finding_identity)
);
create index if not exists storage_reconciliation_findings_status_idx on public.storage_reconciliation_findings(status,recheck_after);
create index if not exists storage_reconciliation_findings_type_idx on public.storage_reconciliation_findings(finding_type,provider);
create index if not exists storage_reconciliation_findings_identity_idx on public.storage_reconciliation_findings(finding_identity,last_checked_at desc);

create or replace function private.promote_repeated_storage_finding()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare previous public.storage_reconciliation_findings%rowtype;
begin
  select * into previous from public.storage_reconciliation_findings
  where finding_identity=new.finding_identity and status not in ('resolved','cleanup_queued')
  order by last_checked_at desc limit 1;
  if previous.id is not null then
    new.first_detected_at=least(previous.first_detected_at,new.first_detected_at);
    if previous.recheck_after<=now() and new.status='detected' then
      new.status='confirmed'; new.confirmed_at=now();
    elsif previous.status='manual_review' then
      new.status='manual_review';
    end if;
  end if;
  new.last_checked_at=now();
  return new;
end; $$;
drop trigger if exists storage_reconciliation_finding_recheck on public.storage_reconciliation_findings;
create trigger storage_reconciliation_finding_recheck before insert on public.storage_reconciliation_findings
for each row execute function private.promote_repeated_storage_finding();

create table if not exists public.storage_emergency_fallback_authorizations (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 8 and 500),
  target_category text not null,
  project_id uuid references public.projects(id) on delete cascade,
  creative_member_id uuid references public.creative_members(id) on delete cascade,
  status text not null default 'authorized' check (status in ('authorized','used','expired','revoked')),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists storage_emergency_fallback_active_idx on public.storage_emergency_fallback_authorizations(status,expires_at);

create or replace function private.is_active_super_admin(p_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.admin_users where user_id=p_user_id and status='active' and role in ('owner','super_admin'));
$$;

create or replace function private.storage_policy_status(p_percent numeric)
returns text language sql stable set search_path=public,pg_temp as $$
  select case
    when p_percent >= (select block_percent from public.storage_policies where singleton) then 'blocked'
    when p_percent >= (select pause_non_admin_percent from public.storage_policies where singleton) then 'paused'
    when p_percent >= (select restrict_large_percent from public.storage_policies where singleton) then 'restricted'
    when p_percent >= (select strong_warning_percent from public.storage_policies where singleton) then 'strong_warning'
    when p_percent >= (select warning_percent from public.storage_policies where singleton) then 'warning'
    when p_percent >= (select info_percent from public.storage_policies where singleton) then 'information'
    else 'normal' end;
$$;

create or replace function private.evaluate_public_media_budget(
  p_actor_user_id uuid, p_actor_role text, p_operation_kind text, p_estimated_bytes bigint,
  p_override boolean default false, p_override_reason text default null
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare
  policy public.storage_policies%rowtype;
  active_bytes bigint;
  reserved_bytes bigint;
  proposed_bytes bigint;
  before_percent numeric;
  after_percent numeric;
  state text;
  is_super boolean;
  allowed boolean := true;
  code text := null;
begin
  if auth.role() <> 'service_role' then raise exception 'Service authorization required.' using errcode='42501'; end if;
  select * into policy from public.storage_policies where singleton;
  select coalesce(sum(case when accounting_state='provisional' then coalesce(trusted_size_bytes,uploaded_bytes,0)
    else coalesce(trusted_size_bytes,uploaded_bytes,size_bytes,0) end),0) into active_bytes
    from public.external_media_objects where provider='cloudflare_r2' and status<>'deleted'
      and accounting_state in ('active','retained_duplicate','provisional');
  select coalesce(sum(reserved_bytes),0) into reserved_bytes from public.storage_reservations where status='reserved' and expires_at>now();
  proposed_bytes := policy.max_derivative_set_bytes;
  before_percent := ((active_bytes + reserved_bytes + policy.reserve_bytes)::numeric / policy.budget_bytes::numeric) * 100;
  after_percent := ((active_bytes + reserved_bytes + proposed_bytes + policy.reserve_bytes)::numeric / policy.budget_bytes::numeric) * 100;
  state := private.storage_policy_status(after_percent);
  -- This function is service-role only. The calling Edge Function derives the
  -- role from the authenticated team record before passing it here.
  is_super := p_actor_role in ('owner','super_admin');
  if after_percent >= policy.block_percent and not (is_super and p_override and char_length(trim(coalesce(p_override_reason,''))) between 8 and 500) then allowed:=false; code:='STORAGE_BUDGET_EXHAUSTED';
  elsif after_percent >= policy.pause_non_admin_percent and not is_super then allowed:=false; code:='STORAGE_UPLOADS_PAUSED';
  elsif after_percent >= policy.restrict_large_percent and proposed_bytes >= policy.large_upload_threshold_bytes and not is_super then allowed:=false; code:='STORAGE_LARGE_UPLOAD_RESTRICTED';
  elsif p_override and (not is_super or char_length(trim(coalesce(p_override_reason,''))) not between 8 and 500) then allowed:=false; code:='STORAGE_OVERRIDE_NOT_AUTHORIZED';
  end if;
  return jsonb_build_object('allowed',allowed,'code',code,'status',state,'budgetBytes',policy.budget_bytes,
    'activeBytes',active_bytes,'reservedBytes',reserved_bytes,'reserveBytes',policy.reserve_bytes,
    'proposedBytes',proposed_bytes,'estimatedClientBytes',greatest(0,coalesce(p_estimated_bytes,0)),
    'percentBefore',round(before_percent,2),'percentAfter',round(after_percent,2),
    'overrideAccepted',allowed and is_super and p_override);
end;
$$;

create or replace function private.reserve_public_media_bytes(
  p_operation_id uuid, p_operation_kind text, p_owner_user_id uuid, p_project_id uuid,
  p_creative_member_id uuid, p_actor_role text, p_estimated_bytes bigint,
  p_override boolean default false, p_override_reason text default null
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare result jsonb; policy public.storage_policies%rowtype; reservation public.storage_reservations%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service authorization required.' using errcode='42501'; end if;
  select * into policy from public.storage_policies where singleton for update;
  select * into reservation from public.storage_reservations where operation_id=p_operation_id;
  if reservation.id is not null then return jsonb_build_object('allowed',reservation.status='reserved','reservationId',reservation.id,'status',reservation.policy_status,'reservedBytes',reservation.reserved_bytes,'idempotent',true); end if;
  result := private.evaluate_public_media_budget(p_owner_user_id,p_actor_role,p_operation_kind,p_estimated_bytes,p_override,p_override_reason);
  if not coalesce((result->>'allowed')::boolean,false) then
    insert into public.storage_audit_events(actor_user_id,action,target_type,target_id,outcome,details)
      values(p_owner_user_id,'storage_reservation','operation',p_operation_id::text,'blocked',result);
    return result;
  end if;
  insert into public.storage_reservations(operation_id,operation_kind,owner_user_id,project_id,creative_member_id,
    estimated_bytes,reserved_bytes,status,policy_status,utilization_before,utilization_after,override_used,override_reason,expires_at)
  values(p_operation_id,p_operation_kind,p_owner_user_id,p_project_id,p_creative_member_id,greatest(0,coalesce(p_estimated_bytes,0)),
    policy.max_derivative_set_bytes,'reserved',result->>'status',coalesce((result->>'percentBefore')::numeric,0),
    coalesce((result->>'percentAfter')::numeric,0),coalesce((result->>'overrideAccepted')::boolean,false),
    case when coalesce((result->>'overrideAccepted')::boolean,false) then p_override_reason else null end,
    now() + make_interval(hours=>policy.provisional_retention_hours)) returning * into reservation;
  insert into public.storage_audit_events(actor_user_id,action,target_type,target_id,outcome,details)
    values(p_owner_user_id,case when reservation.override_used then 'storage_reservation_override' else 'storage_reservation' end,
      'reservation',reservation.id::text,'allowed',result || jsonb_build_object('reservationId',reservation.id));
  return result || jsonb_build_object('reservationId',reservation.id,'reservedBytes',reservation.reserved_bytes,'idempotent',false);
end;
$$;

create or replace function private.reconcile_storage_reservation(p_reservation_id uuid,p_actual_bytes bigint,p_success boolean,p_error text default null)
returns void language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service authorization required.' using errcode='42501'; end if;
  update public.storage_reservations set status=case when p_success then 'consumed' else 'released' end,
    actual_bytes=case when p_success then greatest(0,p_actual_bytes) else null end,reconciled_at=now(),updated_at=now()
  where id=p_reservation_id and status='reserved';
  insert into public.storage_audit_events(action,target_type,target_id,outcome,details)
    values('storage_reservation_reconciled','reservation',p_reservation_id::text,case when p_success then 'completed' else 'failed' end,
      jsonb_build_object('actualBytes',greatest(0,p_actual_bytes),'error',p_error));
end;
$$;

create or replace function private.claim_public_media_migrations(p_batch_size integer,p_worker_id text)
returns setof public.storage_migrations language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service authorization required.' using errcode='42501'; end if;
  update public.storage_migrations set lock_token=null,locked_at=null,locked_by=null,status=case when status='in_progress' then 'queued' else status end
    where destination_provider='cloudflare_r2' and locked_at < now()-interval '15 minutes' and status in ('in_progress','queued','uploaded','verified','activated');
  return query with candidates as (
    select id from public.storage_migrations where status in ('not_started','queued','failed','uploaded','verified','activated')
      and destination_provider='cloudflare_r2' and lock_token is null and attempt_count < 8 order by created_at for update skip locked limit greatest(1,least(p_batch_size,10))
  ) update public.storage_migrations m set status=case when m.status in ('not_started','queued','failed') then 'in_progress' else m.status end,
      lock_token=gen_random_uuid(),locked_at=now(),locked_by=p_worker_id,
      started_at=coalesce(started_at,now()),attempt_count=attempt_count+1,updated_at=now()
    from candidates c where m.id=c.id returning m.*;
end;
$$;

create or replace function public.evaluate_public_media_budget(
  p_actor_user_id uuid,p_actor_role text,p_operation_kind text,p_estimated_bytes bigint,
  p_override boolean default false,p_override_reason text default null
) returns jsonb language sql security invoker set search_path=public,private,pg_temp as $$
  select private.evaluate_public_media_budget(p_actor_user_id,p_actor_role,p_operation_kind,p_estimated_bytes,p_override,p_override_reason);
$$;
create or replace function public.reserve_public_media_bytes(
  p_operation_id uuid,p_operation_kind text,p_owner_user_id uuid,p_project_id uuid,p_creative_member_id uuid,
  p_actor_role text,p_estimated_bytes bigint,p_override boolean default false,p_override_reason text default null
) returns jsonb language sql security invoker set search_path=public,private,pg_temp as $$
  select private.reserve_public_media_bytes(p_operation_id,p_operation_kind,p_owner_user_id,p_project_id,p_creative_member_id,p_actor_role,p_estimated_bytes,p_override,p_override_reason);
$$;
create or replace function public.reconcile_storage_reservation(p_reservation_id uuid,p_actual_bytes bigint,p_success boolean,p_error text default null)
returns void language sql security invoker set search_path=public,private,pg_temp as $$
  select private.reconcile_storage_reservation(p_reservation_id,p_actual_bytes,p_success,p_error);
$$;
create or replace function public.claim_public_media_migrations(p_batch_size integer,p_worker_id text)
returns setof public.storage_migrations language sql security invoker set search_path=public,private,pg_temp as $$
  select * from private.claim_public_media_migrations(p_batch_size,p_worker_id);
$$;

create or replace function public.get_my_public_media_usage()
returns jsonb language sql stable security definer set search_path=public,private,pg_temp as $$
  select jsonb_build_object(
    'activeR2Bytes',coalesce(sum(coalesce(trusted_size_bytes,uploaded_bytes,size_bytes)) filter(where provider='cloudflare_r2' and accounting_state='active' and status='available'),0),
    'legacySupabaseBytes',coalesce(sum(coalesce(trusted_size_bytes,size_bytes)) filter(where provider='supabase' and accounting_state='legacy' and status='available'),0),
    'retainedBytes',coalesce(sum(coalesce(trusted_size_bytes,size_bytes)) filter(where accounting_state='retained_duplicate'),0),
    'provisionalBytes',coalesce(sum(coalesce(trusted_size_bytes,uploaded_bytes,0)) filter(where accounting_state='provisional'),0),
    'pendingCleanupBytes',coalesce(sum(coalesce(trusted_size_bytes,size_bytes)) filter(where accounting_state in ('pending_cleanup','reclaimable')),0),
    'objectCount',count(*),'mediaGroupCount',count(distinct media_group_id)
  ) from public.external_media_objects where owner_user_id=auth.uid();
$$;

create or replace function private.get_storage_governance_snapshot()
returns jsonb language plpgsql stable security definer set search_path=public,private,pg_temp as $$
declare result jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Service authorization required.' using errcode='42501'; end if;
  with media as (
    select *,coalesce(trusted_size_bytes,uploaded_bytes,size_bytes,0) trusted_bytes from public.external_media_objects
  ), migration as (select * from public.storage_migrations where destination_provider='cloudflare_r2'), cleanup as (select * from public.storage_cleanup_jobs),
  latest_recon as (select * from public.storage_reconciliation_runs order by started_at desc limit 1)
  select jsonb_build_object(
    'policy',(select to_jsonb(p)-'updated_by' from public.storage_policies p where singleton),
    'overview',jsonb_build_object(
      'activeR2Bytes',coalesce((select sum(trusted_bytes) from media where provider='cloudflare_r2' and accounting_state='active' and status='available'),0),
      'activeSupabaseBytes',coalesce((select sum(trusted_bytes) from media where provider='supabase' and accounting_state='legacy' and status in ('available','verification_required')),0),
      'activeDriveBytes',coalesce((select sum(trusted_bytes) from media where provider='google_drive' and accounting_state in ('active','legacy') and status='available'),0),
      'totalPublicMediaBytes',coalesce((select sum(trusted_bytes) from media where accounting_state in ('active','legacy','retained_duplicate','provisional')),0),
      'duplicatedMigrationBytes',coalesce((select sum(trusted_bytes) from media where accounting_state='retained_duplicate'),0),
      'provisionalBytes',coalesce((select sum(trusted_bytes) from media where accounting_state='provisional'),0),
      'pendingCleanupBytes',coalesce((select sum(trusted_bytes) from media where accounting_state in ('pending_cleanup','reclaimable')),0),
      'failedBytes',coalesce((select sum(trusted_bytes) from media where accounting_state in ('failed','manual_review')),0),
      'r2ObjectCount',(select count(*) from media where provider='cloudflare_r2' and status<>'deleted'),
      'supabaseObjectCount',(select count(*) from media where provider='supabase' and status<>'deleted'),
      'mediaGroupCount',(select count(distinct media_group_id) from media where media_group_id is not null),
      'activeDerivativeCount',(select count(*) from media where provider='cloudflare_r2' and status='available'),
      'lastSynchronizedAt',(select max(greatest(coalesce(last_verified_at,'epoch'),coalesce(last_reconciled_at,'epoch'))) from media)
    ),
    'migration',jsonb_build_object(
      'eligible',(select count(*) from migration where status not in ('completed','manual_review','cancelled','rolled_back')),
      'completed',(select count(*) from migration where status='completed'),
      'inProgress',(select count(*) from migration where status in ('in_progress','uploaded','verified','activated')),
      'failed',(select count(*) from migration where status='failed'),
      'manualReview',(select count(*) from migration where status='manual_review'),
      'uniqueSourceBytes',coalesce((select sum(bytes_total) from migration),0),
      'destinationBytes',coalesce((select sum(destination_bytes) from migration),0),
      'retainedSourceBytes',coalesce((select sum(bytes_total) from migration where status='retained_for_rollback'),0),
      'queuedDeletionBytes',coalesce((select sum(bytes_total) from migration where status='queued_for_source_deletion'),0),
      'estimatedRemainingRecords',(select count(*) from migration where status in ('not_started','queued','failed')),
      'estimatedRemainingSourceBytes',coalesce((select sum(bytes_total) from migration where status in ('not_started','queued','failed')),0),
      'lastBatchAt',(select max(started_at) from migration),
      'oldestPendingAt',(select min(created_at) from migration where status in ('not_started','queued','failed')),
      'latestError',(select last_error_message from migration where last_error_message is not null order by updated_at desc limit 1)
    ),
    'cleanup',jsonb_build_object(
      'pendingJobs',(select count(*) from cleanup where status='pending'),
      'retryingJobs',(select count(*) from cleanup where status='failed'),
      'manualReviewJobs',(select count(*) from cleanup where status='manual_review'),
      'oldestJobAt',(select min(created_at) from cleanup where status in ('pending','failed','manual_review')),
      'recoverableBytes',coalesce((select sum(estimated_bytes) from cleanup where status in ('pending','failed','manual_review')),0)
    ),
    'health',jsonb_build_object(
      'lastReconciliation',(select started_at from latest_recon),'lastReconciliationStatus',(select status from latest_recon),
      'lastSuccessfulReconciliation',(select max(completed_at) from public.storage_reconciliation_runs where status='completed'),
      'lastFailedReconciliation',(select max(completed_at) from public.storage_reconciliation_runs where status='failed'),
      'missingObjects',coalesce((select count(*) from public.storage_reconciliation_findings where finding_type in ('missing_r2_object','missing_supabase_source') and status<>'resolved'),0),
      'orphanedObjects',coalesce((select count(*) from public.storage_reconciliation_findings where finding_type in ('orphaned_r2_object','orphaned_supabase_object') and status<>'resolved'),0),
      'unclassifiedObjects',coalesce((select count(*) from public.storage_reconciliation_findings where finding_type='unclassified_provider_object' and status<>'resolved'),0),
      'unverifiedUploads',coalesce((select count(*) from media where provider='cloudflare_r2' and verification_status in ('unverified','pending') and status<>'deleted'),0),
      'failedVerifications',coalesce((select count(*) from media where verification_status='failed' and status<>'deleted'),0),
      'failedMigrations',coalesce((select count(*) from migration where status='failed'),0)
    ),
    'breakdowns',jsonb_build_object(
      'provider',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select provider,sum(trusted_bytes) bytes,count(*) objects from media group by provider order by bytes desc)x),
      'category',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select file_category category,sum(trusted_bytes) bytes,count(*) objects from media group by file_category order by bytes desc)x),
      'variant',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select coalesce(media_variant,'source') variant,sum(trusted_bytes) bytes,count(*) objects from media group by media_variant order by bytes desc)x),
      'lifecycle',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select accounting_state state,sum(trusted_bytes) bytes,count(*) objects from media group by accounting_state order by bytes desc)x),
      'migration',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select status,count(*) records,sum(bytes_total) source_bytes,sum(destination_bytes) destination_bytes from migration group by status order by records desc)x)
    ),
    'largestProjects',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select m.project_id,p.title,sum(m.trusted_bytes) bytes,count(*) objects from media m left join public.projects p on p.id=m.project_id where m.project_id is not null group by m.project_id,p.title order by bytes desc limit 10)x),
    'largestCreatives',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select m.creative_member_id,c.name,sum(m.trusted_bytes) bytes,count(*) objects from media m left join public.creative_members c on c.id=m.creative_member_id where m.creative_member_id is not null group by m.creative_member_id,c.name order by bytes desc limit 10)x),
    'largestOwners',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select m.owner_user_id,a.display_name,sum(m.trusted_bytes) bytes,count(*) objects,count(distinct m.media_group_id) media_groups from media m left join public.admin_users a on a.user_id=m.owner_user_id group by m.owner_user_id,a.display_name order by bytes desc limit 10)x)
  ) into result;
  return result;
end;
$$;

create or replace function public.get_storage_governance_snapshot()
returns jsonb language sql security invoker set search_path=public,private,pg_temp as $$ select private.get_storage_governance_snapshot(); $$;

create or replace view public.storage_usage_by_owner with (security_invoker=false,security_barrier=true) as
select owner_user_id,
  coalesce(sum(coalesce(trusted_size_bytes,uploaded_bytes,size_bytes)) filter(where provider='cloudflare_r2' and accounting_state='active' and status='available'),0) active_r2_bytes,
  coalesce(sum(coalesce(trusted_size_bytes,size_bytes)) filter(where provider='supabase' and accounting_state='legacy'),0) legacy_supabase_bytes,
  coalesce(sum(coalesce(trusted_size_bytes,size_bytes)) filter(where accounting_state='retained_duplicate'),0) retained_bytes,
  coalesce(sum(coalesce(trusted_size_bytes,uploaded_bytes,0)) filter(where accounting_state='provisional'),0) provisional_bytes,
  coalesce(sum(coalesce(trusted_size_bytes,size_bytes)) filter(where accounting_state in ('pending_cleanup','reclaimable')),0) pending_cleanup_bytes,
  count(*) object_count,count(distinct media_group_id) media_group_count
from public.external_media_objects
where private.is_active_super_admin(auth.uid()) group by owner_user_id;

create or replace view public.storage_usage_by_project with (security_invoker=false,security_barrier=true) as
select project_id,coalesce(sum(coalesce(trusted_size_bytes,uploaded_bytes,size_bytes)),0) tracked_bytes,
  count(*) object_count,count(distinct media_group_id) media_group_count
from public.external_media_objects where project_id is not null and private.is_active_super_admin(auth.uid()) group by project_id;

create or replace view public.storage_usage_by_creative with (security_invoker=false,security_barrier=true) as
select creative_member_id,coalesce(sum(coalesce(trusted_size_bytes,uploaded_bytes,size_bytes)),0) tracked_bytes,
  count(*) object_count,count(distinct media_group_id) media_group_count
from public.external_media_objects where creative_member_id is not null and private.is_active_super_admin(auth.uid()) group by creative_member_id;

alter table public.storage_policies enable row level security;
alter table public.storage_reservations enable row level security;
alter table public.storage_audit_events enable row level security;
alter table public.storage_reconciliation_runs enable row level security;
alter table public.storage_reconciliation_findings enable row level security;
alter table public.storage_emergency_fallback_authorizations enable row level security;

drop policy if exists "Super admins read storage policy" on public.storage_policies;
create policy "Super admins read storage policy" on public.storage_policies for select to authenticated using(private.is_active_super_admin(auth.uid()));
drop policy if exists "Super admins read storage reservations" on public.storage_reservations;
create policy "Super admins read storage reservations" on public.storage_reservations for select to authenticated using(private.is_active_super_admin(auth.uid()));
drop policy if exists "Super admins read storage audit" on public.storage_audit_events;
create policy "Super admins read storage audit" on public.storage_audit_events for select to authenticated using(private.is_active_super_admin(auth.uid()));
drop policy if exists "Super admins read reconciliation runs" on public.storage_reconciliation_runs;
create policy "Super admins read reconciliation runs" on public.storage_reconciliation_runs for select to authenticated using(private.is_active_super_admin(auth.uid()));
drop policy if exists "Super admins read reconciliation findings" on public.storage_reconciliation_findings;
create policy "Super admins read reconciliation findings" on public.storage_reconciliation_findings for select to authenticated using(private.is_active_super_admin(auth.uid()));
drop policy if exists "Super admins read emergency fallback authorizations" on public.storage_emergency_fallback_authorizations;
create policy "Super admins read emergency fallback authorizations" on public.storage_emergency_fallback_authorizations for select to authenticated using(private.is_active_super_admin(auth.uid()));

revoke all on public.storage_policies,public.storage_reservations,public.storage_audit_events,
  public.storage_reconciliation_runs,public.storage_reconciliation_findings,public.storage_emergency_fallback_authorizations from public,anon,authenticated;
grant select on public.storage_policies,public.storage_reservations,public.storage_audit_events,
  public.storage_reconciliation_runs,public.storage_reconciliation_findings,public.storage_emergency_fallback_authorizations to authenticated;
grant select on public.storage_usage_by_owner,public.storage_usage_by_project,public.storage_usage_by_creative to authenticated;
revoke all on function public.get_my_public_media_usage() from public,anon;
grant execute on function public.get_my_public_media_usage() to authenticated;
revoke all on function private.promote_repeated_storage_finding() from public,anon,authenticated;
revoke all on function private.evaluate_public_media_budget(uuid,text,text,bigint,boolean,text) from public,anon,authenticated;
revoke all on function private.reserve_public_media_bytes(uuid,text,uuid,uuid,uuid,text,bigint,boolean,text) from public,anon,authenticated;
revoke all on function private.reconcile_storage_reservation(uuid,bigint,boolean,text) from public,anon,authenticated;
revoke all on function private.claim_public_media_migrations(integer,text) from public,anon,authenticated;
revoke all on function public.evaluate_public_media_budget(uuid,text,text,bigint,boolean,text) from public,anon,authenticated;
revoke all on function public.reserve_public_media_bytes(uuid,text,uuid,uuid,uuid,text,bigint,boolean,text) from public,anon,authenticated;
revoke all on function public.reconcile_storage_reservation(uuid,bigint,boolean,text) from public,anon,authenticated;
revoke all on function public.claim_public_media_migrations(integer,text) from public,anon,authenticated;
revoke all on function private.get_storage_governance_snapshot() from public,anon,authenticated;
revoke all on function public.get_storage_governance_snapshot() from public,anon,authenticated;
grant execute on function private.evaluate_public_media_budget(uuid,text,text,bigint,boolean,text) to service_role;
grant execute on function private.reserve_public_media_bytes(uuid,text,uuid,uuid,uuid,text,bigint,boolean,text) to service_role;
grant execute on function private.reconcile_storage_reservation(uuid,bigint,boolean,text) to service_role;
grant execute on function private.claim_public_media_migrations(integer,text) to service_role;
grant execute on function public.evaluate_public_media_budget(uuid,text,text,bigint,boolean,text) to service_role;
grant execute on function public.reserve_public_media_bytes(uuid,text,uuid,uuid,uuid,text,bigint,boolean,text) to service_role;
grant execute on function public.reconcile_storage_reservation(uuid,bigint,boolean,text) to service_role;
grant execute on function public.claim_public_media_migrations(integer,text) to service_role;
grant execute on function private.get_storage_governance_snapshot() to service_role;
grant execute on function public.get_storage_governance_snapshot() to service_role;

comment on table public.storage_policies is 'Protected configurable public-media budget, threshold, retention, migration, and emergency policy.';
comment on table public.storage_reservations is 'Conservative server-authorized R2 capacity reservations reconciled to provider-verified bytes.';
comment on table public.storage_reconciliation_findings is 'Cached detect/recheck findings. Findings never authorize immediate physical deletion.';
comment on column public.external_media_objects.external_file_id is 'Private provider key. Never grant this column to public or ordinary authenticated queries.';

notify pgrst,'reload schema';
commit;
