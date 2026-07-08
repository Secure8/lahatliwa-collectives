import { supabase } from './supabaseClient';
import { compressImageForUpload } from './imageCompression';

const BUCKET = 'project-media';

function validateProjectImage(file) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Project images must be JPEG, PNG, or WebP.');
  }
}

function validateGalleryFile(file) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Gallery files must be JPEG, PNG, WebP, or PDF.');
  }
}

export function validateGalleryUploadFile(file) {
  validateGalleryFile(file);
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

export async function uploadCoverImage(file) {
  if (!file) return '';
  validateProjectImage(file);
  const uploadFile = await compressImageForUpload(file, { label: 'Project image' });
  const path = filePath('projects/covers', uploadFile);
  const { error } = await supabase.storage.from(BUCKET).upload(path, uploadFile, { upsert: false });
  if (error) throw error;
  return path;
}

export async function uploadGalleryImages(files) {
  if (!files || files.length === 0) return [];
  const uploads = Array.from(files).map(async (file) => {
    validateGalleryFile(file);
    const uploadFile = file.type === 'application/pdf' ? file : await compressImageForUpload(file, { label: 'Gallery image' });
    const path = filePath('projects/gallery', uploadFile);
    const { error } = await supabase.storage.from(BUCKET).upload(path, uploadFile, { upsert: false });
    if (error) throw error;
    return path;
  });
  return Promise.all(uploads);
}

export async function deleteImages(paths) {
  const removable = (Array.isArray(paths) ? paths : [paths]).filter((path) => path && !path.startsWith('http'));
  if (removable.length === 0) return;
  await supabase.storage.from(BUCKET).remove(removable);
}
