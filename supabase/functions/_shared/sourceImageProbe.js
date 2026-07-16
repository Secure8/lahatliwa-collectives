const TARGET_HEADER_BYTES = 32;
const MAX_HEADER_BYTES = 64;
const IMAGE_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function probeError(code, message, diagnostics) {
  return Object.assign(new Error(message), { code, diagnostics });
}

export function normalizeProbeContentType(value = '') {
  const type = String(value || '').split(';')[0].trim().toLowerCase();
  return type === 'image/jpg' ? 'image/jpeg' : type;
}

export function sourceSizeFromProbeHeaders(headers, status) {
  const contentRange = String(headers?.get?.('content-range') || '').trim();
  const rangeMatch = contentRange.match(/^bytes\s+\d+-\d+\/(\d+)$/i);
  if (rangeMatch) {
    const total = Number(rangeMatch[1]);
    if (Number.isSafeInteger(total) && total > 0) return { sizeBytes: total, source: 'content-range' };
  }
  if (Number(status) === 200) {
    const length = Number(headers?.get?.('content-length') || 0);
    if (Number.isSafeInteger(length) && length > 0) return { sizeBytes: length, source: 'content-length' };
  }
  return { sizeBytes: 0, source: 'unavailable' };
}

export async function readBoundedResponsePrefix(response, { targetBytes = TARGET_HEADER_BYTES, maxBytes = MAX_HEADER_BYTES } = {}) {
  const target = Math.max(16, Math.min(Number(targetBytes || TARGET_HEADER_BYTES), MAX_HEADER_BYTES));
  const ceiling = Math.max(target, Math.min(Number(maxBytes || MAX_HEADER_BYTES), MAX_HEADER_BYTES));
  const reader = response?.body?.getReader?.();
  if (!reader) return { bytes: new Uint8Array(), ended: true, cancelled: false };
  const output = new Uint8Array(ceiling);
  let written = 0;
  let ended = false;
  let cancelled = false;
  try {
    while (written < target && written < ceiling) {
      const result = await reader.read();
      if (result.done) { ended = true; break; }
      const chunk = result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value || []);
      if (!chunk.byteLength) continue;
      const count = Math.min(chunk.byteLength, ceiling - written);
      output.set(chunk.subarray(0, count), written);
      written += count;
    }
  } finally {
    try { await reader.cancel(); cancelled = true; } catch { cancelled = false; }
  }
  return { bytes: output.slice(0, written), ended, cancelled };
}

function looksLikeNonImageBody(bytes) {
  const text = new TextDecoder().decode(bytes).trimStart().toLowerCase();
  return text.startsWith('{') || text.startsWith('[') || text.startsWith('<!doctype html')
    || text.startsWith('<html') || text.startsWith('<?xml') || text.startsWith('<error')
    || text.startsWith('<response');
}

export function detectedImageContentType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [137,80,78,71,13,10,26,10][index])) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return '';
}

export async function inspectSourceImageProbe(response) {
  const httpStatus = Number(response?.status || 0);
  const contentType = normalizeProbeContentType(response?.headers?.get?.('content-type'));
  const size = sourceSizeFromProbeHeaders(response?.headers, httpStatus);
  const prefix = await readBoundedResponsePrefix(response);
  const diagnostics = {
    httpStatus,
    contentType: contentType || 'missing',
    headerBytesRead: prefix.bytes.byteLength,
    readerCancelled: prefix.cancelled,
    sizeSource: size.source,
  };

  if (![200, 206].includes(httpStatus)) throw probeError('SOURCE_PROBE_HTTP_FAILED', 'The source probe request was not successful.', diagnostics);
  if (!IMAGE_CONTENT_TYPES.has(contentType) || looksLikeNonImageBody(prefix.bytes)) throw probeError('SOURCE_PROBE_NON_IMAGE_RESPONSE', 'The source probe returned a non-image response.', diagnostics);
  if (!size.sizeBytes) throw probeError('SOURCE_PROBE_SIZE_UNKNOWN', 'The source size could not be verified from the ranged response.', diagnostics);
  if (prefix.bytes.byteLength < 12) throw probeError('SOURCE_PROBE_TOO_SHORT', 'The source probe ended before enough image header bytes were available.', diagnostics);
  const detectedType = detectedImageContentType(prefix.bytes);
  if (!detectedType || detectedType !== contentType) throw probeError('SOURCE_SIGNATURE_MISMATCH', 'The source image signature does not match its declared type.', diagnostics);
  return { bytes: prefix.bytes, mimeType: contentType, sizeBytes: size.sizeBytes, diagnostics };
}

export const SOURCE_IMAGE_PROBE_LIMITS = Object.freeze({ targetHeaderBytes: TARGET_HEADER_BYTES, maxHeaderBytes: MAX_HEADER_BYTES });
