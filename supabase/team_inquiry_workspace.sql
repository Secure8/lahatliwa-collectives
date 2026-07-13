-- Shared Team inquiry workspace built on project_inquiries.
-- Review and apply after service_request_portal.sql. This file is intentionally idempotent.

begin;

create or replace function private.is_active_inquiry_team_member(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1
    from public.admin_users member
    where member.user_id = check_user_id
      and member.status = 'active'
      and member.role in ('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer')
  );
$$;

alter table public.project_inquiries
  add column if not exists current_assignee_id uuid references public.admin_users(id) on delete set null,
  add column if not exists workflow_status text not null default 'new',
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references public.admin_users(id) on delete set null,
  add column if not exists completion_note text,
  add column if not exists closed_at timestamptz;

alter table public.project_inquiries drop constraint if exists project_inquiries_workflow_status_check;
alter table public.project_inquiries
  add constraint project_inquiries_workflow_status_check
  check (workflow_status in ('new', 'open', 'awaiting_response', 'assigned', 'accepted', 'in_progress', 'completed', 'closed'));

update public.project_inquiries inquiry
set current_assignee_id = member.id
from public.admin_users member
where inquiry.current_assignee_id is null
  and inquiry.assigned_creative_id is not null
  and member.creative_member_id = inquiry.assigned_creative_id
  and member.status = 'active';

update public.project_inquiries
set workflow_status = case
  when status = 'completed' then 'completed'
  when status = 'closed' then 'closed'
  when status = 'in_progress' then 'in_progress'
  when status = 'accepted' then 'accepted'
  when current_assignee_id is not null then 'awaiting_response'
  else 'open'
end
where workflow_status = 'new';

create index if not exists project_inquiries_workflow_created_idx
  on public.project_inquiries(workflow_status, created_at desc);
create index if not exists project_inquiries_current_assignee_idx
  on public.project_inquiries(current_assignee_id, created_at desc);

create table if not exists public.inquiry_member_responses (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.project_inquiries(id) on delete cascade,
  team_member_id uuid not null references public.admin_users(id) on delete cascade,
  response text not null check (response in ('available', 'declined', 'unavailable')),
  response_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inquiry_id, team_member_id)
);

