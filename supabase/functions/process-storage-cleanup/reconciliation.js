export const BUCKET = 'project-media';
export const SAFETY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function normalizeProjectMediaPath(value = '') {
  if (typeof value !== 'string' || !value.trim()) return '';
  let raw = value.trim().split('#')[0].split('?')[0];
  try { raw = decodeURIComponent(raw); } catch { return ''; }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const pathname = new URL(raw).pathname;
      const patterns = [`/storage/v1/object/public/${BUCKET}/`, `/storage/v1/object/sign/${BUCKET}/`, `/object/public/${BUCKET}/`];
      const marker = patterns.find((pattern) => pathname.includes(pattern));
      if (!marker) return '';
      raw = pathname.slice(pathname.indexOf(marker) + marker.length);
    } catch { return ''; }
  }
  raw = raw.replace(/^\/+/, '');
  if (raw.startsWith(`${BUCKET}/`)) raw = raw.slice(BUCKET.length + 1);
  try { raw = decodeURIComponent(raw); } catch { return ''; }
  if (!raw || raw.length > 1024 || raw.includes('..') || raw.includes('\\') || /^https?:/i.test(raw)) return '';
  return raw;
}

export function collectReferencePaths(...sources) {
  const paths = new Set();
  const visit = (value) => {
    if (typeof value === 'string') {
      const path = normalizeProjectMediaPath(value);
      const looksStored = /^https?:\/\//i.test(value) ? Boolean(path) : value.includes('/') && /\.[a-z0-9]{2,8}(?:\?|#|$)/i.test(value);
      if (path && looksStored) paths.add(path);
    } else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  sources.forEach(visit);
  return paths;
}

export function classifyStorageObject(object, references, now = Date.now()) {
  const path = normalizeProjectMediaPath(object?.path || object?.name || '');
  if (!path) return { classification: 'invalid', path: '', reason: 'Object path is invalid or unparseable.' };
  if (references.has(path)) return { classification: 'referenced', path, reason: 'Path is present in a database reference.' };
  const createdAt = new Date(object?.created_at || object?.createdAt || '').getTime();
  if (!Number.isFinite(createdAt) || createdAt <= 0) return { classification: 'uncertain', path, reason: 'Object creation time is unavailable.' };
  const ageMs = Math.max(0, now - createdAt);
  if (ageMs < SAFETY_WINDOW_MS) return { classification: 'recent', path, ageMs, reason: 'Object is inside the 24-hour safety window.' };
  return { classification: 'confirmed_orphan', path, ageMs, reason: 'Valid old object has no reference in any scanned source.' };
}

export function summarizeClassifications(items) {
  const summary = { total: items.length, referenced: 0, recent: 0, uncertain: 0, confirmedOrphan: 0, invalid: 0 };
  for (const item of items) {
    if (item.classification === 'confirmed_orphan') summary.confirmedOrphan += 1;
    else if (Object.hasOwn(summary, item.classification)) summary[item.classification] += 1;
  }
  return summary;
}

export function deduplicateQueuePaths(paths = []) {
  return [...new Set(paths.map(normalizeProjectMediaPath).filter(Boolean))];
}

export function unwrapReferenceScanResults(results = []) {
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason instanceof Error ? failure.reason : new Error('Reference scan failed.');
  return results.map((result) => result.value);
}

export function hasActiveCleanupJob(jobs = []) {
  return jobs.some((job) => ['pending', 'processing', 'failed'].includes(job?.status));
}
