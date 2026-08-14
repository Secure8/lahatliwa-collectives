begin;

alter table public.creative_members
  add column if not exists profile_template text not null default 'social';

alter table public.creative_members drop constraint if exists creative_members_profile_template_check;
alter table public.creative_members add constraint creative_members_profile_template_check
  check (profile_template in ('social', 'showcase', 'gallery', 'editorial'));

create table if not exists public.creative_notifications (
  id uuid primary key default gen_random_uuid(),
  creative_member_id uuid not null references public.creative_members(id) on delete cascade,
  inquiry_id uuid not null references public.project_inquiries(id) on delete cascade,
  title text not null,
  preview text not null,
  source_path text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (creative_member_id, inquiry_id)
);

create index if not exists creative_notifications_member_created_idx
  on public.creative_notifications(creative_member_id, created_at desc);
create index if not exists creative_notifications_member_unread_idx
  on public.creative_notifications(creative_member_id, created_at desc) where read_at is null;

create or replace function private.create_targeted_creative_notification()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare target_id uuid := coalesce(new.assigned_creative_id, new.preferred_creative_id);
begin
  if target_id is null then return new; end if;
  insert into public.creative_notifications(creative_member_id, inquiry_id, title, preview, source_path)
  values (
    target_id,
    new.id,
    coalesce(nullif(trim(new.summary), ''), 'New private inquiry'),
    left(coalesce(nullif(trim(new.details), ''), nullif(trim(new.message), ''), 'A viewer wants to connect with you.'), 220),
    new.source_path
  ) on conflict (creative_member_id, inquiry_id) do nothing;
  return new;
end;
$$;

drop trigger if exists project_inquiries_create_creative_notification on public.project_inquiries;
create trigger project_inquiries_create_creative_notification
after insert on public.project_inquiries for each row execute function private.create_targeted_creative_notification();

insert into public.creative_notifications(creative_member_id, inquiry_id, title, preview, source_path, created_at)
select coalesce(i.assigned_creative_id, i.preferred_creative_id), i.id,
  coalesce(nullif(trim(i.summary), ''), 'Private inquiry'),
  left(coalesce(nullif(trim(i.details), ''), nullif(trim(i.message), ''), 'A viewer wants to connect with you.'), 220),
  i.source_path, i.created_at
from public.project_inquiries i
where coalesce(i.assigned_creative_id, i.preferred_creative_id) is not null
on conflict (creative_member_id, inquiry_id) do nothing;

alter table public.creative_notifications enable row level security;
revoke all on public.creative_notifications from anon;
revoke insert, update, delete on public.creative_notifications from authenticated;
grant select on public.creative_notifications to authenticated;
grant update(read_at) on public.creative_notifications to authenticated;

drop policy if exists "Creatives read own notifications" on public.creative_notifications;
drop policy if exists "Creatives update own notifications" on public.creative_notifications;
drop policy if exists "Super Admin reads notifications" on public.creative_notifications;
create policy "Creatives read own notifications" on public.creative_notifications for select to authenticated
using (creative_member_id = private.current_creative_member_id());
create policy "Creatives update own notifications" on public.creative_notifications for update to authenticated
using (creative_member_id = private.current_creative_member_id())
with check (creative_member_id = private.current_creative_member_id());
create policy "Super Admin reads notifications" on public.creative_notifications for select to authenticated
using (private.has_role(auth.uid(), array['super_admin']));

-- Private Creative requests are visible only to their recipient and the Super Admin.
drop policy if exists "Active team can read project inquiries" on public.project_inquiries;
drop policy if exists "Active Team can read every inquiry" on public.project_inquiries;
drop policy if exists "Authorized team can read project inquiries" on public.project_inquiries;
drop policy if exists "Site admins can read project inquiries" on public.project_inquiries;
drop policy if exists "Creative can read assigned inquiries" on public.project_inquiries;
drop policy if exists "Super Admin can read project inquiries" on public.project_inquiries;
create policy "Creative can read assigned inquiries" on public.project_inquiries for select to authenticated
using (coalesce(assigned_creative_id, preferred_creative_id) = private.current_creative_member_id());
create policy "Super Admin can read project inquiries" on public.project_inquiries for select to authenticated
using (private.has_role(auth.uid(), array['super_admin']));

revoke execute on function private.create_targeted_creative_notification() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
