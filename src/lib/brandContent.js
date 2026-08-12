export const BRAND_POSITIONING = 'Lahat Liwa Collectives is an Aklan-based creative work platform. We document work in progress, publish completed projects, credit collaborators, and welcome open inquiries for creative and digital work.';

export const CURRENT_WORK_COPY = Object.freeze({
  eyebrow: 'Current work',
  title: 'Follow the work while it is happening.',
  description: 'See active client projects, content releases, event coverage, and meaningful progress from start to completion. Finished work moves into the permanent portfolio.',
});

const HOME_COPY = Object.freeze({
  featuredEyebrow: 'Creative contributors',
  featuredTitle: 'Meet the people behind the work.',
  featuredDescription: 'Explore published profiles, skills, selected work, and clearly credited project contributions.',
  featuredCtaLabel: 'View creatives',
  inquiryEyebrow: 'Open inquiry',
  inquiryTitle: 'Tell us what you need—in your own words.',
  inquiryDescription: 'Share a goal, problem, idea, collaboration, or opportunity. You do not need to choose from a fixed service list.',
  inquiryCtaLabel: 'Send a message',
  inquiryCtaUrl: '/inquiry',
});

const CREATIVES_COPY = Object.freeze({
  heroEyebrow: 'Creative contributors',
  heroTitle: 'People behind the work.',
  heroDescription: 'Meet the creatives and collaborators credited across Lahat Liwa projects. Profiles show skills, selected work, and contributions without implying permanent employment or availability.',
  primaryCta: 'View Current Work',
  primaryCtaUrl: '/work',
  secondaryCta: 'Send an Inquiry',
  secondaryCtaUrl: '/inquiry',
  directoryEyebrow: 'Creative directory',
  directoryTitle: 'Meet the people credited in the work.',
  directoryDescription: 'Explore published profiles, skills, selected work, and project contributions. A profile records creative work and credit without implying employment, permanent affiliation, or guaranteed availability.',
});

const legacyTourismPattern = /aklan tourism|explore aklan|destinations?, events?, activities|tourism portal|visitor support/i;

export function currentWorkPageCopy(page = {}) {
  const values = [page.eyebrow, page.title, page.description];
  if (values.some((value) => legacyTourismPattern.test(String(value || '')))) return CURRENT_WORK_COPY;
  return {
    eyebrow: page.eyebrow || CURRENT_WORK_COPY.eyebrow,
    title: page.title || CURRENT_WORK_COPY.title,
    description: page.description || CURRENT_WORK_COPY.description,
  };
}

export function brandAlignedWebsiteBundle(bundle = {}) {
  const aligned = Object.fromEntries(Object.entries(bundle).map(([key, value]) => [key, value && typeof value === 'object' ? { ...value } : value]));
  const home = aligned['page.home'] || {};
  if (/Aklan.?s stories|tourism question|right place, story, or creative service/i.test(`${home.featuredTitle || ''} ${home.inquiryTitle || ''} ${home.inquiryDescription || ''}`)) aligned['page.home'] = { ...home, ...HOME_COPY };

  const footer = aligned['global.footer'] || {};
  if (/Website by Liwa Digital|service branch|practical services/i.test(`${footer.contextLabel || ''} ${footer.footerText || ''}`)) aligned['global.footer'] = { ...footer, contextLabel: '', footerText: 'An Aklan-based creative work platform for current project updates, completed work, contributor credit, and open inquiries.' };

  const navigation = aligned['global.navigation'] || {};
  aligned['global.navigation'] = { ...navigation, projectsLabel: navigation.projectsLabel === 'Projects' ? 'Portfolio' : navigation.projectsLabel, servicesLabel: !navigation.servicesLabel || navigation.servicesLabel === 'Services' ? 'Work with us' : navigation.servicesLabel };

  const creatives = aligned['page.creatives'] || {};
  if (/AKLAN CREATIVES|shared space where creatives|collective identity/i.test(`${creatives.heroEyebrow || ''} ${creatives.heroDescription || ''}`)) aligned['page.creatives'] = { ...creatives, ...CREATIVES_COPY };

  const services = aligned['page.services'] || {};
  if (/four practical paths|choose the branch|choose the service/i.test(`${services.title || ''} ${services.intro || ''}`)) aligned['page.services'] = { ...services, title: 'Start with the outcome—not a service category.', intro: 'Tell us what you are trying to make, improve, document, promote, solve, or explore. Your message will guide the review.' };

  aligned['page.explore'] = currentWorkPageCopy(aligned['page.explore']);
  return aligned;
}
