const BUCKET = 'project-media';
export function normalizePublicImagePath(value) {
  if (typeof value !== 'string') return '';
  const path = value.trim();
  if (!path || /^javascript:/i.test(path)) return '';
  if (/^(https?:)?\/\//i.test(path) || /^(data|blob):/i.test(path) || path.startsWith('/')) return path;
  const portable = path.replace(/\\/g, '/').replace(/^\/+/, '');
  return portable.toLowerCase().startsWith(`${BUCKET}/`) ? portable.slice(BUCKET.length + 1) : portable;
}
