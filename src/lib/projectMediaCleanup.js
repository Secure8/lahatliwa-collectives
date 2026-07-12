export const PROJECT_MEDIA_BUCKET = 'project-media';
export const ORPHAN_SAFETY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function normalizeStoragePath(value = '') {
  if (!value || typeof value !== 'string') return '';
  if (!/^https?:\/\//i.test(value)) {
    try { return decodeURIComponent(value.replace(/^\/+/, '').split('?')[0]); } catch { return ''; }
  }
  try {
    const url = new URL(value);
    const marker = `/object/public/${PROJECT_MEDIA_BUCKET}/`;
    const index = url.pathname.indexOf(marker);
    return index < 0 ? '' : decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch { return ''; }
}

export function collectReferencedStoragePaths(...sources) {
  const paths = new Set();
  function visit(value) {
    if (typeof value === 'string') {
      const looksLikeMedia = /^https?:\/\//i.test(value) || (value.includes('/') && /\.[a-z0-9]{2,5}(?:\?|$)/i.test(value));
      if (looksLikeMedia) {
        const path = normalizeStoragePath(value);
        if (path) paths.add(path);
      }
      return;
    }
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  }
  sources.forEach(visit);
  return paths;
}

export function collectProjectMediaPaths(project = {}) {
  const items = Array.isArray(project.gallery_items) ? project.gallery_items : [];
  const paths = [
    normalizeStoragePath(project.cover_image),
    ...(project.gallery_images || []).map(normalizeStoragePath),
    ...items.flatMap((item) => [normalizeStoragePath(item.url), normalizeStoragePath(item.thumbnail_storage_path), normalizeStoragePath(item.thumbnail_url)]),
  ].filter((path) => path && !path.startsWith('creative-profiles/'));
  return [...new Set(paths)];
}

export function classifyUnreferencedObject(object = {}, referencedPaths = new Set(), now = Date.now()) {
  const path = normalizeStoragePath(object.name || object.path || '');
  if (referencedPaths.has(path)) return 'referenced';
  const createdAt = new Date(object.created_at || object.createdAt || 0).getTime();
  if (createdAt && now - createdAt < ORPHAN_SAFETY_WINDOW_MS) return 'possible_orphan';
  if (!path || path.startsWith('creative-profiles/')) return 'manual_review';
  return 'confirmed_orphan';
}
