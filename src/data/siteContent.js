export const defaultSiteContent = {
  legalName: 'Lahat Liwa Collectives',
  displayName: 'Lahat Liwa',
  initials: 'LL',
  email: '',
  tagline: 'A creative digital collective for visuals, content, websites, and practical digital services.',
  logoUrl: '',
  logoAlt: 'Lahat Liwa logo',
  heroImageUrl: '',
  heroImageAlt: 'Lahat Liwa Collectives hero portrait',
  showHeroPortrait: false,
  footerText: 'A calm collective website for visual work, social content, digital builds, and practical tech support.',
  primaryTextColor: '#f5f5f4',
  secondaryTextColor: '#d4d4d8',
  mutedTextColor: '#a1a1aa',
  accentColor: '#f6d58b',
  dividerLineColor: '#f6d58b',
  defaultBackgroundImageUrl: '',
  defaultBackgroundOverlayOpacity: 0.55,
  hero: {
    eyebrow: 'Creative digital collective',
    title: 'A creative digital collective building visuals, stories, and digital experiences.',
    description:
      'Lahat Liwa Collectives works across photography, editing, video, social media, content planning, websites, and practical digital services.',
    primaryCta: 'Start a Project',
    secondaryCta: 'Explore Works',
  },
  about: {
    title: 'A collective shaping real creative and digital projects.',
    intro:
      'Lahat Liwa Collectives brings together visual work, web experiments, social media support, school projects, and practical digital services into one growing body of work.',
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
    'Choose the area that best matches your request, then share the result, context, and timeline that matter to you.',
  services: [
    {
      name: 'Liwa Social',
      description: 'Tell us what you want to improve or achieve on social media. Share your platforms, content needs, campaign goals, posting support, and any challenges with your current online presence.',
      items: ['Social Media Management', 'Content Planning', 'Digital Marketing', 'Campaign Support', 'Branding & Page Support', 'Marketing Consultation'],
    },
    {
      name: 'Liwa Studio',
      description: 'Tell us what you need for your photo, video, editing, SDE, or highlights project. Share the occasion, preferred style, schedule, and expected output so we can match you with the right creative.',
      items: ['Photography', 'Videography', 'Same-Day Edit (SDE)', 'Highlights', 'Photo & Video Editing', 'Other Visual Work'],
    },
    {
      name: 'Liwa Digital',
      description: 'Tell us what you want to build or improve, such as a website, app, system, prototype, or digital product. Share your goal, required features, target users, and preferred timeline.',
      items: ['Website Development', 'Application Development', 'UI & Prototyping', 'Digital Systems', 'Maintenance & Improvements', 'Technical Consultation'],
    },
    {
      name: 'Liwa Tech',
      description: 'Describe the device, software, setup, or technical issue you need help with. Let us know what is happening, how urgent it is, and whether you prefer remote or on-site support.',
      items: ['Computer Troubleshooting', 'Device Setup', 'Software Assistance', 'System & Network Support', 'Maintenance & Optimization', 'Technical Consultation'],
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
    featuredHeading: 'Selected Projects',
    servicesHeading: 'Flexible services for varied needs',
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
    title: 'Creative, digital, social, and technical support.',
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
    description: 'For creative, digital, social-media, technical, multidisciplinary, or collaborative work, send a guided request or reach out through the available contact channels.',
    ctaText: 'Email Lahat Liwa',
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
