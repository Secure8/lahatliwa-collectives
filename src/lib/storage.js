import { supabase } from './supabaseClient';
import { optimizeImageForUpload } from './imageCompression';
import { validateUploadFile } from './uploadLimits';

const BUCKET = 'project-media';
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

function filePath(prefix, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  return `${prefix}/${crypto.randomUUID()}-${safeName}`;
}

export function isPdfFile(path = '') {
  return path.split('?')[0].toLowerCase().endsWith('.pdf');
}

export function getPublicImageUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadCoverImage(file, { onStatus } = {}) {
  if (!file) return '';
  validateCoverUploadFile(file);
  const prepared = await optimizeImageForUpload(file, 'projectCover', { label: 'Project cover', onStatus });
  onStatus?.({ phase: 'uploading', ...prepared });
  const path = filePath('projects/covers', prepared.file);
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
    const path = filePath('projects/gallery', prepared.file);
    const { error } = await supabase.storage.from(BUCKET).upload(path, prepared.file, UPLOAD_OPTIONS);
    if (error) throw error;
    uploadedPaths.push(path);
  }

  return uploadedPaths;
}

export async function uploadExternalThumbnail(file, projectSlug = 'project', { onStatus } = {}) {
  if (!file) return '';
  validateExternalThumbnailUploadFile(file);
  const prepared = await optimizeImageForUpload(file, 'externalThumbnail', { label: 'Thumbnail', onStatus });
  onStatus?.({ phase: 'uploading', ...prepared });
  const safeSlug = (projectSlug || 'project').replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  const path = filePath(`projects/${safeSlug}/external-thumbnails`, prepared.file);
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
