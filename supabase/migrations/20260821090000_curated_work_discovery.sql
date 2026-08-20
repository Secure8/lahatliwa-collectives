-- Curated Work discovery: additive metadata and reusable taxonomy for the
-- existing Creative publishing system. Legacy post/project records remain
-- compatible while creative_posts becomes the canonical public Work model.

begin;

alter table public.creative_posts
  add column if not exists title text,
  add column if not exists summary text,
  add column if not exists work_year smallint,
  add column if not exists external_url text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists is_featured boolean not null default false;

alter table public.creative_posts drop constraint if exists creative_posts_title_length_check;
alter table public.creative_posts add constraint creative_posts_title_length_check
  check (title is null or length(btrim(title)) between 1 and 140);
alter table public.creative_posts drop constraint if exists creative_posts_summary_length_check;
alter table public.creative_posts add constraint creative_posts_summary_length_check
  check (summary is null or length(btrim(summary)) between 1 and 320);
alter table public.creative_posts drop constraint if exists creative_posts_work_year_check;
alter table public.creative_posts add constraint creative_posts_work_year_check
  check (work_year is null or work_year between 1900 and 2200);
alter table public.creative_posts drop constraint if exists creative_posts_external_url_check;
alter table public.creative_posts add constraint creative_posts_external_url_check
  check (external_url is null or external_url ~ '^https://');
alter table public.creative_posts drop constraint if exists creative_posts_tags_check;
alter table public.creative_posts add constraint creative_posts_tags_check
  check (cardinality(tags) <= 12);

create table if not exists public.creative_taxonomy_terms (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('discipline','specialty','industry')),
  name text not null check (length(btrim(name)) between 2 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  sort_order integer not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (kind, slug)
);

create table if not exists public.creative_post_taxonomy (
  post_id uuid not null references public.creative_posts(id) on delete cascade,
  term_id uuid not null references public.creative_taxonomy_terms(id) on delete cascade,
  primary key (post_id, term_id)
);

create table if not exists public.creative_member_taxonomy (
  creative_member_id uuid not null references public.creative_members(id) on delete cascade,
  term_id uuid not null references public.creative_taxonomy_terms(id) on delete cascade,
  primary key (creative_member_id, term_id)
);

create index if not exists creative_taxonomy_terms_lookup_idx
  on public.creative_taxonomy_terms(kind, is_active, sort_order, name);
create index if not exists creative_post_taxonomy_term_idx
  on public.creative_post_taxonomy(term_id, post_id);
create index if not exists creative_member_taxonomy_term_idx
  on public.creative_member_taxonomy(term_id, creative_member_id);
create index if not exists creative_posts_discover_idx
  on public.creative_posts(is_featured desc, published_at desc)
  where status = 'published' and visibility = 'public' and moderation_status = 'clear';

insert into public.creative_taxonomy_terms(kind, name, slug, sort_order) values
  ('discipline','Photography','photography',10),
  ('discipline','Film and Video','film-video',20),
  ('discipline','Design','design',30),
  ('discipline','Writing','writing',40),
  ('discipline','Digital Experiences','digital-experiences',50),
  ('discipline','Creative Direction','creative-direction',60),
  ('specialty','Documentary','documentary',10),
  ('specialty','Events','events',20),
  ('specialty','Brand Identity','brand-identity',30),
  ('specialty','Social Content','social-content',40),
  ('specialty','Editorial','editorial',50),
  ('specialty','Web Design','web-design',60),
  ('industry','Arts and Culture','arts-culture',10),
  ('industry','Food and Hospitality','food-hospitality',20),
  ('industry','Tourism and Place','tourism-place',30),
  ('industry','Community','community',40),
  ('industry','Business','business',50),
  ('industry','Education','education',60)
on conflict (kind, slug) do update set name=excluded.name, sort_order=excluded.sort_order, is_active=true;

alter table public.creative_taxonomy_terms enable row level security;
alter table public.creative_post_taxonomy enable row level security;
alter table public.creative_member_taxonomy enable row level security;

drop policy if exists creative_taxonomy_public_read on public.creative_taxonomy_terms;
create policy creative_taxonomy_public_read on public.creative_taxonomy_terms
  for select to anon, authenticated using (is_active);
drop policy if exists creative_taxonomy_moderator_read on public.creative_taxonomy_terms;
create policy creative_taxonomy_moderator_read on public.creative_taxonomy_terms
  for select to authenticated using (private.can_moderate_creative_posts(auth.uid()));
drop policy if exists creative_taxonomy_moderator_insert on public.creative_taxonomy_terms;
create policy creative_taxonomy_moderator_insert on public.creative_taxonomy_terms
  for insert to authenticated with check (private.can_moderate_creative_posts(auth.uid()));
drop policy if exists creative_taxonomy_moderator_update on public.creative_taxonomy_terms;
create policy creative_taxonomy_moderator_update on public.creative_taxonomy_terms
  for update to authenticated using (private.can_moderate_creative_posts(auth.uid()))
  with check (private.can_moderate_creative_posts(auth.uid()));

