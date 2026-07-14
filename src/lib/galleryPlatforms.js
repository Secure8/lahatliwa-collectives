export function detectGalleryPlatform(url = '') {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return { type: 'external_link', platform: 'External Link', label: 'External Link', actionLabel: 'Open Link' };
  }

  if (host.includes('youtube.com') || host.includes('youtu.be')) {
    return { type: 'youtube', platform: 'YouTube', label: 'YouTube', actionLabel: 'Watch Video' };
  }
  if (host.includes('facebook.com') || host.includes('fb.watch')) {
    return { type: 'facebook', platform: 'Facebook', label: 'Facebook', actionLabel: 'View Post' };
  }
  if (host.includes('instagram.com')) {
    return { type: 'instagram', platform: 'Instagram', label: 'Instagram', actionLabel: 'View Post' };
  }
  if (host.includes('tiktok.com')) {
    return { type: 'tiktok', platform: 'TikTok', label: 'TikTok', actionLabel: 'View Post' };
  }
  return { type: 'website', platform: 'Website', label: 'Website', actionLabel: 'Open Link' };
}
