export const defaultSiteContent = {
  legalName: 'Jevin Coching',
  displayName: 'Hevv Ching',
  initials: 'HC',
  email: '',
  tagline: 'Creative student, digital creator, and aspiring web developer.',
  logoUrl: '',
  logoAlt: 'Hevv Ching logo',
  heroImageUrl: '',
  heroImageAlt: 'Jevin Coching portrait',
  showHeroPortrait: false,
  footerText: 'A calm creative portfolio for visual work, digital builds, and practical project experiments.',
  primaryTextColor: '#f5f5f4',
  secondaryTextColor: '#d4d4d8',
  mutedTextColor: '#a1a1aa',
  accentColor: '#f6d58b',
  dividerLineColor: '#f6d58b',
  defaultBackgroundImageUrl: '',
  defaultBackgroundOverlayOpacity: 0.55,
  hero: {
    eyebrow: 'Creative portfolio',
    title: 'Visual work, digital builds, and calm ideas shaped into something real.',
    description:
      'Hevv Ching is the public creative portfolio of Jevin Coching, a student creative building experience in photography, editing, design, websites, applications, and practical digital support.',
    primaryCta: 'View Projects',
    secondaryCta: 'Contact Me',
  },
  about: {
    title: 'A student creative shaping real projects through practice.',
    intro:
      'Jevin Coching creates under the portfolio name Hevv Ching, bringing together visual work, web experiments, school projects, and digital services into one growing body of work.',
    journey:
      'The work is still evolving: capturing moments, cleaning up edits, designing for social media, building small web and app ideas, and learning how digital tools can help people move faster.',
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
    'A practical mix of creative, digital, and technical services for students, small teams, creators, and early-stage project ideas.',
  services: [
    {
      name: 'Liwa Social',
      description: 'Planning and shaping social content so pages feel active, clear, and intentional.',
      items: ['Social Media Management', 'Digital Marketing', 'Content Planning'],
    },
    {
      name: 'Liwa Studio',
      description: 'Photo and video coverage with clean edits for events, highlights, and social-ready outputs.',
      items: ['Photography', 'Videography', 'SDE', 'Highlights', 'Photo Editing', 'Video Editing'],
    },
    {
      name: 'Liwa Digital',
      description: 'Websites, app concepts, interfaces, and digital systems built with a useful first-version mindset.',
      items: ['Website Development', 'App Development', 'UI / Prototype', 'Digital Systems'],
    },
    {
      name: 'Liwa Tech',
      description: 'Simple technical help for devices, software setup, and everyday computer support.',
      items: ['IT Technician Services', 'Computer Support', 'Software / System Assistance', 'Device Setup'],
    },
  ],
  socialLinks: [],
};

export const defaultPageContent = {
  home: {
    heroTitle: defaultSiteContent.hero.title,
    heroDescription: defaultSiteContent.hero.description,
    primaryCta: defaultSiteContent.hero.primaryCta,
    secondaryCta: defaultSiteContent.hero.secondaryCta,
    featuredHeading: 'Selected Projects',
    servicesHeading: 'Creative and digital support',
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
    title: 'Creative, digital, and technical support.',
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
    heading: 'Let us build the next project.',
    description: 'For creative work, digital support, websites, apps, and project collaboration, reach out through email or social links.',
    ctaText: 'Email Hevv',
    notes: 'Use email for project inquiries, collaborations, and service requests.',
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
