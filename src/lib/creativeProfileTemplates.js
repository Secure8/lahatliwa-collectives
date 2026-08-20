export const CREATIVE_PROFILE_TEMPLATES = Object.freeze([
  { key: 'editorial', name: 'Editorial', description: 'Story-led typography with a measured, magazine-like rhythm.' },
  { key: 'minimal', name: 'Minimal', description: 'Quiet typography, generous space, and work without visual noise.' },
  { key: 'showcase', name: 'Showcase', description: 'Large visual moments for image-led portfolios and signature projects.' },
  { key: 'studio', name: 'Studio', description: 'A balanced professional portfolio with identity, work, and details.' },
  { key: 'archive', name: 'Archive', description: 'A structured, information-rich index for a growing body of work.' },
]);

export const CREATIVE_PROFILE_TEMPLATE_KEYS = CREATIVE_PROFILE_TEMPLATES.map((template) => template.key);

export function normalizeCreativeProfileTemplate(value) {
  const key = String(value || '').trim().toLowerCase();
  const legacy = { social: 'studio', gallery: 'showcase' }[key];
  return CREATIVE_PROFILE_TEMPLATE_KEYS.includes(key) ? key : legacy || 'studio';
}
