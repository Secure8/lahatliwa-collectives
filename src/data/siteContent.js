export const SITE_TAGLINE = 'Build your presence. Shape your story.';

export const defaultSiteContent = {
  legalName: 'Lahat Liwa Collectives',
  displayName: 'Lahat Liwa',
  initials: 'LL',
  email: '',
  tagline: SITE_TAGLINE,
  logoUrl: '',
  logoAlt: 'Lahat Liwa logo',
  heroImageUrl: '',
  heroImageAlt: 'Lahat Liwa Collectives hero portrait',
  showHeroPortrait: false,
  footerText: 'An independently operated platform for practical services, published work, credited contributions, and growing creative visibility across four Liwa branches.',
  primaryTextColor: '#f5f5f4',
  secondaryTextColor: '#d4d4d8',
  mutedTextColor: '#a1a1aa',
  accentColor: '#f6d58b',
  dividerLineColor: '#f6d58b',
  defaultBackgroundImageUrl: '',
  defaultBackgroundOverlayOpacity: 0.55,
  hero: {
    eyebrow: 'Independent creative platform',
    title: 'Practical support, published work, and room for creative growth.',
    description:
      'Find focused support across visual production, digital development, social media, and technical needs—or explore the creatives and work published through the platform.',
    primaryCta: 'Send an Inquiry',
    secondaryCta: 'Explore Published Work',
  },
  about: {
    title: 'One platform for practical support and visible creative work.',
    intro:
      'Lahat Liwa is an independently operated platform that organizes practical services while giving selected creatives a place to publish profiles, projects, and credited contributions.',
    journey:
      'It was built to make scattered work easier to discover, credit, and discuss—and to give clients a clearer path from an initial need to a reviewed inquiry.',
  },
  skills: [
    'Photography',
    'Photo editing',
    'Video editing',
    'Digital and visual design',
    'Web development',
    'Application development',
    'Social media content',
    'IT and digital support',
  ],
  tools: ['React', 'Supabase', 'Vite', 'Tailwind CSS', 'Canva', 'Adobe tools', 'CapCut', 'Figma'],
  servicesIntro:
    'Choose the branch closest to your need, then share the outcome, context, and timeline that matter to you.',
  services: [
    {
      name: 'Liwa Social',
      description: 'Tell us what you want to improve or achieve on social media. Share your platforms, content needs, campaign goals, posting support, and any challenges with your current online presence.',
      items: ['Social Media Management', 'Content Planning', 'Digital Marketing', 'Campaign Support', 'Branding & Page Support', 'Marketing Consultation'],
    },
    {
      name: 'Liwa Studio',
      description: 'Tell us what you need for your photo, video, editing, SDE, or highlights request. Share the occasion, preferred style, schedule, and expected output so the request can be reviewed clearly.',
      items: ['Photography', 'Videography', 'Same-Day Edit (SDE)', 'Highlights', 'Photo & Video Editing', 'Other Visual Work'],
    },
    {
      name: 'Liwa Digital',
      description: 'Tell us what you want to build or improve, such as a website, app, system, prototype, or digital product. Share your goal, required features, target users, and preferred timeline.',
      items: ['Website Development', 'Application Development', 'UI & Prototyping', 'Digital Systems', 'Maintenance & Improvements', 'Technical Consultation'],
    },
    {
      name: 'Liwa Explore',
      description: 'Tourism information, destination storytelling, local coordination, and visitor support for exploring Aklan.',
      items: ['Destination Information', 'Event or Activity Question', 'Local Product Question', 'Tourism Question', 'Correction or Public Concern', 'Visitor Support and Routing'],
    },
  ],
  socialLinks: [],
};

export const defaultPageContent = {
  home: {
    heroEyebrow: defaultSiteContent.hero.eyebrow,
    heroTitle: defaultSiteContent.hero.title,
    heroDescription: defaultSiteContent.hero.description,
    primaryCta: defaultSiteContent.hero.primaryCta,
    secondaryCta: defaultSiteContent.hero.secondaryCta,
    featuredHeading: 'Selected published work',
    servicesHeading: 'Four practical paths for different needs',
    servicesIntro: defaultSiteContent.servicesIntro,
    heroTitleColor: '',
    heroDescriptionColor: '',
    sectionHeadingColor: '',
    accentTextColor: '',
    heroBackgroundImageUrl: '',
    heroBackgroundOverlayOpacity: 0.55,
    heroBackgroundBlur: 0,
    heroBackgroundPosition: 'center',
    heroBackgroundStyle: 'none',
  },
  about: {
    title: defaultSiteContent.about.title,
    intro: defaultSiteContent.about.intro,
    journey: defaultSiteContent.about.journey,
    skills: defaultSiteContent.skills,
    tools: defaultSiteContent.tools,
    headingColor: '',
    bodyTextColor: '',
    accentColor: '',
  },
  services: {
    title: 'Four practical paths for different kinds of support.',
    intro: defaultSiteContent.servicesIntro,
    headingColor: '',
    bodyTextColor: '',
    serviceTitleColor: '',
    iconColor: '',
    groups: defaultSiteContent.services.map((service, index) => ({
      ...service,
      iconName: ['Camera', 'Sparkles', 'Code2', 'Wrench'][index] || 'Circle',
      iconUrl: '',
      customIconUrl: '',
      serviceLogoUrl: '',
    })),
  },
  contact: {
    heading: 'Start the right conversation.',
    description: 'Use the guided inquiry for services and project requests. For collaboration ideas, profile or credit questions, relevant opportunities, or general platform concerns, use the available contact channels.',
    ctaText: 'Email the platform',
    notes: 'A short, relevant message helps direct the conversation. Please do not include passwords or sensitive account details.',
    headingColor: '',
    bodyTextColor: '',
    accentColor: '',
  },
};

function mergeSiteContent(overrides = {}) {
  return {
    ...defaultSiteContent,
    ...overrides,
    hero: { ...defaultSiteContent.hero, ...(overrides.hero || {}) },
    about: { ...defaultSiteContent.about, ...(overrides.about || {}) },
    socialLinks: overrides.socialLinks || defaultSiteContent.socialLinks,
  };
}

export const SITE_SETTINGS_STORAGE_KEY = 'hevv-portfolio-settings';

export function getSiteContent() {
  if (typeof window === 'undefined') return mergeSiteContent();

  try {
    const raw = window.localStorage.getItem(SITE_SETTINGS_STORAGE_KEY);
    if (!raw) return mergeSiteContent();
    return mergeSiteContent(JSON.parse(raw));
  } catch {
    return mergeSiteContent();
  }
}

export function saveSiteContent(settings = {}) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SITE_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export const siteContent = getSiteContent();
