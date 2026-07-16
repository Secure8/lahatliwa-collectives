import { listR2Objects } from './r2Media.js';

const MAX_XML_BYTES = 4 * 1024 * 1024;
const MAX_LIST_PAGES = 1000;

function decodeXml(value = '') {
  return String(value)
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function parseR2ListObjectsPage(xml = '') {
  const source = String(xml || '');
  if (!source || !/<ListBucketResult(?:\s|>)/i.test(source) || new TextEncoder().encode(source).byteLength > MAX_XML_BYTES) {
    throw Object.assign(new Error('The R2 object listing response was invalid.'), { code: 'R2_USAGE_RESPONSE_INVALID' });
  }

  let bytes = 0;
  let objects = 0;
  for (const match of source.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const sizeText = match[1].match(/<Size>\s*(\d+)\s*<\/Size>/)?.[1] || '';
    const size = Number(sizeText);
    if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(bytes + size)) {
      throw Object.assign(new Error('The R2 object listing contained an invalid size.'), { code: 'R2_USAGE_SIZE_INVALID' });
    }
    bytes += size;
    objects += 1;
  }

  const truncated = /<IsTruncated>true<\/IsTruncated>/i.test(source);
  const tokenMatch = source.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/i);
  const continuationToken = tokenMatch ? decodeXml(tokenMatch[1]).trim() : '';
  if (truncated && !continuationToken) {
    throw Object.assign(new Error('The R2 object listing could not continue safely.'), { code: 'R2_USAGE_TOKEN_MISSING' });
  }
  return { bytes, objects, truncated, continuationToken };
}

export async function readR2BucketUsage(fetcher, config, { maxPages = MAX_LIST_PAGES, maxDurationMs = 12_000 } = {}) {
  const startedAt = Date.now();
  const seenTokens = new Set();
  let continuationToken = '';
  let totalBytes = 0;
  let objectCount = 0;
  let pages = 0;

  do {
    if (pages >= maxPages || Date.now() - startedAt > maxDurationMs) {
      throw Object.assign(new Error('The R2 bucket is too large to measure within one safe request.'), { code: 'R2_USAGE_INCOMPLETE' });
    }
    const response = await listR2Objects(fetcher, config, { continuationToken, maxKeys: 1000 });
    if (!response.ok) {
      throw Object.assign(new Error('R2 bucket usage is currently unavailable.'), { code: 'R2_USAGE_REQUEST_FAILED', status: response.status });
    }
    const contentType = String(response.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
    if (contentType && !['application/xml', 'text/xml', 'application/octet-stream'].includes(contentType)) {
      throw Object.assign(new Error('R2 returned a non-XML bucket listing.'), { code: 'R2_USAGE_NON_XML_RESPONSE' });
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_XML_BYTES) {
      throw Object.assign(new Error('The R2 object listing response exceeded the safe limit.'), { code: 'R2_USAGE_RESPONSE_TOO_LARGE' });
    }
    const page = parseR2ListObjectsPage(await response.text());
    if (!Number.isSafeInteger(totalBytes + page.bytes) || !Number.isSafeInteger(objectCount + page.objects)) {
      throw Object.assign(new Error('R2 bucket usage exceeded the supported numeric range.'), { code: 'R2_USAGE_TOTAL_INVALID' });
    }
    totalBytes += page.bytes;
    objectCount += page.objects;
    pages += 1;
    if (!page.truncated) continuationToken = '';
    else {
      if (seenTokens.has(page.continuationToken)) {
        throw Object.assign(new Error('The R2 object listing returned a repeated continuation token.'), { code: 'R2_USAGE_TOKEN_REPEATED' });
      }
      seenTokens.add(page.continuationToken);
      continuationToken = page.continuationToken;
    }
  } while (continuationToken);

  return { available: true, totalBytes, objectCount, pages, source: 'r2_list_objects_v2', checkedAt: new Date().toISOString() };
}
