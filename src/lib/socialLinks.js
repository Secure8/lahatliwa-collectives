import { safeExternalUrl } from './externalUrls.js';

const platformMatchers = [
  ['facebook', /(^|\.)facebook\.com$/],
  ['instagram', /(^|\.)instagram\.com$/],
  ['linkedin', /(^|\.)linkedin\.com$/],
  ['youtube', /(^|\.)youtube\.com$|(^|\.)youtu\.be$/],
  ['twitter', /(^|\.)(twitter\.com|x\.com)$/],
  ['github', /(^|\.)github\.com$/],
  ['dribbble', /(^|\.)dribbble\.com$/],
  ['tiktok', /(^|\.)tiktok\.com$/],
];

export function socialLinkMeta(link = {}) {
  const suppliedLabel = String(link.label || '').trim();
  let href = String(link.href || '').trim();
  if (/^https?$/i.test(suppliedLabel) && /^\/\//.test(href)) href = `${suppliedLabel}:${href.replace(/\s+/g, '')}`;
  if (/^www\./i.test(href)) href = `https://${href}`;
  href = safeExternalUrl(href, { allowMailto: true });
  if (!href) return { platform: 'website', label: suppliedLabel || 'Website', href: '' };
  if (href.startsWith('mailto:')) return { platform: 'email', label: suppliedLabel || 'Email', href };

  let platform = 'website';
  try {
    const host = new URL(href).hostname.toLowerCase();
    platform = platformMatchers.find(([, matcher]) => matcher.test(host))?.[0] || platform;
  } catch {
  }

  const defaultLabel = {
    facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube',
    twitter: 'X / Twitter', github: 'GitHub', dribbble: 'Dribbble', tiktok: 'TikTok', website: 'Website',
  }[platform];
  const label = /^(link|https?|http)$/i.test(suppliedLabel) || !suppliedLabel ? defaultLabel : suppliedLabel;
  return { platform, label, href };
}

export function socialLinksFromText(value = '') {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (/^(https?:\/\/|mailto:)/i.test(line)) return { label: '', href: line };
      const legacyUrl = line.match(/^(https?):\s*(\/\/\S+)$/i);
      if (legacyUrl) return { label: '', href: `${legacyUrl[1]}:${legacyUrl[2]}` };
      const separator = line.indexOf(':');
      if (separator < 1) return { label: '', href: line };
      return { label: line.slice(0, separator).trim(), href: line.slice(separator + 1).trim() };
    })
    .filter((link) => link.href);
}
