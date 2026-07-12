export function safeExternalUrl(value, { allowMailto = false } = {}) {
  let candidate = String(value || '').trim();
  if (!candidate) return '';
  if (candidate.startsWith('//')) candidate = `https:${candidate}`;
  if (/^www\./i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const url = new URL(candidate);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
    if (allowMailto && url.protocol === 'mailto:' && url.pathname) return candidate;
  } catch {
  }
  return '';
}

export function safeInternalPath(value) {
  const candidate = String(value || '').trim();
  return /^\/(?!\/)/.test(candidate) ? candidate : '';
}
