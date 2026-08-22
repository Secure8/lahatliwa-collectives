-- Limited, approval-based featured work placements.
create table if not exists public.featured_work_requests (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.creative_posts(id) on delete cascade,
  media_id uuid references public.creative_post_media(id) on delete set null,
  creative_member_id uuid not null references public.creative_members(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn','removed')),
  request_note text check (length(coalesce(request_note,'')) <= 500),
  admin_note text check (length(coalesce(admin_note,'')) <= 500),
  slot_position smallint check (slot_position between 1 and 6),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index if not exists featured_work_approved_slot_idx
  on public.featured_work_requests(slot_position) where status = 'approved';
create unique index if not exists featured_work_active_post_idx
  on public.featured_work_requests(post_id) where status in ('pending','approved');
create index if not exists featured_work_status_idx
  on public.featured_work_requests(status, requested_at desc);

alter table public.featured_work_requests enable row level security;

create policy featured_work_public_read on public.featured_work_requests
  for select to anon, authenticated using (status = 'approved');
create policy featured_work_owner_read on public.featured_work_requests
  for select to authenticated using (private.owns_creative_post(auth.uid(), post_id));
create policy featured_work_moderator_read on public.featured_work_requests
  for select to authenticated using (private.can_moderate_creative_posts(auth.uid()));

grant select on public.featured_work_requests to anon, authenticated;

create or replace function public.request_featured_work(
  p_post_id uuid,
  p_media_id uuid default null,
  p_note text default null
) returns public.featured_work_requests
language plpgsql security definer set search_path = '' as $$
declare
  target public.creative_posts;
  chosen_media uuid;
  result public.featured_work_requests;
begin
  if auth.uid() is null or not private.owns_creative_post(auth.uid(), p_post_id) then
    raise exception 'FEATURED_WORK_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  select * into target from public.creative_posts where id = p_post_id;
  if target.id is null or target.status <> 'published' or target.visibility <> 'public' or target.moderation_status <> 'clear' then
    raise exception 'FEATURED_WORK_REQUIRES_PUBLIC_POST' using errcode = '22023';
  end if;
  select id into chosen_media from public.creative_post_media
    where post_id = p_post_id and (p_media_id is null or id = p_media_id)
    order by display_order limit 1;
  if chosen_media is null then
    raise exception 'FEATURED_WORK_REQUIRES_IMAGE' using errcode = '22023';
  end if;
  if exists(select 1 from public.featured_work_requests where post_id = p_post_id and status in ('pending','approved')) then
    raise exception 'FEATURED_WORK_ALREADY_ACTIVE' using errcode = '23505';
  end if;
  insert into public.featured_work_requests(post_id, media_id, creative_member_id, requested_by, request_note)
  values(p_post_id, chosen_media, target.creative_member_id, auth.uid(), nullif(btrim(coalesce(p_note,'')),''))
  returning * into result;
  return result;
end;
$$;

create or replace function public.withdraw_featured_work_request(p_request_id uuid)
returns public.featured_work_requests
language plpgsql security definer set search_path = '' as $$
declare result public.featured_work_requests;
begin
  update public.featured_work_requests
    set status = 'withdrawn', slot_position = null, updated_at = now()
    where id = p_request_id and status = 'pending'
      and private.owns_creative_post(auth.uid(), post_id)
    returning * into result;
  if result.id is null then raise exception 'FEATURED_WORK_NOT_AUTHORIZED' using errcode = '42501'; end if;
  return result;
end;
$$;

create or replace function public.review_featured_work_request(
  p_request_id uuid,
  p_action text,
  p_slot_position smallint default null,
  p_admin_note text default null
) returns public.featured_work_requests
language plpgsql security definer set search_path = '' as $$
declare result public.featured_work_requests;
begin
  if not private.can_moderate_creative_posts(auth.uid()) then
    raise exception 'SUPER_ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_action not in ('approve','reject','remove') then raise exception 'FEATURED_WORK_ACTION_INVALID' using errcode = '22023'; end if;
  if p_action = 'approve' and (p_slot_position is null or p_slot_position not between 1 and 6) then
    raise exception 'FEATURED_WORK_SLOT_INVALID' using errcode = '22023';
  end if;
  if p_action = 'approve' then
    update public.featured_work_requests set status='removed', slot_position=null, reviewed_at=now(), updated_at=now()
      where status='approved' and slot_position=p_slot_position and id<>p_request_id;
  end if;
  update public.featured_work_requests set
    status = case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'removed' end,
    slot_position = case when p_action='approve' then p_slot_position else null end,
    admin_note = nullif(btrim(coalesce(p_admin_note,'')),''), approved_by=auth.uid(), reviewed_at=now(), updated_at=now()
    where id=p_request_id returning * into result;
  if result.id is null then raise exception 'FEATURED_WORK_REQUEST_NOT_FOUND' using errcode='P0002'; end if;
  return result;
end;
$$;

create or replace function public.set_featured_work_slot(
  p_post_id uuid,
  p_media_id uuid,
  p_slot_position smallint,
  p_admin_note text default null
) returns public.featured_work_requests
language plpgsql security definer set search_path = '' as $$
declare target public.creative_posts; result public.featured_work_requests;
begin
  if not private.can_moderate_creative_posts(auth.uid()) then raise exception 'SUPER_ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_slot_position not between 1 and 6 then raise exception 'FEATURED_WORK_SLOT_INVALID' using errcode='22023'; end if;
  select * into target from public.creative_posts where id=p_post_id and status='published' and visibility='public' and moderation_status='clear';
  if target.id is null or not exists(select 1 from public.creative_post_media where id=p_media_id and post_id=p_post_id) then
    raise exception 'FEATURED_WORK_INVALID' using errcode='22023';
  end if;
  update public.featured_work_requests set status='removed',slot_position=null,reviewed_at=now(),updated_at=now()
    where (status='approved' and slot_position=p_slot_position)
       or (post_id=p_post_id and status in ('pending','approved'));
  insert into public.featured_work_requests(post_id,media_id,creative_member_id,status,slot_position,admin_note,approved_by,reviewed_at)
    values(p_post_id,p_media_id,target.creative_member_id,'approved',p_slot_position,nullif(btrim(coalesce(p_admin_note,'')),''),auth.uid(),now())
    returning * into result;
  return result;
end;
$$;

create or replace function public.clear_featured_work_slot(p_slot_position smallint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_moderate_creative_posts(auth.uid()) then raise exception 'SUPER_ADMIN_REQUIRED' using errcode='42501'; end if;
  update public.featured_work_requests set status='removed',slot_position=null,reviewed_at=now(),updated_at=now()
    where status='approved' and slot_position=p_slot_position;
end;
$$;

revoke all on function public.request_featured_work(uuid,uuid,text), public.withdraw_featured_work_request(uuid),
  public.review_featured_work_request(uuid,text,smallint,text), public.set_featured_work_slot(uuid,uuid,smallint,text),
  public.clear_featured_work_slot(smallint) from public, anon, service_role;
grant execute on function public.request_featured_work(uuid,uuid,text), public.withdraw_featured_work_request(uuid),
  public.review_featured_work_request(uuid,text,smallint,text), public.set_featured_work_slot(uuid,uuid,smallint,text),
  public.clear_featured_work_slot(smallint) to authenticated;
