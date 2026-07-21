begin;

create table if not exists public.website_studio_entries (
  entry_key text primary key check (entry_key ~ '^[a-z][a-z0-9_.-]{2,119}$'),
  entry_type text not null check (entry_type in ('global','page','branch','service')),
  published_data jsonb not null default '{}'::jsonb check (jsonb_typeof(published_data) = 'object'),
  draft_data jsonb check (draft_data is null or jsonb_typeof(draft_data) = 'object'),
  published_version bigint not null default 1,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users(id) on delete set null,
  draft_updated_at timestamptz,
  draft_updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_studio_revisions (
  id uuid primary key default gen_random_uuid(),
  entry_key text not null references public.website_studio_entries(entry_key) on delete restrict,
  revision_no bigint generated always as identity,
  action text not null check (action in ('draft_saved','published','discarded','restored')),
  before_data jsonb,
  after_data jsonb,
  changed_fields text[] not null default '{}',
  affected_areas text[] not null default '{}',
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists website_studio_revisions_entry_idx
  on public.website_studio_revisions(entry_key, created_at desc);

alter table public.website_studio_entries enable row level security;
alter table public.website_studio_revisions enable row level security;

create or replace function private.website_studio_role(p_user_id uuid)
returns text language sql stable security definer
set search_path = public, private, pg_temp
as $$
  select case when role = 'owner' then 'super_admin' else role end
  from public.admin_users
  where user_id = p_user_id and coalesce(status, 'active') = 'active'
  limit 1
$$;

create or replace function private.website_studio_can_manage(p_user_id uuid)
returns boolean language sql stable security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(private.website_studio_role(p_user_id) in ('super_admin','admin'), false)
$$;

create or replace function private.website_studio_validate(p_entry_key text, p_data jsonb)
returns boolean language plpgsql immutable
set search_path = public, private, pg_temp
as $$
declare v_pair record;
begin
  if p_entry_key !~ '^[a-z][a-z0-9_.-]{2,119}$'
     or jsonb_typeof(p_data) <> 'object'
     or octet_length(p_data::text) > 131072
     or p_data::text ~* '(<script|javascript\s*:|data\s*:\s*text/html|on(error|load)\s*=)' then
    return false;
  end if;
  for v_pair in select key, value from jsonb_each_text(p_data)
  loop
    if v_pair.key ~* '(url|href|destination)$'
       and v_pair.value <> ''
       and v_pair.value !~* '^(https://|mailto:|/)[^[:space:]]+$' then
      return false;
    end if;
  end loop;
  return true;
end
$$;

create or replace function private.website_studio_changed_fields(p_before jsonb, p_after jsonb)
returns text[] language sql immutable
set search_path = public, private, pg_temp
as $$
  select coalesce(array_agg(key order by key), '{}'::text[])
  from (
    select key from jsonb_object_keys(coalesce(p_before, '{}'::jsonb)) key
    union
    select key from jsonb_object_keys(coalesce(p_after, '{}'::jsonb)) key
  ) keys
  where coalesce(p_before, '{}'::jsonb)->key is distinct from coalesce(p_after, '{}'::jsonb)->key
$$;

create or replace function private.website_studio_affected_areas(p_entry_key text)
returns text[] language sql immutable
as $$
  select case
    when p_entry_key = 'global.brand' then array['Header','Footer','Browser metadata','Creatives hero','About','Inquiries','Login','Social sharing']
    when p_entry_key = 'global.navigation' then array['Public header','Mobile navigation']
    when p_entry_key = 'global.footer' then array['Public footer']
    when p_entry_key = 'global.appearance' then array['All public pages','Light mode','Dark mode']
    when p_entry_key like 'branch.%' then array['Services','Inquiry choices','Branch details','Admin filters']
    when p_entry_key like 'service.%' then array['Services','Inquiry choices','Contextual inquiry links','Branch details']
    when p_entry_key = 'page.home' then array['Homepage']
    when p_entry_key = 'page.explore' then array['Explore Aklan','Homepage']
    when p_entry_key = 'page.creatives' then array['Creatives directory']
    when p_entry_key = 'page.projects' then array['Projects']
    when p_entry_key = 'page.services' then array['Services']
    when p_entry_key = 'page.about' then array['About']
    when p_entry_key = 'page.inquiries' then array['Inquiry landing','Contact']
    when p_entry_key = 'page.search' then array['Browser metadata','Social sharing']
    else array['Public website']
  end
$$;

revoke all on function private.website_studio_role(uuid) from public;
revoke all on function private.website_studio_can_manage(uuid) from public;
revoke all on function private.website_studio_validate(text,jsonb) from public;
revoke all on function private.website_studio_changed_fields(jsonb,jsonb) from public;
revoke all on function private.website_studio_affected_areas(text) from public;

drop policy if exists website_studio_entries_manage on public.website_studio_entries;
create policy website_studio_entries_manage on public.website_studio_entries
for select to authenticated using (private.website_studio_can_manage(auth.uid()));

drop policy if exists website_studio_revisions_manage on public.website_studio_revisions;
create policy website_studio_revisions_manage on public.website_studio_revisions
for select to authenticated using (private.website_studio_can_manage(auth.uid()));

revoke all on public.website_studio_entries from public, anon, authenticated;
revoke all on public.website_studio_revisions from public, anon, authenticated;
grant select on public.website_studio_entries to authenticated;
grant select on public.website_studio_revisions to authenticated;

create or replace function public.get_public_website_studio()
returns jsonb language sql stable security definer
set search_path = public, private, pg_temp
as $$
  select coalesce(jsonb_object_agg(entry_key, published_data order by entry_key), '{}'::jsonb)
  from public.website_studio_entries
  where published_data is not null
$$;

create or replace function public.save_website_studio_draft(p_entry_key text, p_data jsonb)
returns public.website_studio_entries language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare v_row public.website_studio_entries; v_before jsonb;
begin
  if not private.website_studio_can_manage(auth.uid()) then raise exception 'WEBSITE_STUDIO_FORBIDDEN' using errcode='42501'; end if;
  if not private.website_studio_validate(p_entry_key, p_data) then raise exception 'WEBSITE_STUDIO_INVALID_CONTENT' using errcode='22023'; end if;
  select * into v_row from public.website_studio_entries where entry_key=p_entry_key for update;
  if not found then raise exception 'WEBSITE_STUDIO_ENTRY_NOT_FOUND' using errcode='P0002'; end if;
  v_before := coalesce(v_row.draft_data, v_row.published_data);
  update public.website_studio_entries set draft_data=p_data, draft_updated_at=now(), draft_updated_by=auth.uid(), updated_at=now()
  where entry_key=p_entry_key returning * into v_row;
  insert into public.website_studio_revisions(entry_key,action,before_data,after_data,changed_fields,affected_areas,actor_user_id)
  values(p_entry_key,'draft_saved',v_before,p_data,private.website_studio_changed_fields(v_before,p_data),private.website_studio_affected_areas(p_entry_key),auth.uid());
  return v_row;
end
$$;

create or replace function public.publish_website_studio_entry(p_entry_key text)
returns public.website_studio_entries language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare v_row public.website_studio_entries; v_before jsonb;
begin
  if not private.website_studio_can_manage(auth.uid()) then raise exception 'WEBSITE_STUDIO_FORBIDDEN' using errcode='42501'; end if;
  select * into v_row from public.website_studio_entries where entry_key=p_entry_key for update;
  if not found then raise exception 'WEBSITE_STUDIO_ENTRY_NOT_FOUND' using errcode='P0002'; end if;
  if v_row.draft_data is null then raise exception 'WEBSITE_STUDIO_NO_DRAFT' using errcode='22023'; end if;
  if not private.website_studio_validate(p_entry_key, v_row.draft_data) then raise exception 'WEBSITE_STUDIO_INVALID_CONTENT' using errcode='22023'; end if;
  v_before := v_row.published_data;
  update public.website_studio_entries set published_data=draft_data, draft_data=null, published_version=published_version+1,
    published_at=now(), published_by=auth.uid(), draft_updated_at=null, draft_updated_by=null, updated_at=now()
  where entry_key=p_entry_key returning * into v_row;
  insert into public.website_studio_revisions(entry_key,action,before_data,after_data,changed_fields,affected_areas,actor_user_id)
  values(p_entry_key,'published',v_before,v_row.published_data,private.website_studio_changed_fields(v_before,v_row.published_data),private.website_studio_affected_areas(p_entry_key),auth.uid());
  return v_row;
end
$$;

create or replace function public.discard_website_studio_draft(p_entry_key text)
returns public.website_studio_entries language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare v_row public.website_studio_entries; v_before jsonb;
begin
  if not private.website_studio_can_manage(auth.uid()) then raise exception 'WEBSITE_STUDIO_FORBIDDEN' using errcode='42501'; end if;
  select * into v_row from public.website_studio_entries where entry_key=p_entry_key for update;
  if not found then raise exception 'WEBSITE_STUDIO_ENTRY_NOT_FOUND' using errcode='P0002'; end if;
  v_before := v_row.draft_data;
  update public.website_studio_entries set draft_data=null, draft_updated_at=null, draft_updated_by=null, updated_at=now()
  where entry_key=p_entry_key returning * into v_row;
  insert into public.website_studio_revisions(entry_key,action,before_data,after_data,changed_fields,affected_areas,actor_user_id)
  values(p_entry_key,'discarded',v_before,v_row.published_data,private.website_studio_changed_fields(v_before,v_row.published_data),private.website_studio_affected_areas(p_entry_key),auth.uid());
  return v_row;
end
$$;

create or replace function public.restore_website_studio_revision(p_revision_id uuid)
returns public.website_studio_entries language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare v_revision public.website_studio_revisions; v_row public.website_studio_entries; v_before jsonb;
begin
  if private.website_studio_role(auth.uid()) <> 'super_admin' then raise exception 'WEBSITE_STUDIO_RESTORE_FORBIDDEN' using errcode='42501'; end if;
  select * into v_revision from public.website_studio_revisions where id=p_revision_id;
  if not found or v_revision.after_data is null then raise exception 'WEBSITE_STUDIO_REVISION_NOT_FOUND' using errcode='P0002'; end if;
  if not private.website_studio_validate(v_revision.entry_key, v_revision.after_data) then raise exception 'WEBSITE_STUDIO_INVALID_CONTENT' using errcode='22023'; end if;
  select * into v_row from public.website_studio_entries where entry_key=v_revision.entry_key for update;
  v_before := v_row.published_data;
  update public.website_studio_entries set published_data=v_revision.after_data, draft_data=null, published_version=published_version+1,
    published_at=now(), published_by=auth.uid(), draft_updated_at=null, draft_updated_by=null, updated_at=now()
  where entry_key=v_revision.entry_key returning * into v_row;
  insert into public.website_studio_revisions(entry_key,action,before_data,after_data,changed_fields,affected_areas,actor_user_id)
  values(v_revision.entry_key,'restored',v_before,v_row.published_data,private.website_studio_changed_fields(v_before,v_row.published_data),private.website_studio_affected_areas(v_revision.entry_key),auth.uid());
  return v_row;
end
$$;

revoke all on function public.get_public_website_studio() from public;
revoke all on function public.save_website_studio_draft(text,jsonb) from public;
revoke all on function public.publish_website_studio_entry(text) from public;
revoke all on function public.discard_website_studio_draft(text) from public;
revoke all on function public.restore_website_studio_revision(uuid) from public;
grant execute on function public.get_public_website_studio() to anon, authenticated;
grant execute on function public.save_website_studio_draft(text,jsonb) to authenticated;
grant execute on function public.publish_website_studio_entry(text) to authenticated;
grant execute on function public.discard_website_studio_draft(text) to authenticated;
grant execute on function public.restore_website_studio_revision(uuid) to authenticated;

with settings as (
  select * from public.site_settings order by updated_at desc limit 1
)
insert into public.website_studio_entries(entry_key,entry_type,published_data)
select 'global.brand','global',jsonb_build_object(
  'brandName','Lahat Liwa Collectives','branchName','Liwa Digital','tagline',coalesce(tagline,'Build your presence. Shape your story.'),
  'logoUrl',coalesce(logo_url,''),'logoAlt',coalesce(logo_alt,'Lahat Liwa Collectives logo'),
  'contactEmail',coalesce(contact_email,''),'heroImageUrl',coalesce(hero_image_url,''),'heroImageAlt',coalesce(hero_image_alt,'Lahat Liwa Collectives hero portrait')) from settings
union all select 'global.navigation','global','{"homeLabel":"Home","aboutLabel":"About","projectsLabel":"Projects","servicesLabel":"Services","creativesLabel":"Creatives","contactLabel":"Contact","showAbout":true,"showProjects":true,"showServices":true,"showCreatives":true,"showContact":true}'::jsonb
union all select 'global.footer','global',jsonb_build_object('contextLabel','Website by Liwa Digital','footerText',coalesce(footer_text,'An independently operated platform for practical services, published work, credited contributions, and growing creative visibility.'),'privacyLabel','Privacy Policy') from settings
union all select 'global.appearance','global',jsonb_build_object('primaryTextColor',coalesce(primary_text_color,'#f5f5f4'),'secondaryTextColor',coalesce(secondary_text_color,'#d4d4d8'),'mutedTextColor',coalesce(muted_text_color,'#a1a1aa'),'accentColor',coalesce(accent_color,'#f6d58b'),'dividerLineColor',coalesce(divider_line_color,accent_color,'#f6d58b')) from settings
on conflict(entry_key) do nothing;

insert into public.website_studio_entries(entry_key,entry_type,published_data)
values
 ('page.home','page','{"featuredEyebrow":"Featured Creatives","featuredTitle":"Meet the people telling Aklan’s stories.","featuredDescription":"Explore published profiles, skills, and credited work from the collective.","featuredCtaLabel":"View Creatives","inquiryEyebrow":"Questions and collaborations","inquiryTitle":"Need help finding the right place, story, or creative service?","inquiryDescription":"Choose a tourism question, a creative or digital service, or a general inquiry. We’ll guide you one step at a time.","inquiryCtaLabel":"Ask a Question","inquiryCtaUrl":"/inquiry"}'::jsonb || coalesce((select content from public.page_content where page_key='home'),'{}'::jsonb)),
 ('page.about','page',coalesce((select content from public.page_content where page_key='about'),'{}'::jsonb)),
 ('page.services','page',coalesce((select content from public.page_content where page_key='services'),'{}'::jsonb) || '{"title":"Four practical paths for different kinds of support.","intro":"Choose the branch closest to your need, then share the outcome, context, and timeline that matter to you."}'::jsonb),
 ('page.inquiries','page','{"landingEyebrow":"Contact Lahat Liwa Collectives","landingHeading":"How can we help?","landingDescription":"Choose one path first. We’ll show only the questions that apply to your request.","disclaimer":"Lahat Liwa Collectives is an independent creative collective and information platform. It is not an official tourism office, emergency service, travel agency, booking authority, transportation provider, or tour operator."}'::jsonb || coalesce((select content from public.page_content where page_key='contact'),'{}'::jsonb)),
 ('page.explore','page','{"eyebrow":"Aklan Tourism","title":"Explore Aklan","description":"Locally edited stories, destinations, events, activities, and products from communities across Aklan."}'::jsonb),
 ('page.creatives','page','{"heroEyebrow":"AKLAN CREATIVES","heroTitle":"Lahat Liwa Collectives","heroDescription":"Serve as a shared space where creatives can present their work, receive proper credit, and publish projects under one collective identity.","primaryCta":"View Projects","primaryCtaUrl":"/projects","secondaryCta":"Contact Us","secondaryCtaUrl":"/contact","directoryEyebrow":"Creative directory","directoryTitle":"Discover published creatives and credited work.","directoryDescription":"Explore profiles, skills, portfolio work, and project contributions published through Lahat Liwa Collectives."}'::jsonb),
 ('page.projects','page','{"eyebrow":"Selected work","title":"Selected Projects","description":"Explore complete project records, visible outputs, and contributor credits across the Liwa branches."}'::jsonb),
 ('page.search','page','{"defaultTitle":"Lahat Liwa Collectives","defaultDescription":"Explore Aklan stories, creative work, services, projects, and published contributors.","openGraphImageUrl":"","facebookUrl":"","instagramUrl":"","linkedInUrl":"","youTubeUrl":"","tikTokUrl":"","githubUrl":""}'::jsonb)
on conflict(entry_key) do nothing;

with branch_seed(branch_key,patterns,default_name,default_description,default_order,public_url) as (values
 ('studio',array['%studio%'],'Liwa Studio','Photography, video, production, and editing support.',100,'/services/studio'),
 ('tech',array['%explore%','%tech%'],'Liwa Explore','Tourism information, destination storytelling, and visitor support for exploring Aklan.',200,'/services/tech'),
 ('digital',array['%digital%','%web%'],'Liwa Digital','Websites, applications, prototypes, systems, and digital product support.',300,'/services/digital'),
 ('social',array['%social%'],'Liwa Social','Social media, content planning, campaigns, branding, and marketing support.',400,'/services/social')
), matched as (
 select seed.*, b.* from branch_seed seed left join lateral (
   select sb.* from public.service_branches sb
   where lower(sb.name) like any(seed.patterns) or lower(sb.slug) like any(seed.patterns)
   order by sb.updated_at desc limit 1
 ) b on true
)
insert into public.website_studio_entries(entry_key,entry_type,published_data)
select 'branch.'||branch_key,'branch',jsonb_build_object('key',branch_key,'name',coalesce(name,default_name),'shortDescription',coalesce(description,default_description),'longDescription',coalesce(description,default_description),'status',case when coalesce(is_published,true) then 'active' else 'inactive' end,'iconUrl',coalesce(icon_url,image_url,''),'publicUrl',public_url,'displayOrder',coalesce(display_order,default_order),'seoTitle',coalesce(name,default_name),'seoDescription',coalesce(description,default_description)) from matched
on conflict(entry_key) do nothing;

with service_seed(branch_key,service_key,name,short_description,display_order) as (values
 ('studio','photo','Photography','Photography for people, products, events, and visual stories.',10),('studio','video','Videography','Video production and coverage for stories, events, and campaigns.',20),('studio','same-day-edit','Same-Day Edit (SDE)','Same-day edited visual highlights for suitable events.',30),('studio','highlights','Highlights','Concise photo or video highlights from recorded material.',40),('studio','editing','Photo & Video Editing','Editing and refinement for existing photos or video footage.',50),('studio','other-creative-work','Other Visual Work','A guided path for visual requests that do not fit another category.',60),
 ('tech','destination-information','Destination Information','Published and verified information about Aklan destinations.',10),('tech','event-or-activity','Event or Activity Question','Questions about published events and visitor activities.',20),('tech','local-product','Local Product Question','Questions about published local products and crafts.',30),('tech','tourism-question','Tourism Question','General questions about exploring Aklan responsibly.',40),('tech','correction-or-concern','Correction or Public Concern','Report an inaccurate public detail or responsible-tourism concern.',50),('tech','visitor-routing','Visitor Support and Routing','Help finding the appropriate official or local source of information.',60),
 ('digital','website','Website Development','Websites for organizations, portfolios, services, and public information.',10),('digital','app','Application Development','Applications and interactive tools for defined users and workflows.',20),('digital','design-and-prototype','UI & Prototyping','Interface planning and prototypes before full development.',30),('digital','system','Digital Systems','Structured digital workflows, dashboards, and connected tools.',40),('digital','maintenance-and-improvements','Maintenance & Improvements','Updates and improvements for an existing digital product.',50),('digital','consultation','Technical Consultation','Guidance for scoping a digital product or technical decision.',60),
 ('social','management','Social Media Management','Ongoing support for social pages and publishing workflows.',10),('social','content','Content Planning','Planning topics, formats, schedules, and content direction.',20),('social','digital-marketing','Digital Marketing','Digital campaign and audience-growth support.',30),('social','campaign','Campaign Support','Planning and production support for a defined campaign.',40),('social','page-setup','Branding & Page Support','Page setup, visual consistency, and brand presentation support.',50),('social','review-and-consultation','Marketing Consultation','Review and guidance for marketing direction and current activity.',60)
)
insert into public.website_studio_entries(entry_key,entry_type,published_data)
select 'service.'||branch_key||'.'||service_key,'service',jsonb_build_object('id',service_key,'key',service_key,'branchKey',branch_key,'name',name,'shortDescription',short_description,'fullDescription',short_description,'status','active','displayOrder',display_order,'publicVisibility',true,'inquiryAvailability',true,'iconUrl','','featured',false,'seoTitle',name,'seoDescription',short_description)
from service_seed on conflict(entry_key) do nothing;

drop policy if exists "Authenticated users can insert site settings" on public.site_settings;
drop policy if exists "Authenticated users can update site settings" on public.site_settings;
drop policy if exists "Authenticated users can delete site settings" on public.site_settings;
drop policy if exists "Authenticated users can insert page content" on public.page_content;
drop policy if exists "Authenticated users can update page content" on public.page_content;
drop policy if exists "Authenticated users can delete page content" on public.page_content;

drop policy if exists "Website managers can update legacy site settings" on public.site_settings;
drop policy if exists "Website managers can update legacy page content" on public.page_content;
create policy "Website managers can update legacy site settings" on public.site_settings for all to authenticated
using (private.website_studio_can_manage(auth.uid())) with check (private.website_studio_can_manage(auth.uid()));
create policy "Website managers can update legacy page content" on public.page_content for all to authenticated
using (private.website_studio_can_manage(auth.uid())) with check (private.website_studio_can_manage(auth.uid()));

notify pgrst, 'reload schema';
commit;
