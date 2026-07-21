export const TOURISM_SLIDE_SLOTS = Object.freeze([
  { key: 'journal', label: 'Journal', action: 'View Journal', path: '/journal' },
  { key: 'event', label: 'Event', action: 'View Event', path: '/events' },
  { key: 'place', label: 'Place', action: 'View Place', path: '/places' },
  { key: 'activity', label: 'Activity', action: 'View Activity', path: '/activities' },
  { key: 'local_product', label: 'Local Product', action: 'View Local Product', path: '/local-products' },
]);

export const TOURISM_SLIDE_AUTOPLAY_MS = 9000;
const SLOT_BY_TYPE = new Map(TOURISM_SLIDE_SLOTS.map((slot) => [slot.key, slot]));

export function tourismSlideMeta(type) {
  return SLOT_BY_TYPE.get(String(type || '')) || null;
}

export function editorialPublicPath(post = {}) {
  const meta = tourismSlideMeta(post.content_type);
  const slug = String(post.slug || '').trim();
  return meta && slug ? `${meta.path}/${encodeURIComponent(slug)}` : '';
}

export function normalizeHomepageSlides(rows = []) {
  const usedTypes = new Set();
  const usedPosts = new Set();
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const post = row?.editorial_posts;
      const type = String(row?.slot_type || '');
      const postId = String(post?.id || '');
      const valid = Boolean(
        row?.enabled
        && tourismSlideMeta(type)
        && post
        && post.content_type === type
        && postId
        && !usedTypes.has(type)
        && !usedPosts.has(postId)
        && post.status === 'published'
        && post.published_revision_id
        && post.published_at
        && !post.archived_at
        && String(post.cover_image_url || '').trim()
        && String(post.slug || '').trim()
      );
      if (valid) {
        usedTypes.add(type);
        usedPosts.add(postId);
      }
      return valid;
    })
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

export function mergeUniqueDestinations(current = [], incoming = []) {
  const byId = new Map();
  for (const item of [...current, ...incoming]) {
    if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

export function carouselStep(index, length, direction = 1) {
  if (!length) return 0;
  return (Number(index || 0) + Number(direction || 0) + length) % length;
}

export function swipeDirection(startX, endX, threshold = 48) {
  const distance = Number(endX) - Number(startX);
  if (Math.abs(distance) < threshold) return 0;
  return distance < 0 ? 1 : -1;
}
