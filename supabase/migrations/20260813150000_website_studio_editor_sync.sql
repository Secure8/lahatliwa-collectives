begin;

-- Add the beginner-facing fields without replacing any value already customized.
insert into public.website_studio_entries (entry_key, entry_type, published_data) values
  ('global.navigation', 'global', '{"homeLabel":"Home","aboutLabel":"About","currentWorkLabel":"Current Work","projectsLabel":"Portfolio","creativesLabel":"Creatives","contactLabel":"Contact","servicesLabel":"Work with us","privacyLabel":"Privacy Policy","showAbout":true,"showProjects":true,"showCreatives":true,"showContact":true}'::jsonb),
  ('page.home', 'page', '{"heroEyebrow":"Aklan-based creative work platform","heroTitle":"Creative work, shared from first progress to finished portfolio.","heroDescription":"We document active client work, content, event coverage, and digital projects—then preserve completed work with clear contributor credit.","featuredEyebrow":"Creative contributors","featuredTitle":"Meet the people behind the work.","featuredDescription":"Explore published profiles, skills, selected work, and clearly credited project contributions.","inquiryEyebrow":"Open inquiry","inquiryTitle":"Tell us what you need—in your own words.","inquiryDescription":"Share a goal, problem, idea, collaboration, or opportunity. You do not need to choose from a fixed service list."}'::jsonb),
  ('page.about', 'page', '{"eyebrow":"About","title":"Creative work made visible from first progress to finished project.","intro":"An Aklan-based creative work platform for active projects, completed work, contributor credit, and open inquiries.","purposeEyebrow":"Purpose","purposeTitle":"Why it was built","journey":"It was built to make creative work easier to follow, understand, and credit—and to give people one clear place to start a project or conversation.","findEyebrow":"What you can find","findTitle":"One connected record of the work","workTitle":"Current work","workDescription":"Follow active client projects, content production, event coverage, and milestones while the work is developing.","portfolioTitle":"Completed portfolio","portfolioDescription":"Explore finished projects, their outcomes, and the contributors credited for their roles.","creativesTitle":"Creative profiles","creativesDescription":"Meet published creatives and collaborators through their skills, selected work, and contribution history.","inquiriesTitle":"Open inquiries","inquiriesDescription":"Describe a project, idea, collaboration, or opportunity in your own words without choosing from a fixed service menu.","collaborationEyebrow":"Collaboration","collaborationTitle":"Clear credit, honest relationships","collaborationDescription":"The platform publishes its own work and gives collaborators clear, visible credit for the projects they help create.","collaborationNote":"A published profile or project credit records a contribution. It does not automatically mean employment, permanent membership, endorsement, or guaranteed availability for future work.","directionEyebrow":"Direction","directionTitle":"Built from Aklan, open to ideas, work, and connections beyond it.","directionDescription":"Rooted in Aklan and open to relevant work, events, collaborations, and connections beyond it. The focus remains the same: useful creative work, transparent progress, and clear credit."}'::jsonb),
  ('page.explore', 'page', '{"eyebrow":"Current work","title":"Follow the work while it is happening.","description":"See active client projects, content releases, event coverage, and meaningful progress from start to completion. Finished work moves into the permanent portfolio."}'::jsonb),
  ('page.projects', 'page', '{"eyebrow":"Completed work","title":"The permanent project portfolio.","description":"Explore finished projects, their outcomes, and the collaborators credited for their contributions."}'::jsonb),
  ('page.creatives', 'page', '{"heroEyebrow":"Creative contributors","heroTitle":"People behind the work.","heroDescription":"Meet the creatives and collaborators credited across published projects. Profiles show skills, selected work, and contributions without implying permanent employment or availability.","directoryEyebrow":"Creative directory","directoryTitle":"Meet the people credited in the work.","directoryDescription":"Explore published profiles, skills, selected work, and project contributions. A profile records creative work and credit without implying employment, permanent affiliation, or guaranteed availability."}'::jsonb),
  ('page.inquiries', 'page', '{"heading":"Start a conversation.","description":"Send one open message about a project, collaboration, event, content request, digital need, profile or credit question, opportunity, or general concern.","contactIntro":"Choose email or a social channel below. For a new project, the open inquiry form gives you room to explain the full idea.","ctaText":"Send an email","landingEyebrow":"Open inquiry","landingHeading":"Tell us what you need—in your own words.","landingDescription":"Share the goal, problem, idea, project, collaboration, or opportunity. You do not need to fit it into a predefined service.","disclaimer":"Sending a message starts a review. It does not confirm availability, assignment, price, schedule, or a working agreement."}'::jsonb),
  ('page.privacy', 'page', '{"eyebrow":"Legal","title":"Privacy Policy","description":"How this website collects, uses, stores, and protects information.","effectiveDate":"August 13, 2026","overviewTitle":"Overview","overviewBody":"This website is operated as an Aklan-based creative work platform. This policy explains our data practices for visitors, people who send inquiries, published contributors, and authorized administrators.\n\nBy using the site, you acknowledge the practices described here. If you do not agree, please do not provide personal information.","informationTitle":"Information we collect","informationBody":"Depending on how you use the site, we may collect contact and inquiry details, administrator account information, project updates, creative profile content, and technical information needed to operate, secure, and troubleshoot the website.\n\nFor uploaded website media, we store the file and the limited metadata needed to publish, replace, and remove it safely.","mediaTitle":"Public website media","mediaBody":"Images selected for publication may be resized and converted into website-ready copies. New website media is stored and delivered through Cloudflare R2.\n\nSome older published files may remain at existing public URLs until they can be safely replaced. Public media is intended to be viewable without signing in, while private storage credentials are never included in public website records.","useTitle":"How we use information","useBody":"We use collected information only to provide and maintain the site, authenticate authorized administrators, respond to inquiries, publish approved project updates and creative profiles, protect the service, and meet applicable legal obligations.\n\nWe do not sell personal information or use it for advertising, credit decisions, or to train general-purpose artificial intelligence or machine-learning models.","sharingTitle":"Sharing and service providers","sharingBody":"We may share information with service providers that help us host, secure, and operate the website, including Cloudflare for public website media delivery and Supabase for authentication, database, and server functions. These providers process information under their own terms and privacy commitments.\n\nWe may also disclose information when required by law, to protect rights and safety, or as part of an organizational transaction with appropriate safeguards. We do not transfer personal information to data brokers, advertising platforms, or information resellers.","retentionTitle":"Retention and deletion","retentionBody":"We retain information only for as long as it is needed for the purposes described above, to maintain project and contribution records, to resolve security or operational issues, or to meet legal obligations.\n\nTo request access to, correction of, or deletion of your personal information, contact us using the address below. We may need to verify your identity and may retain limited records where required for security, legal, or legitimate operational purposes.","securityTitle":"Security and your choices","securityBody":"We use access controls, owner-bound records, private server operations, and protected credential storage to reduce unauthorized access. No method of online storage or transmission is completely secure, so we cannot guarantee absolute security.","updatesTitle":"Updates to this policy","updatesBody":"We may update this policy as the service or its data practices change. The revised version will be posted on this page with a new effective date, and we will provide appropriate notice where required.","contactTitle":"Privacy questions or requests","contactBody":"Email us with privacy questions, access requests, corrections, or deletion requests."}'::jsonb)
