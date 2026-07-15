export const SMALL_DRIVE_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
export const SMALL_DRIVE_REQUEST_MAX_BYTES = SMALL_DRIVE_UPLOAD_MAX_BYTES + 64 * 1024;

export const DRIVE_UPLOAD_PURPOSES = Object.freeze({
  admin_test_upload: Object.freeze({
    folderRole: 'originals',
    folderLabel: 'Originals',
    allowedMimeTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  }),
  project_gallery_original: Object.freeze({
    folderRole: 'originals',
    folderLabel: 'Originals',
    allowedMimeTypes: Object.freeze(['image/jpeg', 'image/png', 'image/webp']),
  }),
});

const MIME_EXTENSIONS = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
});

export const SMALL_DRIVE_UPLOAD_TYPES = Object.freeze(Object.keys(MIME_EXTENSIONS));

function startsWith(bytes, signature, offset = 0) {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function detectSmallDriveUploadMime(bytes) {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return '';
}

export function resolveDriveUploadPurpose(value) {
  return DRIVE_UPLOAD_PURPOSES[String(value || '').trim()] || null;
}

export function driveUploadPurposeAllowsMime(purpose, mimeType) {
  return Boolean(purpose?.allowedMimeTypes?.includes(mimeType));
}

export function safeDriveFilename(value = '', mimeType = '') {
  const normalized = String(value).normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/[. ]+$/g, '')
    .trim();
  const fallback = normalized || 'upload';
  const extension = MIME_EXTENSIONS[mimeType];
  if (!extension) return fallback.slice(0, 180);
  const stem = fallback.replace(/\.[a-z0-9]{1,10}$/i, '').replace(/[. ]+$/g, '') || 'upload';
  return `${stem.slice(0, Math.max(1, 175 - extension.length))}.${extension}`;
}

export async function validateSmallDriveUpload(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || typeof file.slice !== 'function') {
    return { ok: false, code: 'FILE_REQUIRED', message: 'Choose one file to upload.' };
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > SMALL_DRIVE_UPLOAD_MAX_BYTES) {
    return { ok: false, code: 'FILE_SIZE_NOT_ALLOWED', message: 'The file must be larger than 0 bytes and no more than 2 MB.' };
  }
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detectedMimeType = detectSmallDriveUploadMime(header);
  if (!detectedMimeType) {
    return { ok: false, code: 'FILE_TYPE_NOT_ALLOWED', message: 'Choose a genuine JPEG, PNG, WebP, or PDF file.' };
  }
  const claimedMimeType = String(file.type || '').toLowerCase();
  if (claimedMimeType && claimedMimeType !== 'application/octet-stream' && claimedMimeType !== detectedMimeType) {
    return { ok: false, code: 'FILE_CONTENT_MISMATCH', message: 'The file content does not match its reported type.' };
  }
  return {
    ok: true,
    name: safeDriveFilename(file.name, detectedMimeType),
    mimeType: detectedMimeType,
    size: file.size,
  };
}

export function validateDriveUploadResult(uploaded, expected) {
  const size = Number(uploaded?.size);
  if (!uploaded?.id || uploaded.mimeType !== expected.mimeType || size !== expected.size
    || !Array.isArray(uploaded.parents) || !uploaded.parents.includes(expected.parentId)) {
    return { ok: false, code: 'PROVIDER_METADATA_MISMATCH' };
  }
  return { ok: true, size };
}
