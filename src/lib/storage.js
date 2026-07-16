import { supabase } from './supabaseClient.js';
import { optimizeImageForUpload } from './imageCompression.js';
import { validateUploadFile } from './uploadLimits.js';
import { normalizePublicImagePath } from './publicImages.js';
import { requestManagedMediaDeletion, uploadManagedWebsiteImage } from './r2Media.js';
import { extractSupabaseStoragePath } from './mediaReferences.js';
export { normalizePublicImagePath } from './publicImages.js';

export const PROJECT_MEDIA_BUCKET = 'project-media';
const BUCKET = PROJECT_MEDIA_BUCKET;

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

function validatePublicGalleryImage(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Public gallery uploads must be JPEG, PNG, or WebP images. Private documents belong in the optional file-storage workflow.');
  }
  validateUploadFile(file, 'galleryImage');
}

export function validateGalleryUploadFile(file) {
  validatePublicGalleryImage(file);
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


export async function uploadCoverImage(file, { onStatus, projectId = '' } = {}) {
  if (!file) return '';
  validateCoverUploadFile(file);
  if (!projectId) throw Object.assign(new Error('Prepare the project draft before uploading its cover.'), { code: 'MEDIA_DRAFT_REQUIRED' });
  const managed = await uploadManagedWebsiteImage(file, { category: 'project_cover', projectId, onStatus });
  return managed.primaryUrl;
}

export async function uploadGalleryImages(files, { onStatus, projectId = '' } = {}) {
  if (!files || files.length === 0) return [];
  const selectedFiles = Array.from(files);
  const uploadedPaths = [];

  for (const [index, file] of selectedFiles.entries()) {
    validatePublicGalleryImage(file);
    if (!projectId) throw Object.assign(new Error('Prepare the project draft before uploading gallery images.'), { code: 'MEDIA_DRAFT_REQUIRED' });
    const managed = await uploadManagedWebsiteImage(file, { category: 'project_gallery', projectId, onStatus: (status) => onStatus?.({ ...status, index, total: selectedFiles.length }) });
    uploadedPaths.push(managed.primaryUrl);
  }

  return uploadedPaths;
}

export async function prepareGalleryImageForUpload(file, { onStatus } = {}) {
  validateGalleryFile(file);
  if (file.type === 'application/pdf') throw new Error('Google Drive gallery originals are limited to images in this phase.');
  return optimizeImageForUpload(file, 'galleryImage', { label: 'Gallery image', onStatus });
}

export async function uploadPreparedGalleryFile(file, { projectId = '', onStatus } = {}) {
  validateGalleryFile(file);
  if (!projectId) throw Object.assign(new Error('A project draft is required before creating a public preview.'), { code: 'MEDIA_DRAFT_REQUIRED' });
  const managed = await uploadManagedWebsiteImage(file, { category: 'project_gallery', projectId, onStatus });
  return managed.primaryUrl;
}

export async function uploadExternalThumbnail(file, projectSlug = 'project', { onStatus, projectId = '' } = {}) {
  if (!file) return '';
  validateExternalThumbnailUploadFile(file);
  if (!projectId) throw Object.assign(new Error('Prepare the project draft before uploading a thumbnail.'), { code: 'MEDIA_DRAFT_REQUIRED' });
  const managed = await uploadManagedWebsiteImage(file, { category: 'external_thumbnail', projectId, onStatus });
  return managed.primaryUrl;
}

export async function deleteImages(paths) {
  const values = [...new Set((Array.isArray(paths) ? paths : [paths]).filter(Boolean))];
  const managed = values.filter((path) => /^https:\/\//i.test(path));
  const removable = [...new Set(values.map((path) => extractSupabaseStoragePath(path, BUCKET)).filter(Boolean))];
  if (removable.length) {
    const { error } = await supabase.storage.from(BUCKET).remove(removable);
    if (error) throw error;
  }
  for (const url of managed) await requestManagedMediaDeletion(url);
}
