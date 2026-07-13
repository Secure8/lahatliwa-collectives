import { safeExternalUrl } from './externalUrls.js';

const PREFIX = 'tool:';
const knownNames = { canva: 'Canva', figma: 'Figma', adobe: 'Adobe', github: 'GitHub', notion: 'Notion', slack: 'Slack', trello: 'Trello', capcut: 'CapCut', blender: 'Blender', wordpress: 'WordPress' };

export function isResourceLink(link) { return String(link?.label || '').toLowerCase().startsWith(PREFIX); }
export function resourceName(link) {
  const explicit = String(link?.label || '').slice(PREFIX.length).trim();
  if (explicit) return explicit;
  try { const host = new URL(safeExternalUrl(link?.href) || '').hostname.toLowerCase(); return Object.entries(knownNames).find(([key]) => host.includes(key))?.[1] || host.replace(/^www\./, '').split('.')[0] || 'Resource'; } catch { return 'Resource'; }
}
export function resourceLink(name = '', href = '') { return { label: `${PREFIX}${String(name).trim()}`, href: String(href).trim() }; }
export function resourceMeta(link) {
  const href = safeExternalUrl(link?.href);
  if (!href) return { name: resourceName(link), href: '', icon: '' };
  const url = new URL(href);
  return { name: resourceName(link), href, icon: `${url.origin}/favicon.ico` };
}
