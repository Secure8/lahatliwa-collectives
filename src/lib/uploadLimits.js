const KB = 1024;
const MB = 1024 * KB;

export const UPLOAD_LIMITS = Object.freeze({
  galleryImage: Object.freeze({
    maxBytes: 1 * MB,
    maxDimension: 1600,
    compressImage: true,
    message: 'Gallery images must be 1 MB or smaller. Please compress this file before uploading.',
  }),
  galleryDocument: Object.freeze({
    maxBytes: 2 * MB,
    message: 'Gallery PDFs and documents must be 2 MB or smaller.',
  }),
  projectCover: Object.freeze({
    maxBytes: 1 * MB,
    maxDimension: 1600,
    compressImage: true,
    message: 'Project cover images must be 1 MB or smaller. Please compress this file before uploading.',
  }),
  externalThumbnail: Object.freeze({
    maxBytes: 300 * KB,
    maxDimension: 800,
    compressImage: true,
    message: 'Thumbnails must be 300 KB or smaller. Please compress this file before uploading.',
  }),
  creativeProfile: Object.freeze({
    maxBytes: 300 * KB,
    maxDimension: 800,
    compressImage: true,
    message: 'Profile photos must be 300 KB or smaller. Please compress this file before uploading.',
  }),
  serviceMedia: Object.freeze({
    maxBytes: 300 * KB,
    maxDimension: 600,
    compressImage: true,
    message: 'Service icons and logos must be 300 KB or smaller.',
  }),
  mediaIcon: Object.freeze({
    maxBytes: 300 * KB,
    maxDimension: 600,
    compressImage: true,
    message: 'Icons and small media must be 300 KB or smaller.',
  }),
  siteLogo: Object.freeze({
    maxBytes: 300 * KB,
    maxDimension: 600,
    compressImage: true,
    message: 'Site logos must be 300 KB or smaller.',
  }),
  siteImage: Object.freeze({
    maxBytes: 1 * MB,
    maxDimension: 1600,
    compressImage: true,
    message: 'Site and hero images must be 1 MB or smaller. Please compress this file before uploading.',
  }),
});

const COMPRESSIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function getUploadLimit(ruleOrKey) {
  const rule = typeof ruleOrKey === 'string' ? UPLOAD_LIMITS[ruleOrKey] : ruleOrKey;
  if (!rule?.maxBytes) throw new Error('Upload limit is not configured.');
  return rule;
}

export function validateUploadFile(file, ruleOrKey) {
  if (!file) return file;
  const rule = getUploadLimit(ruleOrKey);
  const canOptimize = rule.compressImage && COMPRESSIBLE_IMAGE_TYPES.has(file.type);
  if (!canOptimize && file.size > rule.maxBytes) throw new Error(rule.message);
  return file;
}

export function validateUploadFiles(files, ruleOrKey) {
  return Array.from(files || []).map((file) => validateUploadFile(file, ruleOrKey));
}

export function uploadLimitMessage(ruleOrKey) {
  return getUploadLimit(ruleOrKey).message;
}

export function isCompressibleUploadImage(file) {
  return Boolean(file && COMPRESSIBLE_IMAGE_TYPES.has(file.type));
}
