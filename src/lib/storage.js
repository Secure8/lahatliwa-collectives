import { supabase } from './supabaseClient';

const BUCKET = 'project-media';

function filePath(prefix, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  return `${prefix}/${crypto.randomUUID()}-${safeName}`;
}

export function getPublicImageUrl(path) {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadCoverImage(file) {
  if (!file) return '';
  // Create the project-media bucket in Supabase Storage before using uploads.
  const path = filePath('projects/covers', file);
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export async function uploadGalleryImages(files) {
  if (!files || files.length === 0) return [];
  const uploads = Array.from(files).map(async (file) => {
    const path = filePath('projects/gallery', file);
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
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
