import { safeExternalUrl } from './externalUrls.js';
import { detectGalleryPlatform } from './galleryPlatforms.js';

const projectExternalFields = [
  ['video_url', 'video'],
  ['social_post_url', 'post'],
  ['live_url', 'project'],
  ['github_url', 'project'],
];

export function getProjectExternalLinks(project = {}) {
  const galleryLinks = (Array.isArray(project.gallery_items) ? project.gallery_items : [])
    .filter((item) => !['image', 'pdf'].includes(item?.type));
  const attachedLinks = projectExternalFields.map(([field, kind]) => ({ url: project[field], kind }));
  const seen = new Set();

  return [...galleryLinks, ...attachedLinks].flatMap((item) => {
    const url = safeExternalUrl(item?.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    const detected = detectGalleryPlatform(url);
    const type = !item.type || item.type === 'external_link' ? detected.type : item.type;
    const platform = !item.platform || item.platform === 'External Link' ? detected.platform : item.platform;
    return [{
      ...item,
      url,
      type,
      platform,
    }];
  });
}

export function getSingleProjectExternalLink(project = {}) {
  const links = getProjectExternalLinks(project);
  return links.length === 1 ? links[0] : null;
}

export function projectExternalLinkLabel(item = {}) {
  const platform = item.platform || detectGalleryPlatform(item.url).platform;
  if (item.type === 'youtube' || item.kind === 'video') return platform === 'Website' ? 'Open project video' : `Open project video on ${platform}`;
  if (['facebook', 'instagram', 'tiktok'].includes(item.type) || item.kind === 'post') return platform === 'Website' ? 'Open project post' : `Open project post on ${platform}`;
  return 'Open external project';
}

export function projectExternalLinkText(item = {}) {
  const platform = item.platform || detectGalleryPlatform(item.url).platform;
  return platform && !['Website', 'External Link'].includes(platform) ? `Open on ${platform}` : 'Open external project';
}
