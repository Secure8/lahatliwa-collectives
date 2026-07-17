begin;

-- Qualify the reservation column so it cannot be confused with the local
-- reserved_bytes variable during the pre-upload capacity check.
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
  select coalesce(sum(active_reservation.reserved_bytes),0) into reserved_bytes
    from public.storage_reservations active_reservation
    where active_reservation.status='reserved' and active_reservation.expires_at>now();
  proposed_bytes := policy.max_derivative_set_bytes;
  before_percent := ((active_bytes + reserved_bytes + policy.reserve_bytes)::numeric / policy.budget_bytes::numeric) * 100;
  after_percent := ((active_bytes + reserved_bytes + proposed_bytes + policy.reserve_bytes)::numeric / policy.budget_bytes::numeric) * 100;
  state := private.storage_policy_status(after_percent);
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

notify pgrst,'reload schema';
commit;
