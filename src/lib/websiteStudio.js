import { supabase } from './supabaseClient.js';

export const WEBSITE_CONTENT_EVENT = 'hevv-public-content-updated';
export const WEBSITE_CACHE_KEYS = ['hevv-public-content-cache-v3', 'hevv-public-content-cache-v2', 'hevv-public-content-cache'];

export const WEBSITE_STUDIO_SECTIONS = [
  { group: 'Website', label: 'Overview', key: 'overview' },
  { group: 'Shared content', label: 'Brand', key: 'global.brand', fields: [
    ['brandName', 'Brand name', 'text'], ['branchName', 'Website branch', 'text'], ['tagline', 'Tagline', 'textarea'], ['logoUrl', 'Main logo URL', 'url'], ['logoAlt', 'Logo description', 'text'], ['contactEmail', 'Contact email', 'email'], ['heroImageUrl', 'Creative hero portrait URL', 'url'], ['heroImageAlt', 'Creative hero portrait description', 'text'],
  ] },
  { group: 'Shared content', label: 'Navigation', key: 'global.navigation', fields: [
    ['homeLabel', 'Home label', 'text'], ['aboutLabel', 'About label', 'text'], ['projectsLabel', 'Projects label', 'text'], ['servicesLabel', 'Services label', 'text'], ['creativesLabel', 'Creatives label', 'text'], ['contactLabel', 'Contact label', 'text'], ['showAbout', 'Show About', 'boolean'], ['showProjects', 'Show Projects', 'boolean'], ['showServices', 'Show Services', 'boolean'], ['showCreatives', 'Show Creatives', 'boolean'], ['showContact', 'Show Contact', 'boolean'],
  ] },
  { group: 'Pages', label: 'Homepage', key: 'page.home', preview: '/', fields: [['featuredEyebrow','Featured creatives eyebrow','text'],['featuredTitle','Featured creatives heading','text'],['featuredDescription','Featured creatives description','textarea'],['featuredCtaLabel','Featured creatives action','text'],['inquiryEyebrow','Inquiry eyebrow','text'],['inquiryTitle','Inquiry heading','text'],['inquiryDescription','Inquiry description','textarea'],['inquiryCtaLabel','Inquiry action','text'],['inquiryCtaUrl','Inquiry action route','route']] },
  { group: 'Pages', label: 'Explore Aklan', key: 'page.explore', preview: '/explore', fields: [['eyebrow','Eyebrow','text'],['title','Heading','text'],['description','Description','textarea']] },
  { group: 'Pages', label: 'Creatives', key: 'page.creatives', preview: '/creatives', fields: [['heroEyebrow','Hero eyebrow','text'],['heroTitle','Hero title','text'],['heroDescription','Hero description','textarea'],['primaryCta','Primary action','text'],['primaryCtaUrl','Primary action route','route'],['secondaryCta','Secondary action','text'],['secondaryCtaUrl','Secondary action route','route'],['directoryEyebrow','Directory eyebrow','text'],['directoryTitle','Directory heading','text'],['directoryDescription','Directory description','textarea']] },
  { group: 'Pages', label: 'Projects', key: 'page.projects', preview: '/projects', fields: [['eyebrow','Eyebrow','text'],['title','Heading','text'],['description','Description','textarea']] },
  { group: 'Pages', label: 'Services', key: 'page.services', preview: '/services', fields: [['title','Heading','text'],['intro','Introduction','textarea']] },
  { group: 'Pages', label: 'About', key: 'page.about', preview: '/about' },
  { group: 'Pages', label: 'Inquiries', key: 'page.inquiries', preview: '/contact', fields: [['heading','Contact heading','text'],['description','Contact description','textarea'],['ctaText','Email action','text'],['landingEyebrow','Inquiry eyebrow','text'],['landingHeading','Inquiry heading','text'],['landingDescription','Inquiry description','textarea'],['disclaimer','Public clarification','textarea']] },
  { group: 'Shared content', label: 'Footer', key: 'global.footer', fields: [['contextLabel','Branch context','text'],['footerText','Footer description','textarea'],['privacyLabel','Privacy link label','text']] },
  { group: 'Shared content', label: 'Search and social sharing', key: 'page.search', fields: [['defaultTitle','Default search title','text'],['defaultDescription','Default search description','textarea'],['openGraphImageUrl','Social sharing image URL','url'],['facebookUrl','Facebook URL','url'],['instagramUrl','Instagram URL','url'],['linkedInUrl','LinkedIn URL','url'],['youTubeUrl','YouTube URL','url'],['tikTokUrl','TikTok URL','url'],['githubUrl','GitHub URL','url']] },
  { group: 'Appearance', label: 'Colors and appearance', key: 'global.appearance', fields: [['primaryTextColor','Primary text','color'],['secondaryTextColor','Secondary text','color'],['mutedTextColor','Muted text','color'],['accentColor','Accent','color'],['dividerLineColor','Borders and dividers','color']] },
  { group: 'Assets and history', label: 'Media', key: 'media' },
  { group: 'Assets and history', label: 'Revisions', key: 'revisions' },
];

