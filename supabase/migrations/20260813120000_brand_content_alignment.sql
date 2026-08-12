begin;

insert into public.website_studio_entries (entry_key, entry_type, published_data) values
  ('global.brand', 'global', '{"tagline":"Build your presence. Shape your story."}'::jsonb),
  ('global.navigation', 'global', '{"homeLabel":"Home","aboutLabel":"About","projectsLabel":"Portfolio","servicesLabel":"Work with us","creativesLabel":"Creatives","contactLabel":"Contact","showAbout":true,"showProjects":true,"showServices":true,"showCreatives":true,"showContact":true}'::jsonb),
  ('global.footer', 'global', '{"contextLabel":"","footerText":"An Aklan-based creative work platform for current project updates, completed work, contributor credit, and open inquiries.","privacyLabel":"Privacy Policy"}'::jsonb),
  ('global.appearance', 'global', '{"primaryTextColor":"#f5f5f4","secondaryTextColor":"#d4d4d8","mutedTextColor":"#a1a1aa","accentColor":"#f6d58b","dividerLineColor":"#f6d58b"}'::jsonb),
  ('page.home', 'page', '{"featuredEyebrow":"Creative contributors","featuredTitle":"Meet the people behind the work.","featuredDescription":"Explore published profiles, skills, selected work, and clearly credited project contributions.","featuredCtaLabel":"View creatives","inquiryEyebrow":"Open inquiry","inquiryTitle":"Tell us what you need—in your own words.","inquiryDescription":"Share a goal, problem, idea, collaboration, or opportunity. You do not need to choose from a fixed service list.","inquiryCtaLabel":"Send a message","inquiryCtaUrl":"/inquiry"}'::jsonb),
  ('page.explore', 'page', '{"eyebrow":"Current work","title":"Follow the work while it is happening.","description":"See active client projects, content releases, event coverage, and meaningful progress from start to completion. Finished work moves into the permanent portfolio."}'::jsonb),
  ('page.projects', 'page', '{"eyebrow":"Completed work","title":"The permanent project portfolio.","description":"Explore finished projects, their outcomes, and the collaborators credited for their contributions."}'::jsonb),
  ('page.services', 'page', '{"title":"Start with the outcome—not a service category.","intro":"Tell us what you are trying to make, improve, document, promote, solve, or explore. Your message will guide the review."}'::jsonb),
  ('page.about', 'page', '{"title":"Creative work made visible from first progress to finished project.","intro":"Lahat Liwa Collectives is an Aklan-based creative work platform. We share active projects, preserve completed work, credit contributors, and welcome open inquiries.","journey":"It was built to make creative work easier to follow, understand, and credit—and to give people one clear place to start a project or conversation."}'::jsonb),
  ('page.creatives', 'page', '{"heroEyebrow":"Creative contributors","heroTitle":"People behind the work.","heroDescription":"Meet the creatives and collaborators credited across Lahat Liwa projects. Profiles show skills, selected work, and contributions without implying permanent employment or availability.","primaryCta":"View Current Work","primaryCtaUrl":"/work","secondaryCta":"Send an Inquiry","secondaryCtaUrl":"/inquiry","directoryEyebrow":"Creative directory","directoryTitle":"Meet the people credited in the work.","directoryDescription":"Explore published profiles, skills, selected work, and project contributions. A profile records creative work and credit without implying employment, permanent affiliation, or guaranteed availability."}'::jsonb),
  ('page.inquiries', 'page', '{"heading":"Start a conversation with Lahat Liwa.","description":"Send one open message about a project, collaboration, event, content request, digital need, profile or credit question, opportunity, or general concern.","ctaText":"Email Lahat Liwa","landingEyebrow":"Open inquiry","landingHeading":"Tell us what you need—in your own words.","landingDescription":"Share the goal, problem, idea, project, collaboration, or opportunity. You do not need to fit it into a predefined service.","disclaimer":"Sending a message starts a review. It does not confirm availability, assignment, price, schedule, or a working agreement."}'::jsonb),
  ('page.search', 'page', '{"defaultTitle":"Lahat Liwa Collectives","defaultDescription":"Follow current creative work, completed projects, credited collaborators, and open inquiries from Lahat Liwa Collectives."}'::jsonb)
on conflict (entry_key) do update
set published_data = public.website_studio_entries.published_data || excluded.published_data,
    draft_data = case
      when public.website_studio_entries.draft_data is null then null
      else public.website_studio_entries.draft_data || excluded.published_data
    end,
    published_version = public.website_studio_entries.published_version + 1,
    published_at = now(),
    updated_at = now();

-- Fixed service and branch cards are retained only as inactive compatibility records.
update public.website_studio_entries
set published_data = published_data || '{"status":"inactive","publicVisibility":false,"inquiryAvailability":false}'::jsonb,
    draft_data = case when draft_data is null then null else draft_data || '{"status":"inactive","publicVisibility":false,"inquiryAvailability":false}'::jsonb end,
    published_version = published_version + 1,
    published_at = now(),
    updated_at = now()
where entry_type in ('branch', 'service');

commit;
