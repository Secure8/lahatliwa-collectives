export const PUBLIC_CONTENT_CACHE_PREFIX = 'hevv-public-content-cache-v4:';

export function publicContentScope(pageKeys = []) {
  return [...new Set(pageKeys)].sort().join('|') || 'settings';
}

export function publicContentCacheKey(pageKeys = []) {
  return `${PUBLIC_CONTENT_CACHE_PREFIX}${encodeURIComponent(publicContentScope(pageKeys))}`;
}

export function publicContentCacheKeyMatchesScope(key, pageKeys = []) {
  return key === publicContentCacheKey(pageKeys);
}

export function cachedContentMatchesScope(cachedEntry, pageKeys = []) {
  return Boolean(cachedEntry?.content && cachedEntry.scope === publicContentScope(pageKeys));
}