export const BRANCH_FIELDS = [
  ['name','Public name','text'],['shortDescription','Short description','textarea'],['longDescription','Full description','textarea'],['status','Status','status'],['iconUrl','Icon URL','url'],['displayOrder','Display order','number'],['seoTitle','Search title','text'],['seoDescription','Search description','textarea'],
];

export const SERVICE_FIELDS = [
  ['name','Service name','text'],['shortDescription','Short description','textarea'],['fullDescription','Full description','textarea'],['status','Status','status'],['displayOrder','Display order','number'],['publicVisibility','Show publicly','boolean'],['inquiryAvailability','Available in inquiries','boolean'],['iconUrl','Icon URL','url'],['featured','Featured','boolean'],['seoTitle','Search title','text'],['seoDescription','Search description','textarea'],
];

const APPROVED_ROUTES = ['/', '/about', '/projects', '/services', '/creatives', '/contact', '/explore', '/journal', '/events', '/places', '/activities', '/local-products', '/inquiry'];
const unsafePattern = /<script|javascript\s*:|data\s*:\s*text\/html|on(?:error|load)\s*=/i;

export function safeWebsiteValue(value, type = 'text') {
  if (type === 'boolean') return value === true;
  if (type === 'number') return Number.isFinite(Number(value)) ? Number(value) : 0;
  const text = String(value ?? '').trim();
  if (unsafePattern.test(text)) throw new Error('Scripts and unsafe HTML are not allowed.');
  if (type === 'route' && text && !APPROVED_ROUTES.includes(text) && !/^\/services\/(studio|tech|digital|social)$/.test(text)) throw new Error('Choose an approved public route.');
  if (type === 'url' && text && !/^(https:\/\/|\/)[^\s]+$/i.test(text)) throw new Error('Use an HTTPS URL or a public site path.');
  if (type === 'email' && text && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error('Enter a valid email address.');
  if (type === 'color' && text && !/^#[0-9a-f]{6}$/i.test(text)) throw new Error('Use a six-digit color value.');
  return text.slice(0, type === 'textarea' ? 4000 : 500);
}

export function liveWebsiteFieldValue(value, type = 'text') {
  if (type === 'boolean') return value === true;
  if (type === 'number') return Number.isFinite(Number(value)) ? Number(value) : 0;
  return String(value ?? '').slice(0, type === 'textarea' ? 4000 : 500);
}

export function validateWebsiteEntry(data, fields = []) {
  const next = { ...data };
  for (const [key, _label, type] of fields) next[key] = safeWebsiteValue(next[key], type);
  if (next.primaryTextColor && contrastRatio(next.primaryTextColor, '#0b0b0d') < 4.5) throw new Error('Primary text needs stronger contrast against the public background.');
  if (next.secondaryTextColor && contrastRatio(next.secondaryTextColor, '#0b0b0d') < 3) throw new Error('Secondary text needs stronger contrast against the public background.');
  return next;
}

function luminance(hex = '#000000') {
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => parseInt(value, 16) / 255) || [0,0,0];
  const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastRatio(first, second) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a,b) => b-a);
  return (light + 0.05) / (dark + 0.05);
}

export function resolveWebsiteOverride(sharedValue, overrideValue) {
  return overrideValue === null || overrideValue === undefined || overrideValue === '' ? sharedValue : overrideValue;
}

export function websiteImpact(entryKey) {
  if (entryKey === 'global.brand') return ['Header', 'Footer', 'browser metadata', 'Creatives hero', 'About', 'inquiries', 'login'];
  if (entryKey === 'global.navigation') return ['Public header', 'mobile navigation'];
  if (entryKey === 'global.appearance') return ['All public pages', 'light mode', 'dark mode'];
  if (entryKey?.startsWith('branch.')) return ['Services page', 'inquiry choices', 'branch details', 'admin filters'];
  if (entryKey?.startsWith('service.')) return ['Services page', 'inquiry choices', 'contextual inquiry links', 'branch details'];
  return [WEBSITE_STUDIO_SECTIONS.find((item) => item.key === entryKey)?.label || 'Public website'];
}

export function websiteEntryState(entry) {
  if (!entry) return 'Failed';
  return entry.draft_data ? 'Unpublished changes' : 'Published';
}

export async function fetchWebsiteStudioEntries() {
  const { data, error } = await supabase.from('website_studio_entries').select('*').order('entry_type').order('entry_key');
  if (error) throw error;
  return data || [];
}

