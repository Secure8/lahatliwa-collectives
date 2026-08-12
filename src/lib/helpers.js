export const categories = [
  'Website',
  'Application',
  'Photography',
  'Videography',
  'Social Media',
  'Campaign',
  'Editorial',
  'Community Project',
  'Other',
];

export function slugify(value) {
  return value
    .toString()
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseList(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatDate(value) {
  if (!value) return 'Undated';
  return new Intl.DateTimeFormat('en', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

export function excerpt(value, length = 130) {
  if (!value) return '';
  return value.length > length ? `${value.slice(0, length).trim()}...` : value;
}
