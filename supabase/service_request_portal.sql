-- Secure, server-owned service request workflow built on the existing inquiry table.
-- Review and apply after the current team/RBAC and collective inquiry migrations.

begin;

alter table public.project_inquiries
  add column if not exists public_reference text,
  add column if not exists branch text,
  add column if not exists service_key text,
  add column if not exists client_email text,
  add column if not exists client_phone text,
  add column if not exists summary text,
  add column if not exists details text,
  add column if not exists preferred_schedule text,
  add column if not exists service_mode text,
  add column if not exists general_location text,
  add column if not exists request_metadata jsonb not null default '{}'::jsonb,
  add column if not exists source_path text,
  add column if not exists assigned_creative_id uuid references public.creative_members(id) on delete set null,
  add column if not exists internal_notes text,
  add column if not exists archived_at timestamptz,
  add column if not exists unread boolean not null default true,
  add column if not exists notification_status text not null default 'pending',
  add column if not exists notification_attempts integer not null default 0,
  add column if not exists notification_state jsonb not null default '{}'::jsonb,
  add column if not exists notification_error text,
  add column if not exists notified_at timestamptz,
  add column if not exists idempotency_key uuid,
  add column if not exists submitter_hash text;

create unique index if not exists project_inquiries_public_reference_unique_idx
  on public.project_inquiries(public_reference) where public_reference is not null;
create unique index if not exists project_inquiries_idempotency_unique_idx
  on public.project_inquiries(idempotency_key) where idempotency_key is not null;
create index if not exists project_inquiries_branch_status_created_idx
  on public.project_inquiries(branch, status, created_at desc);
create index if not exists project_inquiries_assigned_creative_idx
  on public.project_inquiries(assigned_creative_id, created_at desc);
create index if not exists project_inquiries_unread_idx
  on public.project_inquiries(unread, created_at desc) where archived_at is null;
create index if not exists project_inquiries_submitter_created_idx
  on public.project_inquiries(submitter_hash, created_at desc);

alter table public.project_inquiries drop constraint if exists project_inquiries_status_check;
alter table public.project_inquiries drop constraint if exists project_inquiries_branch_check;
alter table public.project_inquiries drop constraint if exists project_inquiries_notification_status_check;
alter table public.project_inquiries
  add constraint project_inquiries_status_check check (status in ('new', 'reviewed', 'under_review', 'contacted', 'scheduled', 'accepted', 'in_progress', 'completed', 'declined', 'closed')),
  add constraint project_inquiries_branch_check check (branch is null or branch in ('studio', 'tech', 'digital', 'social', 'general')),
  add constraint project_inquiries_notification_status_check check (notification_status in ('pending', 'sent', 'partially_sent', 'failed'));

create table if not exists public.creative_notification_preferences (
  creative_member_id uuid primary key references public.creative_members(id) on delete cascade,
  notification_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_notification_preferences_email_check check (
    notification_email is null
    or (char_length(notification_email) between 3 and 254 and notification_email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')
  )
);

alter table public.creative_notification_preferences enable row level security;
drop trigger if exists creative_notification_preferences_set_updated_at on public.creative_notification_preferences;
create trigger creative_notification_preferences_set_updated_at
  before update on public.creative_notification_preferences
  for each row execute function public.set_updated_at();
drop policy if exists "Creatives can read own inquiry notification preference" on public.creative_notification_preferences;
create policy "Creatives can read own inquiry notification preference"
  on public.creative_notification_preferences for select to authenticated
  using (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid() and au.status = 'active' and au.creative_member_id = creative_notification_preferences.creative_member_id)
    or private.has_role(auth.uid(), array['super_admin', 'owner'])
  );
drop policy if exists "Creatives can create own inquiry notification preference" on public.creative_notification_preferences;
create policy "Creatives can create own inquiry notification preference"
  on public.creative_notification_preferences for insert to authenticated
  with check (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid() and au.status = 'active' and au.creative_member_id = creative_notification_preferences.creative_member_id)
    or private.has_role(auth.uid(), array['super_admin', 'owner'])
  );