export async function fetchWebsiteStudioRevisions(entryKey = '') {
  let query = supabase.from('website_studio_revisions').select('*').order('created_at', { ascending: false }).limit(100);
  if (entryKey) query = query.eq('entry_key', entryKey);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function saveWebsiteDraft(entryKey, data) {
  const { data: row, error } = await supabase.rpc('save_website_studio_draft', { p_entry_key: entryKey, p_data: data });
  if (error) throw error;
  if (!row?.entry_key) throw new Error('The draft could not be confirmed after saving.');
  return row;
}

export async function publishWebsiteEntry(entryKey) {
  const { data: row, error } = await supabase.rpc('publish_website_studio_entry', { p_entry_key: entryKey });
  if (error) throw error;
  if (!row?.entry_key || row.draft_data) throw new Error('The published value could not be confirmed.');
  announceWebsitePublished();
  return row;
}

export async function discardWebsiteDraft(entryKey) {
  const { data: row, error } = await supabase.rpc('discard_website_studio_draft', { p_entry_key: entryKey });
  if (error) throw error;
  return row;
}

export async function restoreWebsiteRevision(revisionId) {
  const { data: row, error } = await supabase.rpc('restore_website_studio_revision', { p_revision_id: revisionId });
  if (error) throw error;
  announceWebsitePublished();
  return row;
}

export async function fetchPublicWebsiteStudio() {
  const { data, error } = await supabase.rpc('get_public_website_studio');
  if (error) throw error;
  return data && typeof data === 'object' ? data : {};
}

export function announceWebsitePublished() {
  if (typeof window === 'undefined') return;
  for (const key of WEBSITE_CACHE_KEYS) window.localStorage.removeItem(key);
  window.dispatchEvent(new CustomEvent(WEBSITE_CONTENT_EVENT, { detail: { reload: true, publishedAt: Date.now() } }));
}

export function websiteBundleToContent(bundle = {}) {
  const brand = bundle['global.brand'] || {};
  const footer = bundle['global.footer'] || {};
  const appearance = bundle['global.appearance'] || {};
  const pages = Object.fromEntries(Object.entries(bundle).filter(([key]) => key.startsWith('page.')).map(([key, value]) => [key.slice(5), value]));
  const branches = Object.entries(bundle).filter(([key]) => key.startsWith('branch.')).map(([, value]) => value).filter((item) => item?.status !== 'inactive').sort((a,b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
  const services = Object.entries(bundle).filter(([key]) => key.startsWith('service.')).map(([, value]) => value).filter((item) => item?.status !== 'inactive').sort((a,b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
  const search = pages.search || {};
  const socialLinks = [['Facebook',search.facebookUrl],['Instagram',search.instagramUrl],['LinkedIn',search.linkedInUrl],['YouTube',search.youTubeUrl],['TikTok',search.tikTokUrl],['GitHub',search.githubUrl]].filter(([,href]) => href).map(([label,href]) => ({ label, href }));
  return {
    displayName: brand.brandName || '', legalName: brand.brandName || '', branchName: brand.branchName || 'Liwa Digital', tagline: brand.tagline || '', logoUrl: brand.logoUrl || '', logoAlt: brand.logoAlt || '', heroImageUrl: brand.heroImageUrl || '', heroImageAlt: brand.heroImageAlt || '', email: brand.contactEmail || '',
    footerText: footer.footerText || '', footerContextLabel: footer.contextLabel || '', privacyLabel: footer.privacyLabel || 'Privacy Policy',
    primaryTextColor: appearance.primaryTextColor || '', secondaryTextColor: appearance.secondaryTextColor || '', mutedTextColor: appearance.mutedTextColor || '', accentColor: appearance.accentColor || '', dividerLineColor: appearance.dividerLineColor || '',
    ...(socialLinks.length ? { socialLinks } : {}),
    websiteNavigation: bundle['global.navigation'] || {}, websitePages: pages, websiteBranches: branches, websiteServices: services, websiteBundle: bundle,
  };
}

export function branchesFromWebsiteContent(content = {}) {
  return (content.websiteBranches || []).map((branch) => ({ ...branch, slug: branch.key, label: branch.name, description: branch.longDescription || branch.shortDescription, is_published: branch.status !== 'inactive', included_services: (content.websiteServices || []).filter((service) => service.branchKey === branch.key && service.publicVisibility !== false && service.status !== 'inactive') }));
}

export function servicesFromWebsiteContent(content = {}, branchKey = '', { inquiryOnly = false } = {}) {
  return (content.websiteServices || []).filter((service) => service.branchKey === branchKey && service.status !== 'inactive' && service.publicVisibility !== false && (!inquiryOnly || service.inquiryAvailability !== false));
}
