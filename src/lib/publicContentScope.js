export function publicContentScope(pageKeys = []) {
  return [...new Set(pageKeys)].sort().join('|') || 'settings';
}

export function cachedContentMatchesScope(cachedEntry, pageKeys = []) {
  return Boolean(cachedEntry?.content && cachedEntry.scope === publicContentScope(pageKeys));
}