create table if not exists public.inquiry_assignments (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.project_inquiries(id) on delete cascade,
  assigned_member_id uuid not null references public.admin_users(id) on delete restrict,
  assigned_by uuid references public.admin_users(id) on delete set null,
  assignment_type text not null check (assignment_type in ('client_selected', 'admin_assigned', 'transfer', 'assignment_request')),
  status text not null check (status in ('awaiting_response', 'accepted', 'declined', 'transferred', 'completed', 'ended')),
  previous_assignment_id uuid references public.inquiry_assignments(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  ended_at timestamptz
);

create unique index if not exists inquiry_assignments_one_current_idx
  on public.inquiry_assignments(inquiry_id)
  where ended_at is null and status in ('awaiting_response', 'accepted');
create index if not exists inquiry_assignments_history_idx
  on public.inquiry_assignments(inquiry_id, created_at desc);

create table if not exists public.inquiry_assignment_requests (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.project_inquiries(id) on delete cascade,
  requesting_member_id uuid not null references public.admin_users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note text,
  reviewed_by uuid references public.admin_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists inquiry_assignment_requests_pending_unique_idx
  on public.inquiry_assignment_requests(inquiry_id, requesting_member_id)
  where status = 'pending';
create index if not exists inquiry_assignment_requests_inquiry_idx
  on public.inquiry_assignment_requests(inquiry_id, created_at desc);

create table if not exists public.inquiry_read_receipts (
  inquiry_id uuid not null references public.project_inquiries(id) on delete cascade,
  team_member_id uuid not null references public.admin_users(id) on delete cascade,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  is_unread boolean not null default true,
  primary key (inquiry_id, team_member_id)
);

create index if not exists inquiry_read_receipts_member_unread_idx
  on public.inquiry_read_receipts(team_member_id, is_unread, inquiry_id);

create table if not exists public.inquiry_team_notifications (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.project_inquiries(id) on delete cascade,
  team_member_id uuid not null references public.admin_users(id) on delete cascade,
  notification_type text not null,
  message text not null,
  is_unread boolean not null default true,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create unique index if not exists inquiry_team_notifications_dedupe_idx
  on public.inquiry_team_notifications(inquiry_id, team_member_id, notification_type);
create index if not exists inquiry_team_notifications_member_unread_idx
  on public.inquiry_team_notifications(team_member_id, is_unread, created_at desc);

create table if not exists public.inquiry_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.project_inquiries(id) on delete cascade,
  delivery_key text not null,
  recipient_member_id uuid references public.admin_users(id) on delete set null,
  recipient_kind text not null check (recipient_kind in ('admin', 'creative', 'client', 'fallback', 'transfer')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  last_attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inquiry_id, delivery_key)
);

create index if not exists inquiry_delivery_attempts_inquiry_idx
  on public.inquiry_delivery_attempts(inquiry_id, created_at);

create table if not exists public.inquiry_private_notes (
  inquiry_id uuid primary key references public.project_inquiries(id) on delete cascade,
  note text,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.inquiry_private_notes (inquiry_id, note)
select id, internal_notes
from public.project_inquiries
where nullif(trim(internal_notes), '') is not null
on conflict (inquiry_id) do nothing;

update public.project_inquiries set internal_notes = null where internal_notes is not null;

create table if not exists public.inquiry_status_history (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.project_inquiries(id) on delete cascade,
  previous_status text,
  next_status text not null,
  changed_by uuid references public.admin_users(id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists inquiry_status_history_inquiry_idx
  on public.inquiry_status_history(inquiry_id, created_at desc);

create or replace function private.record_team_inquiry_workflow_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  actor_id uuid;
begin
  if old.workflow_status is distinct from new.workflow_status then
    select id into actor_id from public.admin_users where user_id = auth.uid() and status = 'active' limit 1;
    insert into public.inquiry_status_history (inquiry_id, previous_status, next_status, changed_by)
    values (new.id, old.workflow_status, new.workflow_status, actor_id);
  end if;
  return new;
end;
$$;

drop trigger if exists project_inquiries_record_workflow_change on public.project_inquiries;
create trigger project_inquiries_record_workflow_change
  after update of workflow_status on public.project_inquiries
  for each row execute function private.record_team_inquiry_workflow_change();

create or replace function private.initialize_team_inquiry_workspace()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  selected_member public.admin_users%rowtype;
begin
  if new.assigned_creative_id is not null then
    select * into selected_member
    from public.admin_users
    where creative_member_id = new.assigned_creative_id and status = 'active'
    order by created_at
    limit 1;
  end if;

  update public.project_inquiries
  set current_assignee_id = selected_member.id,
      workflow_status = case when selected_member.id is null then 'open' else 'awaiting_response' end
  where id = new.id;

  if selected_member.id is not null then
    insert into public.inquiry_assignments (inquiry_id, assigned_member_id, assignment_type, status)
    values (new.id, selected_member.id, 'client_selected', 'awaiting_response')
    on conflict do nothing;
  end if;

  insert into public.inquiry_read_receipts (inquiry_id, team_member_id, is_unread)
  select new.id, member.id, true
  from public.admin_users member
  where member.status = 'active'
    and member.user_id is not null
    and member.role in ('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer')
  on conflict (inquiry_id, team_member_id) do update set is_unread = true, first_seen_at = null, last_seen_at = null;

  insert into public.inquiry_team_notifications (inquiry_id, team_member_id, notification_type, message)
  select new.id, member.id, 'new_inquiry', 'A new inquiry is available in the Team workspace.'
  from public.admin_users member
  where member.status = 'active'
    and member.user_id is not null
    and member.role in ('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer')
  on conflict (inquiry_id, team_member_id, notification_type) do nothing;

  return new;
end;
$$;

drop trigger if exists project_inquiries_initialize_team_workspace on public.project_inquiries;
create trigger project_inquiries_initialize_team_workspace
  after insert on public.project_inquiries
  for each row execute function private.initialize_team_inquiry_workspace();

insert into public.inquiry_read_receipts (inquiry_id, team_member_id, is_unread)
select inquiry.id, member.id, coalesce(inquiry.unread, true)
from public.project_inquiries inquiry
cross join public.admin_users member
where member.status = 'active'
  and member.user_id is not null
  and member.role in ('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer')
on conflict (inquiry_id, team_member_id) do nothing;

insert into public.inquiry_assignments (inquiry_id, assigned_member_id, assignment_type, status)
select inquiry.id, inquiry.current_assignee_id, 'client_selected',
  case when inquiry.workflow_status in ('accepted', 'in_progress', 'completed') then 'accepted' else 'awaiting_response' end
from public.project_inquiries inquiry
where inquiry.current_assignee_id is not null
  and inquiry.workflow_status not in ('completed', 'closed')
  and not exists (
    select 1 from public.inquiry_assignments assignment
    where assignment.inquiry_id = inquiry.id and assignment.ended_at is null
  );

create or replace function public.list_inquiry_team_members()
returns table (id uuid, display_name text, role text, creative_member_id uuid, avatar_url text)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select member.id,
    coalesce(nullif(member.display_name, ''), 'Team member'),
    case when member.role = 'owner' then 'super_admin' else member.role end,
    member.creative_member_id,
    member.avatar_url
  from public.admin_users member
  where private.is_active_inquiry_team_member(auth.uid())
    and member.status = 'active'
    and member.user_id is not null
    and member.role in ('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer')
  order by member.display_name nulls last, member.created_at;
$$;

create or replace function public.perform_team_inquiry_action(
  p_inquiry_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  actor public.admin_users%rowtype;
  inquiry public.project_inquiries%rowtype;
  destination public.admin_users%rowtype;
  current_assignment public.inquiry_assignments%rowtype;
  requested_assignment public.inquiry_assignment_requests%rowtype;
  response_value text := nullif(trim(p_payload ->> 'response'), '');
  note_value text := nullif(left(trim(p_payload ->> 'note'), 2000), '');
  target_member_id uuid;
  request_id uuid;
  is_super_admin boolean;
begin
  select * into actor from public.admin_users where user_id = auth.uid() and status = 'active' limit 1;
  if actor.id is null or actor.role not in ('super_admin', 'owner', 'admin', 'editor', 'creative', 'viewer') then
    raise exception 'Only an active Team member may perform inquiry actions.' using errcode = '42501';
  end if;
  is_super_admin := actor.role in ('super_admin', 'owner');

  select * into inquiry from public.project_inquiries where id = p_inquiry_id for update;
  if inquiry.id is null then raise exception 'Inquiry not found.' using errcode = 'P0002'; end if;
  if nullif(p_payload ->> 'expected_workflow_status', '') is not null
    and inquiry.workflow_status <> p_payload ->> 'expected_workflow_status'
  then
    raise exception 'Inquiry state changed. Reload and try again.' using errcode = '40001';
  end if;

  if p_action = 'mark_read' then
    insert into public.inquiry_read_receipts (inquiry_id, team_member_id, first_seen_at, last_seen_at, is_unread)
    values (inquiry.id, actor.id, now(), now(), false)
    on conflict (inquiry_id, team_member_id) do update
      set first_seen_at = coalesce(inquiry_read_receipts.first_seen_at, now()), last_seen_at = now(), is_unread = false;
    update public.inquiry_team_notifications set is_unread = false, read_at = coalesce(read_at, now())
    where inquiry_id = inquiry.id and team_member_id = actor.id and is_unread = true;

  elsif p_action = 'respond' then
    if actor.creative_member_id is null then raise exception 'A linked creative profile is required.' using errcode = '42501'; end if;
    if response_value = 'clear' then
      delete from public.inquiry_member_responses where inquiry_id = inquiry.id and team_member_id = actor.id;
    elsif response_value in ('available', 'declined', 'unavailable') then
      insert into public.inquiry_member_responses (inquiry_id, team_member_id, response, response_note)
      values (inquiry.id, actor.id, response_value, note_value)
      on conflict (inquiry_id, team_member_id) do update
        set response = excluded.response, response_note = excluded.response_note, updated_at = now();
    else
      raise exception 'Invalid inquiry response.' using errcode = '22023';
    end if;

  elsif p_action = 'accept' then
    if inquiry.current_assignee_id is distinct from actor.id then raise exception 'Only the current assignee may accept.' using errcode = '42501'; end if;
    update public.inquiry_assignments set status = 'accepted', responded_at = now()
    where inquiry_id = inquiry.id and assigned_member_id = actor.id and ended_at is null;
    update public.project_inquiries set workflow_status = 'accepted', status = 'accepted', assigned_creative_id = actor.creative_member_id where id = inquiry.id;

  elsif p_action = 'decline' then
    if inquiry.current_assignee_id is distinct from actor.id then raise exception 'Only the current assignee may decline.' using errcode = '42501'; end if;
    update public.inquiry_assignments set status = 'declined', responded_at = now(), ended_at = now()
    where inquiry_id = inquiry.id and assigned_member_id = actor.id and ended_at is null;
    insert into public.inquiry_member_responses (inquiry_id, team_member_id, response, response_note)
    values (inquiry.id, actor.id, 'declined', note_value)
    on conflict (inquiry_id, team_member_id) do update set response = 'declined', response_note = excluded.response_note, updated_at = now();
    update public.project_inquiries set current_assignee_id = null, assigned_creative_id = null, workflow_status = 'open', status = 'under_review' where id = inquiry.id;

  elsif p_action in ('transfer', 'admin_assign') then
    if p_action = 'transfer' and inquiry.current_assignee_id is distinct from actor.id then raise exception 'Only the current assignee may transfer.' using errcode = '42501'; end if;
    if p_action = 'admin_assign' and not is_super_admin then raise exception 'Only the Super Admin may assign another member.' using errcode = '42501'; end if;
    target_member_id := nullif(p_payload ->> 'target_member_id', '')::uuid;
    select * into destination from public.admin_users
    where id = target_member_id and status = 'active' and user_id is not null and creative_member_id is not null;
    if destination.id is null or destination.id = inquiry.current_assignee_id then raise exception 'Choose another active creative.' using errcode = '22023'; end if;
    if exists (
      select 1 from public.inquiry_assignments previous
      where previous.inquiry_id = inquiry.id and previous.assigned_member_id = destination.id
        and previous.ended_at > now() - interval '24 hours'
    ) then raise exception 'This transfer would repeat a recent assignment loop.' using errcode = '23505'; end if;
    select * into current_assignment from public.inquiry_assignments
    where inquiry_id = inquiry.id and ended_at is null order by created_at desc limit 1 for update;
    if current_assignment.id is not null then
      update public.inquiry_assignments set status = 'transferred', ended_at = now(), reason = coalesce(note_value, reason) where id = current_assignment.id;
    end if;
    insert into public.inquiry_assignments (inquiry_id, assigned_member_id, assigned_by, assignment_type, status, previous_assignment_id, reason)
    values (inquiry.id, destination.id, actor.id, case when p_action = 'transfer' then 'transfer' else 'admin_assigned' end, 'awaiting_response', current_assignment.id, note_value);
    update public.project_inquiries set current_assignee_id = destination.id, assigned_creative_id = destination.creative_member_id, workflow_status = 'awaiting_response', status = 'under_review' where id = inquiry.id;
    insert into public.inquiry_team_notifications (inquiry_id, team_member_id, notification_type, message)
    values (inquiry.id, destination.id, 'assignment_received', 'An inquiry was assigned or transferred to you.')
    on conflict (inquiry_id, team_member_id, notification_type) do update set is_unread = true, read_at = null, created_at = now();

  elsif p_action = 'request_assignment' then
    if actor.creative_member_id is null or inquiry.current_assignee_id = actor.id then raise exception 'This assignment request is not allowed.' using errcode = '42501'; end if;
    if exists (select 1 from public.inquiry_assignment_requests where inquiry_id = inquiry.id and requesting_member_id = actor.id and status = 'pending') then
      raise exception 'You already requested this inquiry.' using errcode = '23505';
    end if;
    insert into public.inquiry_assignment_requests (inquiry_id, requesting_member_id, note)
    values (inquiry.id, actor.id, note_value);

  elsif p_action in ('approve_request', 'reject_request') then
    request_id := nullif(p_payload ->> 'request_id', '')::uuid;
    select * into requested_assignment from public.inquiry_assignment_requests where id = request_id and inquiry_id = inquiry.id for update;
    if requested_assignment.id is null or requested_assignment.status <> 'pending' then raise exception 'Assignment request is no longer pending.' using errcode = '40001'; end if;
    if not is_super_admin and inquiry.current_assignee_id is distinct from actor.id then raise exception 'Only the current assignee or Super Admin may review this request.' using errcode = '42501'; end if;
    if p_action = 'reject_request' then
      update public.inquiry_assignment_requests set status = 'rejected', reviewed_by = actor.id, reviewed_at = now() where id = requested_assignment.id;
    else
      select * into destination from public.admin_users where id = requested_assignment.requesting_member_id and status = 'active' and creative_member_id is not null;
      if destination.id is null then raise exception 'The requesting creative is no longer eligible.' using errcode = '42501'; end if;
      update public.inquiry_assignments set status = 'ended', ended_at = now() where inquiry_id = inquiry.id and ended_at is null;
      insert into public.inquiry_assignments (inquiry_id, assigned_member_id, assigned_by, assignment_type, status, reason)
      values (inquiry.id, destination.id, actor.id, 'assignment_request', 'awaiting_response', requested_assignment.note);
      update public.inquiry_assignment_requests set status = 'approved', reviewed_by = actor.id, reviewed_at = now() where id = requested_assignment.id;
      update public.project_inquiries set current_assignee_id = destination.id, assigned_creative_id = destination.creative_member_id, workflow_status = 'awaiting_response', status = 'under_review' where id = inquiry.id;
      insert into public.inquiry_team_notifications (inquiry_id, team_member_id, notification_type, message)
      values (inquiry.id, destination.id, 'assignment_received', 'Your request to take an inquiry was approved.')
      on conflict (inquiry_id, team_member_id, notification_type) do update set is_unread = true, read_at = null, created_at = now();
    end if;

  elsif p_action = 'start_progress' then
    if inquiry.current_assignee_id is distinct from actor.id or inquiry.workflow_status <> 'accepted' then raise exception 'Only the accepted assignee may start progress.' using errcode = '42501'; end if;
    update public.project_inquiries set workflow_status = 'in_progress', status = 'in_progress' where id = inquiry.id;

  elsif p_action = 'mark_completed' then
    if not is_super_admin and (inquiry.current_assignee_id is distinct from actor.id or inquiry.workflow_status not in ('accepted', 'in_progress')) then
      raise exception 'Only the accepted current assignee may complete this inquiry.' using errcode = '42501';
    end if;
    update public.inquiry_assignments set status = 'completed', ended_at = now() where inquiry_id = inquiry.id and ended_at is null;
    update public.project_inquiries set workflow_status = 'completed', status = 'completed', completed_at = now(), completed_by = actor.id, completion_note = note_value where id = inquiry.id;

  elsif p_action = 'close' then
    if not is_super_admin then raise exception 'Only the Super Admin may close an inquiry.' using errcode = '42501'; end if;
    update public.project_inquiries set workflow_status = 'closed', status = 'closed', closed_at = now() where id = inquiry.id;

  elsif p_action = 'private_note' then
    if not is_super_admin then raise exception 'Only the Super Admin may manage private notes.' using errcode = '42501'; end if;
    insert into public.inquiry_private_notes (inquiry_id, note, updated_by)
    values (inquiry.id, note_value, actor.id)
    on conflict (inquiry_id) do update set note = excluded.note, updated_by = actor.id, updated_at = now();

  elsif p_action = 'archive' then
    if not is_super_admin then raise exception 'Only the Super Admin may archive an inquiry.' using errcode = '42501'; end if;
    update public.project_inquiries set archived_at = now() where id = inquiry.id;

  else
    raise exception 'Invalid inquiry action.' using errcode = '22023';
  end if;

  return jsonb_build_object('success', true, 'inquiryId', inquiry.id, 'action', p_action);
end;
$$;

create or replace function public.execute_super_admin_inquiry_delete(
  p_inquiry_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  actor public.admin_users%rowtype;
  inquiry public.project_inquiries%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.' using errcode = '42501'; end if;
  select * into actor from public.admin_users where user_id = p_actor_user_id and status = 'active' and role in ('super_admin', 'owner') limit 1;
  if actor.id is null then raise exception 'Only an active Super Admin may permanently delete inquiries.' using errcode = '42501'; end if;
  select * into inquiry from public.project_inquiries where id = p_inquiry_id for update;
  if inquiry.id is null then raise exception 'Inquiry not found.' using errcode = 'P0002'; end if;
  if inquiry.workflow_status not in ('completed', 'closed') then raise exception 'Only completed or closed inquiries may be permanently deleted.' using errcode = '23514'; end if;

  delete from public.inquiry_member_responses where inquiry_id = inquiry.id;
  delete from public.inquiry_read_receipts where inquiry_id = inquiry.id;
  delete from public.inquiry_assignment_requests where inquiry_id = inquiry.id;
  delete from public.inquiry_assignments where inquiry_id = inquiry.id;
  delete from public.inquiry_team_notifications where inquiry_id = inquiry.id;
  delete from public.inquiry_delivery_attempts where inquiry_id = inquiry.id;
  delete from public.inquiry_private_notes where inquiry_id = inquiry.id;
  delete from public.inquiry_status_history where inquiry_id = inquiry.id;
  delete from public.project_inquiries where id = inquiry.id;

  if exists (select 1 from public.project_inquiries where id = inquiry.id) then raise exception 'Inquiry deletion verification failed.'; end if;
  return jsonb_build_object('success', true, 'inquiryId', inquiry.id);
end;
$$;

alter table public.project_inquiries enable row level security;
drop policy if exists "Public can create project inquiries" on public.project_inquiries;
drop policy if exists "Admins can manage project inquiries" on public.project_inquiries;
drop policy if exists "Site admins can read project inquiries" on public.project_inquiries;
drop policy if exists "Site admins can update project inquiries" on public.project_inquiries;
drop policy if exists "Public can submit valid project inquiries" on public.project_inquiries;
drop policy if exists "Authorized team can read project inquiries" on public.project_inquiries;
drop policy if exists "Active team can read project inquiries" on public.project_inquiries;
drop policy if exists "Inquiry admins can update project inquiries" on public.project_inquiries;
drop policy if exists "Team admins can update project inquiries" on public.project_inquiries;
drop policy if exists "Team admins can delete project inquiries" on public.project_inquiries;
drop policy if exists "Site admins can delete project inquiries" on public.project_inquiries;
create policy "Active Team can read every inquiry"
  on public.project_inquiries for select to authenticated
  using (private.is_active_inquiry_team_member(auth.uid()));

alter table public.inquiry_member_responses enable row level security;
alter table public.inquiry_assignments enable row level security;
alter table public.inquiry_assignment_requests enable row level security;
alter table public.inquiry_read_receipts enable row level security;
alter table public.inquiry_team_notifications enable row level security;
alter table public.inquiry_delivery_attempts enable row level security;
alter table public.inquiry_private_notes enable row level security;
alter table public.inquiry_status_history enable row level security;

drop policy if exists "Active Team can read inquiry responses" on public.inquiry_member_responses;
create policy "Active Team can read inquiry responses" on public.inquiry_member_responses for select to authenticated using (private.is_active_inquiry_team_member(auth.uid()));
drop policy if exists "Active Team can read inquiry assignments" on public.inquiry_assignments;
create policy "Active Team can read inquiry assignments" on public.inquiry_assignments for select to authenticated using (private.is_active_inquiry_team_member(auth.uid()));
drop policy if exists "Active Team can read assignment requests" on public.inquiry_assignment_requests;
create policy "Active Team can read assignment requests" on public.inquiry_assignment_requests for select to authenticated using (private.is_active_inquiry_team_member(auth.uid()));
drop policy if exists "Members can read own inquiry receipts" on public.inquiry_read_receipts;
create policy "Members can read own inquiry receipts" on public.inquiry_read_receipts for select to authenticated using (team_member_id = (select id from public.admin_users where user_id = auth.uid() and status = 'active' limit 1));
drop policy if exists "Members can read own inquiry notifications" on public.inquiry_team_notifications;
create policy "Members can read own inquiry notifications" on public.inquiry_team_notifications for select to authenticated using (team_member_id = (select id from public.admin_users where user_id = auth.uid() and status = 'active' limit 1));
drop policy if exists "Super Admin can read inquiry delivery attempts" on public.inquiry_delivery_attempts;
create policy "Super Admin can read inquiry delivery attempts" on public.inquiry_delivery_attempts for select to authenticated using (private.has_role(auth.uid(), array['super_admin']));
drop policy if exists "Super Admin can read inquiry private notes" on public.inquiry_private_notes;
create policy "Super Admin can read inquiry private notes" on public.inquiry_private_notes for select to authenticated using (private.has_role(auth.uid(), array['super_admin']));
drop policy if exists "Active Team can read inquiry status history" on public.inquiry_status_history;
create policy "Active Team can read inquiry status history" on public.inquiry_status_history for select to authenticated using (private.is_active_inquiry_team_member(auth.uid()));

revoke insert, update, delete on public.project_inquiries from anon, authenticated;
revoke select on public.project_inquiries from anon;
grant select on public.project_inquiries to authenticated;

revoke all on public.inquiry_member_responses, public.inquiry_assignments, public.inquiry_assignment_requests,
  public.inquiry_read_receipts, public.inquiry_team_notifications, public.inquiry_delivery_attempts,
  public.inquiry_private_notes, public.inquiry_status_history from anon;
revoke insert, update, delete on public.inquiry_member_responses, public.inquiry_assignments, public.inquiry_assignment_requests,
  public.inquiry_read_receipts, public.inquiry_team_notifications, public.inquiry_delivery_attempts,
  public.inquiry_private_notes, public.inquiry_status_history from authenticated;
grant select on public.inquiry_member_responses, public.inquiry_assignments, public.inquiry_assignment_requests,
  public.inquiry_read_receipts, public.inquiry_team_notifications, public.inquiry_delivery_attempts,
  public.inquiry_private_notes, public.inquiry_status_history to authenticated;

revoke all on function public.list_inquiry_team_members() from public, anon;
revoke all on function public.perform_team_inquiry_action(uuid, text, jsonb) from public, anon;
revoke all on function public.execute_super_admin_inquiry_delete(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_inquiry_team_members() to authenticated;
grant execute on function public.perform_team_inquiry_action(uuid, text, jsonb) to authenticated;
grant execute on function public.execute_super_admin_inquiry_delete(uuid, uuid) to service_role;
grant execute on function private.is_active_inquiry_team_member(uuid) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.project_inquiries;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.inquiry_member_responses;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.inquiry_assignments;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.inquiry_assignment_requests;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.inquiry_read_receipts;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
commit;