on conflict (entry_key) do update
set published_data = excluded.published_data || public.website_studio_entries.published_data,
    draft_data = case
      when public.website_studio_entries.draft_data is null then null
      else excluded.published_data || public.website_studio_entries.draft_data
    end,
    updated_at = now();

-- Move contact details and social links into Contact, where editors expect them.
with shared_values as (
  select jsonb_strip_nulls(jsonb_build_object(
    'contactEmail', nullif(coalesce(
      (select published_data->>'contactEmail' from public.website_studio_entries where entry_key = 'page.inquiries'),
      (select published_data->>'contactEmail' from public.website_studio_entries where entry_key = 'global.brand')
    ), ''),
    'facebookUrl', nullif((select published_data->>'facebookUrl' from public.website_studio_entries where entry_key = 'page.search'), ''),
    'instagramUrl', nullif((select published_data->>'instagramUrl' from public.website_studio_entries where entry_key = 'page.search'), ''),
    'linkedInUrl', nullif((select published_data->>'linkedInUrl' from public.website_studio_entries where entry_key = 'page.search'), ''),
    'youTubeUrl', nullif((select published_data->>'youTubeUrl' from public.website_studio_entries where entry_key = 'page.search'), ''),
    'tikTokUrl', nullif((select published_data->>'tikTokUrl' from public.website_studio_entries where entry_key = 'page.search'), ''),
    'githubUrl', nullif((select published_data->>'githubUrl' from public.website_studio_entries where entry_key = 'page.search'), '')
  )) as data
)
update public.website_studio_entries as entry
set published_data = shared_values.data || entry.published_data,
    draft_data = case when entry.draft_data is null then null else shared_values.data || entry.draft_data end,
    updated_at = now()
from shared_values
where entry.entry_key = 'page.inquiries';

create or replace function private.website_studio_affected_areas(p_entry_key text)
returns text[]
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_entry_key = 'global.brand' then array['Navbar','Footer','Shared page wording','Browser metadata','Login']
    when p_entry_key = 'global.navigation' then array['Public navbar','Mobile navigation','Footer privacy link']
    when p_entry_key = 'global.appearance' then array['All public pages','Buttons','Cards','Text','Borders']
    when p_entry_key = 'page.home' then array['Home']
    when p_entry_key = 'page.about' then array['About']
    when p_entry_key = 'page.explore' then array['Current Work','Home current-work links']
    when p_entry_key = 'page.projects' then array['Portfolio']
    when p_entry_key = 'page.creatives' then array['Creatives','Home creatives section']
    when p_entry_key = 'page.inquiries' then array['Contact','Open inquiry','Footer contact and social links']
    when p_entry_key = 'page.privacy' then array['Privacy Policy']
    else array['Compatibility data']
  end
$$;

revoke all on function private.website_studio_affected_areas(text) from public, anon;

commit;
