const defaultSiteContent = {
  legalName: 'Jevin Coching',
  displayName: 'Hevv Ching',
  initials: 'HC',
  email: 'hello@example.com',
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
  socialLinks: [
    { label: 'Instagram', href: '#' },
    { label: 'GitHub', href: '#' },
    { label: 'Facebook', href: '#' },
  ],
  placeholders: {
    projectCover: '/images/project-cover-placeholder.jpg',
    projectGallery: '/images/project-gallery-placeholder.jpg',
  },
};

function mergeSiteContent(overrides = {}) {
  return {
    ...defaultSiteContent,
    ...overrides,
    hero: { ...defaultSiteContent.hero, ...(overrides.hero || {}) },
    about: { ...defaultSiteContent.about, ...(overrides.about || {}) },
    socialLinks: overrides.socialLinks || defaultSiteContent.socialLinks,
    placeholders: { ...defaultSiteContent.placeholders, ...(overrides.placeholders || {}) },
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