drop policy if exists "Creatives can update own inquiry notification preference" on public.creative_notification_preferences;
create policy "Creatives can update own inquiry notification preference"
  on public.creative_notification_preferences for update to authenticated
  using (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid() and au.status = 'active' and au.creative_member_id = creative_notification_preferences.creative_member_id)
    or private.has_role(auth.uid(), array['super_admin', 'owner'])
  )
  with check (
    exists (select 1 from public.admin_users au where au.user_id = auth.uid() and au.status = 'active' and au.creative_member_id = creative_notification_preferences.creative_member_id)
    or private.has_role(auth.uid(), array['super_admin', 'owner'])
  );

grant select, insert, update on public.creative_notification_preferences to authenticated;
revoke all on public.creative_notification_preferences from anon;

create or replace function public.list_eligible_inquiry_creatives()
returns table (id uuid, name text, slug text, role text, profile_image_url text)
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select cm.id, cm.name, cm.slug, cm.role, cm.profile_image_url
  from public.creative_members cm
  where cm.is_published = true
    and exists (
      select 1 from public.admin_users au
      where au.creative_member_id = cm.id
        and au.status = 'active'
        and au.user_id is not null
    )
  order by cm.display_order nulls last, cm.name;
$$;

revoke all on function public.list_eligible_inquiry_creatives() from public;
grant execute on function public.list_eligible_inquiry_creatives() to anon, authenticated;

create table if not exists private.project_inquiry_status_history (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.project_inquiries(id) on delete cascade,
  previous_status text,
  next_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists project_inquiry_status_history_inquiry_idx
  on private.project_inquiry_status_history(inquiry_id, created_at desc);
alter table private.project_inquiry_status_history enable row level security;
drop policy if exists "Authorized team can read inquiry history" on private.project_inquiry_status_history;
create policy "Authorized team can read inquiry history"
  on private.project_inquiry_status_history for select to authenticated
  using (
    exists (
      select 1 from public.project_inquiries inquiry
      where inquiry.id = project_inquiry_status_history.inquiry_id
        and (
          private.has_role(auth.uid(), array['super_admin', 'owner', 'admin'])
          or coalesce(inquiry.assigned_creative_id, inquiry.preferred_creative_id) = private.current_creative_member_id()
        )
    )
  );
grant select on private.project_inquiry_status_history to authenticated;
revoke all on private.project_inquiry_status_history from anon;

create or replace function private.record_project_inquiry_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if old.status is distinct from new.status then
    insert into private.project_inquiry_status_history (inquiry_id, previous_status, next_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists project_inquiries_record_status_change on public.project_inquiries;
create trigger project_inquiries_record_status_change
  after update of status on public.project_inquiries
  for each row execute function private.record_project_inquiry_status_change();

alter table public.project_inquiries enable row level security;
drop policy if exists "Public can create project inquiries" on public.project_inquiries;
drop policy if exists "Public can submit valid project inquiries" on public.project_inquiries;
drop policy if exists "Admins can manage project inquiries" on public.project_inquiries;
drop policy if exists "Site admins can read project inquiries" on public.project_inquiries;
drop policy if exists "Site admins can update project inquiries" on public.project_inquiries;
drop policy if exists "Site admins can delete project inquiries" on public.project_inquiries;
drop policy if exists "Active team can read project inquiries" on public.project_inquiries;
drop policy if exists "Team admins can update project inquiries" on public.project_inquiries;
drop policy if exists "Team admins can delete project inquiries" on public.project_inquiries;
drop policy if exists "Authorized team can read project inquiries" on public.project_inquiries;
drop policy if exists "Inquiry admins can update project inquiries" on public.project_inquiries;

create policy "Authorized team can read project inquiries"
  on public.project_inquiries for select to authenticated
  using (
    private.has_role(auth.uid(), array['super_admin', 'owner', 'admin'])
    or (
      exists (select 1 from public.admin_users au where au.user_id = auth.uid() and au.status = 'active')
      and (
        coalesce(assigned_creative_id, preferred_creative_id) = private.current_creative_member_id()
      )
    )
  );

create policy "Inquiry admins can update project inquiries"
  on public.project_inquiries for update to authenticated
  using (private.has_role(auth.uid(), array['super_admin', 'owner', 'admin']))
  with check (private.has_role(auth.uid(), array['super_admin', 'owner', 'admin']));

revoke insert, delete on public.project_inquiries from anon, authenticated;
revoke select, update on public.project_inquiries from anon;
grant select, update on public.project_inquiries to authenticated;

notify pgrst, 'reload schema';
commit;
