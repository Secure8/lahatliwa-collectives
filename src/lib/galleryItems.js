import { getPublicImageUrl, isPdfFile } from './storage';

export const galleryItemTypes = ['external_link', 'youtube', 'facebook', 'instagram', 'tiktok', 'website'];

export function makeGalleryItemId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function detectGalleryPlatform(url = '') {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return { type: 'external_link', platform: 'External Link', label: 'External Link', actionLabel: 'Open Link' };
  }

  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    return { type: 'youtube', platform: 'YouTube', label: 'YouTube', actionLabel: 'Watch Video' };
  }
  if (host.includes('facebook.com') || host.includes('fb.watch')) {
    return { type: 'facebook', platform: 'Facebook', label: 'Facebook', actionLabel: 'View Post' };
  }
  if (host.includes('instagram.com')) {
    return { type: 'instagram', platform: 'Instagram', label: 'Instagram', actionLabel: 'View Post' };
  }
  if (host.includes('tiktok.com')) {
    return { type: 'tiktok', platform: 'TikTok', label: 'TikTok', actionLabel: 'View Post' };
  }
  return { type: 'website', platform: 'Website', label: 'Website', actionLabel: 'Open Link' };
}

export function getYouTubeVideoId(url = '') {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('youtu.be')) return parsed.pathname.replace('/', '').split('/')[0] || '';
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v');
    const embedMatch = parsed.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/);
    return embedMatch?.[1] || '';
  } catch {
    return '';
  }
}

export function createExternalGalleryItem(url = '', order = 0) {
  const detected = detectGalleryPlatform(url);
  return {
    id: makeGalleryItemId(),
    type: detected.type,
    title: '',
    url,
    description: '',
    thumbnail_url: '',
    thumbnail_storage_path: '',
    platform: detected.platform,
    order,
    created_at: new Date().toISOString(),
  };
}

export function createImageGalleryItem(path = '', order = 0) {
  return {
    id: makeGalleryItemId(),
    type: isPdfFile(path) ? 'pdf' : 'image',
    title: '',
    url: path,
    description: '',
    thumbnail_url: '',
    thumbnail_storage_path: '',
    platform: isPdfFile(path) ? 'PDF' : 'Image',
    order,
    created_at: new Date().toISOString(),
  };
}

export function normalizeGalleryItem(item = {}, index = 0) {
  const detected = item.url ? detectGalleryPlatform(item.url) : {};
  const type = item.type || detected.type || 'external_link';
  return {
    id: item.id || makeGalleryItemId(),
    type,
    title: item.title || '',
    url: item.url || '',
    description: item.description || '',
    thumbnail_url: item.thumbnail_url || '',
    thumbnail_storage_path: item.thumbnail_storage_path || '',
    platform: item.platform || detected.platform || platformLabel(type),
    order: Number.isFinite(Number(item.order)) ? Number(item.order) : index * 100,
    created_at: item.created_at || new Date().toISOString(),
  };
}

export function normalizeProjectGallery(project = {}) {
  const storedItems = Array.isArray(project.gallery_items)
    ? project.gallery_items.map(normalizeGalleryItem)
    : [];
  const storedImageUrls = new Set(
    storedItems
      .filter((item) => item.type === 'image' || item.type === 'pdf')
      .map((item) => item.url)
  );
  const legacyItems = (project.gallery_images || [])
    .filter((path) => path && !storedImageUrls.has(path))
    .map((path, index) => createImageGalleryItem(path, index * 100));

  return [...legacyItems, ...storedItems]
    .filter((item) => item.url)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getGalleryItemMediaUrl(item = {}) {
  return getPublicImageUrl(item.url);
}

export function getGalleryItemThumbnailUrl(item = {}) {
  return item.thumbnail_url || '';
}

export function platformLabel(type = '') {
  const labels = {
    image: 'Image',
    pdf: 'PDF',
    external_link: 'External Link',
    youtube: 'YouTube',
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
    website: 'Website',
  };
  return labels[type] || 'External Link';
}

export function actionLabelForItem(item = {}) {
  if (item.type === 'youtube') return 'Watch Video';
  if (item.type === 'image') return 'Open Image';
  if (item.type === 'pdf') return 'Open PDF';
  if (['facebook', 'instagram', 'tiktok'].includes(item.type)) return 'View Post';
  return 'Open Link';
}