drop policy if exists creative_post_taxonomy_public_read on public.creative_post_taxonomy;
create policy creative_post_taxonomy_public_read on public.creative_post_taxonomy
  for select to anon, authenticated using (
    exists (select 1 from public.creative_posts p where p.id=post_id and
      p.status='published' and p.visibility='public' and p.moderation_status='clear')
  );
drop policy if exists creative_post_taxonomy_owner_read on public.creative_post_taxonomy;
create policy creative_post_taxonomy_owner_read on public.creative_post_taxonomy
  for select to authenticated using (private.owns_creative_post(auth.uid(),post_id));
drop policy if exists creative_post_taxonomy_moderator_read on public.creative_post_taxonomy;
create policy creative_post_taxonomy_moderator_read on public.creative_post_taxonomy
  for select to authenticated using (private.can_moderate_creative_posts(auth.uid()));
drop policy if exists creative_post_taxonomy_owner_insert on public.creative_post_taxonomy;
create policy creative_post_taxonomy_owner_insert on public.creative_post_taxonomy
  for insert to authenticated with check (private.owns_creative_post(auth.uid(),post_id));
drop policy if exists creative_post_taxonomy_owner_delete on public.creative_post_taxonomy;
create policy creative_post_taxonomy_owner_delete on public.creative_post_taxonomy
  for delete to authenticated using (private.owns_creative_post(auth.uid(),post_id));

drop policy if exists creative_member_taxonomy_public_read on public.creative_member_taxonomy;
create policy creative_member_taxonomy_public_read on public.creative_member_taxonomy
  for select to anon, authenticated using (
    exists (select 1 from public.creative_members c where c.id=creative_member_id and c.is_published=true)
  );
drop policy if exists creative_member_taxonomy_owner_read on public.creative_member_taxonomy;
create policy creative_member_taxonomy_owner_read on public.creative_member_taxonomy
  for select to authenticated using (creative_member_id=private.current_creative_member_id());
drop policy if exists creative_member_taxonomy_moderator_read on public.creative_member_taxonomy;
create policy creative_member_taxonomy_moderator_read on public.creative_member_taxonomy
  for select to authenticated using (private.can_moderate_creative_posts(auth.uid()));
drop policy if exists creative_member_taxonomy_owner_insert on public.creative_member_taxonomy;
create policy creative_member_taxonomy_owner_insert on public.creative_member_taxonomy
  for insert to authenticated with check (creative_member_id=private.current_creative_member_id());
drop policy if exists creative_member_taxonomy_owner_delete on public.creative_member_taxonomy;
create policy creative_member_taxonomy_owner_delete on public.creative_member_taxonomy
  for delete to authenticated using (creative_member_id=private.current_creative_member_id());

grant select on public.creative_taxonomy_terms, public.creative_post_taxonomy, public.creative_member_taxonomy to anon, authenticated;
grant insert,update on public.creative_taxonomy_terms to authenticated;
grant insert,delete on public.creative_post_taxonomy, public.creative_member_taxonomy to authenticated;

-- CLI migrations do not carry a Creative auth session. Preserve the existing
-- self-update guard mode while normalizing these two legacy profile fields,
-- then restore it before the transaction completes.
create temporary table curated_work_profile_guard_states on commit drop as
select tgname as trigger_name, tgenabled as enabled_mode
from pg_trigger
where tgrelid = 'public.creative_members'::regclass
  and not tgisinternal
  and tgname = 'creative_members_guard_self_update';

do $$
declare guard record;
begin
  for guard in select trigger_name from curated_work_profile_guard_states where enabled_mode <> 'D'
  loop
    execute format('alter table public.creative_members disable trigger %I', guard.trigger_name);
  end loop;
end;
$$;

alter table public.creative_members drop constraint if exists creative_members_profile_template_check;
update public.creative_members set profile_template = case profile_template
  when 'social' then 'studio'
  when 'gallery' then 'showcase'
  else profile_template end;
alter table public.creative_members alter column profile_template set default 'studio';
alter table public.creative_members add constraint creative_members_profile_template_check
  check (profile_template in ('editorial','minimal','showcase','studio','archive'));

alter table public.creative_members drop constraint if exists creative_members_availability_status_check;
update public.creative_members set availability_status = case
  when availability_status is null or btrim(availability_status)='' then 'available'
  when lower(availability_status) like '%unavailable%' then 'unavailable'
  when lower(availability_status) like '%limited%' or lower(availability_status) like '%selected%' then 'limited'
  else 'available' end;
alter table public.creative_members alter column availability_status set default 'available';
alter table public.creative_members add constraint creative_members_availability_status_check
  check (availability_status in ('available','limited','unavailable'));

do $$
declare guard record;
begin
  for guard in select trigger_name, enabled_mode from curated_work_profile_guard_states
  loop
    if guard.enabled_mode = 'O' then
      execute format('alter table public.creative_members enable trigger %I', guard.trigger_name);
    elsif guard.enabled_mode = 'A' then
      execute format('alter table public.creative_members enable always trigger %I', guard.trigger_name);
    elsif guard.enabled_mode = 'R' then
      execute format('alter table public.creative_members enable replica trigger %I', guard.trigger_name);
    end if;
  end loop;
end;
$$;

commit;
