-- Focused public inquiry submission and admin visibility repair.
-- This migration intentionally does not alter project visibility policies.

alter table public.project_inquiries
  add column if not exists preferred_creative_id uuid;
alter table public.project_inquiries
  alter column preferred_creative_id drop not null,
  alter column status set default 'new';

do $$
begin
  if not exists (
    select 1
    from pg_constraint con
    join pg_attribute att
      on att.attrelid = con.conrelid
      and att.attnum = any(con.conkey)
    where con.conrelid = 'public.project_inquiries'::regclass
      and con.contype = 'f'
      and att.attname = 'preferred_creative_id'
  ) then
    alter table public.project_inquiries
      add constraint project_inquiries_preferred_creative_id_fkey
      foreign key (preferred_creative_id)
      references public.creative_members(id)
      on delete set null
      not valid;
  end if;
end;
$$;

create index if not exists project_inquiries_preferred_creative_idx
  on public.project_inquiries(preferred_creative_id);

create or replace function private.is_active_inquiry_team_member(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  select private.has_role(check_user_id, array['super_admin', 'admin', 'editor', 'creative', 'viewer']);
$$;

alter table public.project_inquiries enable row level security;
drop policy if exists "Public can create project inquiries" on public.project_inquiries;
drop policy if exists "Admins can manage project inquiries" on public.project_inquiries;
drop policy if exists "Site admins can read project inquiries" on public.project_inquiries;
drop policy if exists "Site admins can update project inquiries" on public.project_inquiries;
drop policy if exists "Site admins can delete project inquiries" on public.project_inquiries;
drop policy if exists "Public can submit valid project inquiries" on public.project_inquiries;
drop policy if exists "Active team can read project inquiries" on public.project_inquiries;
drop policy if exists "Team admins can update project inquiries" on public.project_inquiries;
drop policy if exists "Team admins can delete project inquiries" on public.project_inquiries;

create policy "Public can submit valid project inquiries"
  on public.project_inquiries for insert to anon, authenticated
  with check (
    char_length(trim(name)) between 2 and 120
    and char_length(trim(email_or_contact)) between 3 and 200
    and char_length(trim(project_type)) between 2 and 120
    and char_length(trim(message)) between 10 and 5000
    and (organization is null or char_length(trim(organization)) <= 160)
    and (budget_range is null or char_length(trim(budget_range)) <= 120)
    and (preferred_contact is null or char_length(trim(preferred_contact)) <= 120)
    and status = 'new'
    and (
      preferred_creative_id is null
      or exists (
        select 1
        from public.creative_members cm
        where cm.id = preferred_creative_id
          and cm.is_published = true
      )
    )
  );

create policy "Active team can read project inquiries"
  on public.project_inquiries for select to authenticated
  using (private.is_active_inquiry_team_member(auth.uid()));

create policy "Team admins can update project inquiries"
  on public.project_inquiries for update to authenticated
  using (private.can_manage_all_content(auth.uid()))
  with check (private.can_manage_all_content(auth.uid()));

create policy "Team admins can delete project inquiries"
  on public.project_inquiries for delete to authenticated
  using (private.can_manage_all_content(auth.uid()));

grant usage on schema private to authenticated;
grant execute on function private.is_active_inquiry_team_member(uuid) to authenticated;

notify pgrst, 'reload schema';
