export const CREATIVE_PROFILE_TEMPLATES = Object.freeze([
  { key: 'social', name: 'Social', description: 'The familiar wall layout with a cover, profile photo, posts, and details.' },
  { key: 'showcase', name: 'Showcase', description: 'A bold introduction with larger identity and selected portfolio work.' },
  { key: 'gallery', name: 'Gallery', description: 'An image-led portfolio for photographers, filmmakers, and visual artists.' },
  { key: 'editorial', name: 'Editorial', description: 'A story-first profile with generous type and a magazine-like rhythm.' },
]);

export const CREATIVE_PROFILE_TEMPLATE_KEYS = CREATIVE_PROFILE_TEMPLATES.map((template) => template.key);

export function normalizeCreativeProfileTemplate(value) {
  const key = String(value || '').trim().toLowerCase();
  return CREATIVE_PROFILE_TEMPLATE_KEYS.includes(key) ? key : 'social';
}
