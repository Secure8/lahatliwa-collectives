import { supabase } from './supabaseClient.js';
import { optimizeImageForUpload } from './imageCompression.js';
import { validateUploadFile } from './uploadLimits.js';
import { normalizePublicImagePath } from './publicImages.js';
export { normalizePublicImagePath } from './publicImages.js';

export const PROJECT_MEDIA_BUCKET = 'project-media';
const BUCKET = PROJECT_MEDIA_BUCKET;
const UPLOAD_OPTIONS = { upsert: false, cacheControl: '31536000' };

function validateProjectImage(file, limitKey = 'projectCover') {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Project images must be JPEG, PNG, or WebP.');
  }
  validateUploadFile(file, limitKey);
}

function validateGalleryFile(file) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Gallery files must be JPEG, PNG, WebP, or PDF.');
  }
  validateUploadFile(file, file.type === 'application/pdf' ? 'galleryDocument' : 'galleryImage');
}

export function validateGalleryUploadFile(file) {
  validateGalleryFile(file);
}

export function validateCoverUploadFile(file) {
  validateProjectImage(file, 'projectCover');
}

export function validateExternalThumbnailUploadFile(file) {
  validateProjectImage(file, 'externalThumbnail');
}

export function createProjectMediaPath(prefix, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  return `${prefix}/${crypto.randomUUID()}-${safeName}`;
}

export function isPdfFile(path = '') {
  return path.split('?')[0].toLowerCase().endsWith('.pdf');
}

export function getPublicImageUrl(path) {
  const normalized = normalizePublicImagePath(path);
  if (!normalized) return '';
  if (/^(https?:)?\/\//i.test(normalized) || /^(data|blob):/i.test(normalized) || normalized.startsWith('/')) return normalized;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(normalized);
  return data.publicUrl;
}


export async function uploadCoverImage(file, { onStatus } = {}) {
  if (!file) return '';
  validateCoverUploadFile(file);
  const prepared = await optimizeImageForUpload(file, 'projectCover', { label: 'Project cover', onStatus });
  onStatus?.({ phase: 'uploading', ...prepared });
  const path = createProjectMediaPath('projects/covers', prepared.file);
  const { error } = await supabase.storage.from(BUCKET).upload(path, prepared.file, UPLOAD_OPTIONS);
  if (error) throw error;
  return path;
}

export async function uploadGalleryImages(files, { onStatus } = {}) {
  if (!files || files.length === 0) return [];
  const selectedFiles = Array.from(files);
  const uploadedPaths = [];

  for (const [index, file] of selectedFiles.entries()) {
    validateGalleryFile(file);
    const prepared = file.type === 'application/pdf'
      ? { file, optimized: false, originalBytes: file.size, finalBytes: file.size, message: '' }
      : await optimizeImageForUpload(file, 'galleryImage', { label: 'Gallery image', onStatus });
    onStatus?.({ phase: 'uploading', index, total: selectedFiles.length, ...prepared });
    const path = await uploadPreparedGalleryFile(prepared.file);
    uploadedPaths.push(path);
  }

  return uploadedPaths;
}

export async function prepareGalleryImageForUpload(file, { onStatus } = {}) {
  validateGalleryFile(file);
  if (file.type === 'application/pdf') throw new Error('Google Drive gallery originals are limited to images in this phase.');
  return optimizeImageForUpload(file, 'galleryImage', { label: 'Gallery image', onStatus });
}

export async function uploadPreparedGalleryFile(file) {
  validateGalleryFile(file);
  const path = createProjectMediaPath('projects/gallery', file);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, UPLOAD_OPTIONS);
  if (error) throw error;
  return path;
}

export async function uploadExternalThumbnail(file, projectSlug = 'project', { onStatus } = {}) {
  if (!file) return '';
  validateExternalThumbnailUploadFile(file);
  const prepared = await optimizeImageForUpload(file, 'externalThumbnail', { label: 'Thumbnail', onStatus });
  onStatus?.({ phase: 'uploading', ...prepared });
  const safeSlug = (projectSlug || 'project').replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  const path = createProjectMediaPath(`projects/${safeSlug}/external-thumbnails`, prepared.file);
  const { error } = await supabase.storage.from(BUCKET).upload(path, prepared.file, UPLOAD_OPTIONS);
  if (error) throw error;
  return path;
}

export async function deleteImages(paths) {
  const removable = (Array.isArray(paths) ? paths : [paths]).filter((path) => path && !path.startsWith('http'));
  if (removable.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove([...new Set(removable)]);
  if (error) throw error;
}
