import { commitManagedMediaReplacement, requestManagedMediaDeletion, uploadManagedWebsiteImage } from './r2Media.js';

export async function uploadProfileWebsiteMedia(file, { creativeMemberId, kind, userId, onStatus } = {}) {
  const category = kind === 'cover' ? 'profile_cover' : 'profile_photo';
  const managed = await uploadManagedWebsiteImage(file, { category, creativeMemberId, onStatus });
  return { url: managed.primaryUrl, managedMedia: managed, provider: 'managed_media' };
}

export function cleanupReplacedProfileWebsiteMedia(oldUrl, newUrl = '') {
  return newUrl ? commitManagedMediaReplacement(newUrl, oldUrl) : requestManagedMediaDeletion(oldUrl);
}
