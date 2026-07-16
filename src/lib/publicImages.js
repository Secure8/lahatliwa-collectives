const BUCKET = 'project-media';
export function normalizePublicImagePath(value) {
  if (typeof value !== 'string') return '';
  const path = value.trim();
  if (!path || /^javascript:/i.test(path)) return '';
  if (/^(https?:)?\/\//i.test(path) || /^(data|blob):/i.test(path) || path.startsWith('/')) return path;
  const portable = path.replace(/\\/g, '/').replace(/^\/+/, '');
  return portable.toLowerCase().startsWith(`${BUCKET}/`) ? portable.slice(BUCKET.length + 1) : portable;
}

export function publicImageVariant(value, variant = 'display') {
  const image = normalizePublicImagePath(value);
  if (!['thumbnail', 'display', 'expanded'].includes(variant)) return image;
  return /^https:\/\//i.test(image) && /\/(?:thumbnail|display|expanded)\.webp(?:[?#]|$)/i.test(image)
    ? image.replace(/\/(?:thumbnail|display|expanded)\.webp(?=([?#]|$))/i, `/${variant}.webp`)
    : image;
}
