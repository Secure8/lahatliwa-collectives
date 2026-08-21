export const SITE_TAGLINE = 'Build your presence. Shape your story.';

export const defaultSiteContent = {
  legalName: 'Lahat Liwa Collectives',
  displayName: 'Lahat Liwa Collectives',
  initials: 'LL',
  email: '',
  tagline: SITE_TAGLINE,
  logoUrl: '/brand/liwa-standalone-v2.png',
  logoAlt: 'Liwa Collectives symbol',
  headerLogoUrl: '/brand/liwa-standalone-v2.png',
  headerLogoAlt: 'Liwa Collectives symbol',
  footerLogoUrl: '/brand/liwa-collectives-v2.png',
  footerLogoAlt: 'Liwa Collectives full logo',
  heroImageUrl: '',
  heroImageAlt: 'Lahat Liwa Collectives hero portrait',
  showHeroPortrait: false,
  footerText: 'A curated home for creative work from Aklan and the people behind it.',
  primaryTextColor: '#f7f7f4',
  secondaryTextColor: '#b6bfc1',
  mutedTextColor: '#939c9d',
  accentColor: '#f3a257',
  dividerLineColor: '#445241',
  defaultBackgroundImageUrl: '',
  defaultBackgroundOverlayOpacity: 0.55,
  hero: {
    eyebrow: 'CURATED CREATIVE WORK FROM AKLAN',
    title: 'Discover work made with purpose.',
    description:
      'Explore selected photography, film, design, writing, and digital work from independent Creatives.',
    primaryCta: 'Explore Creatives',
    secondaryCta: 'Send an Inquiry',
  },
  about: {
    title: 'A professional home for creative work and the people behind it.',
    intro:
      'Lahat Liwa is a curated portfolio platform where Aklan Creatives present their work and professional practice.',
    journey:
      'Each Creative has a focused portfolio and a direct path for thoughtful professional inquiries.',
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
    'Start with your goal, idea, problem, or opportunity. You do not need to choose from a fixed service list before sending a message.',
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
    featuredHeading: 'People behind the work',
    servicesHeading: 'Start with what you want to achieve',
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
    title: 'Start with the outcome—not a service category.',
    intro: defaultSiteContent.servicesIntro,
    headingColor: '',
    bodyTextColor: '',
    serviceTitleColor: '',
    iconColor: '',
    groups: defaultSiteContent.services.map((service, index) => ({
      ...service,
      iconName: ['Camera', 'Palette', 'Code2', 'Wrench'][index] || 'Circle',
      iconUrl: '',
      customIconUrl: '',
      serviceLogoUrl: '',
    })),
  },
  contact: {
    heading: 'Start a conversation with Lahat Liwa.',
    description: 'Send one open message about a project, collaboration, event, content request, digital need, profile or credit question, opportunity, or general concern.',
    ctaText: 'Email Lahat Liwa',
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
