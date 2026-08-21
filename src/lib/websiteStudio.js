import { supabase } from './supabaseClient.js';
import { brandAlignedWebsiteBundle } from './brandContent.js';

export const WEBSITE_CONTENT_EVENT = 'hevv-public-content-updated';
export const WEBSITE_CACHE_KEYS = ['hevv-public-content-cache-v3', 'hevv-public-content-cache-v2', 'hevv-public-content-cache'];

export const WEBSITE_STUDIO_SECTIONS = [
  { group: 'Website Studio', label: 'Overview', key: 'overview' },
  { group: 'Shared across the website', label: 'Branding', key: 'global.brand', fields: [
    ['brandName', 'Brand name', 'text'], ['tagline', 'Tagline', 'textarea'],
    ['headerLogoUrl', 'Navbar standalone logo', 'image'], ['headerLogoAlt', 'Navbar logo description', 'text'],
    ['footerLogoUrl', 'Footer full logo', 'image'], ['footerLogoAlt', 'Footer logo description', 'text'],
  ] },
  { group: 'Shared across the website', label: 'Navbar', key: 'global.navigation', fields: [
    ['homeLabel', 'Home label', 'text'], ['homeIcon', 'Home icon', 'icon'],
    ['discoverLabel', 'Discover label', 'text'], ['discoverIcon', 'Discover icon', 'icon'],
    ['creativesLabel', 'Creatives label', 'text'], ['creativesIcon', 'Creatives icon', 'icon'],
    ['inquiryLabel', 'Collaboration label', 'text'], ['inquiryIcon', 'Collaboration icon', 'icon'],
    ['showCreatives', 'Show Creatives', 'boolean'],
  ] },
  { group: 'Public pages', label: 'Feed', key: 'page.home', preview: '/', fields: [['heroEyebrow','Feed eyebrow','text'],['heroTitle','Feed heading','textarea'],['heroDescription','Feed introduction','textarea'],['workEyebrow','Work eyebrow','text'],['workTitle','Work heading','text'],['creativesEyebrow','Creatives eyebrow','text'],['creativesTitle','Creatives heading','text'],['creativesDescription','Creatives description','textarea']] },
  { group: 'Public pages', label: 'Discover', key: 'page.discover', preview: '/discover', fields: [['eyebrow','Page eyebrow','text'],['title','Page heading','text'],['description','Page description','textarea']] },
  { group: 'Public pages', label: 'About', key: 'page.about', preview: '/about', fields: [['eyebrow','Page eyebrow','text'],['title','Page heading','textarea'],['intro','Introduction','textarea'],['purposeEyebrow','Purpose eyebrow','text'],['purposeTitle','Purpose heading','text'],['journey','Purpose description','textarea'],['findEyebrow','Content overview eyebrow','text'],['findTitle','Content overview heading','text'],['workTitle','Current work card title','text'],['workDescription','Current work card description','textarea'],['portfolioTitle','Portfolio card title','text'],['portfolioDescription','Portfolio card description','textarea'],['creativesTitle','Creative profiles card title','text'],['creativesDescription','Creative profiles card description','textarea'],['inquiriesTitle','Open inquiries card title','text'],['inquiriesDescription','Open inquiries card description','textarea'],['collaborationEyebrow','Collaboration eyebrow','text'],['collaborationTitle','Collaboration heading','text'],['collaborationDescription','Collaboration description','textarea'],['collaborationNote','Collaboration clarification','textarea'],['directionEyebrow','Direction eyebrow','text'],['directionTitle','Direction heading','textarea'],['directionDescription','Direction description','textarea']] },
  { group: 'Public pages', label: 'Creatives', key: 'page.creatives', preview: '/creatives', fields: [['directoryEyebrow','Directory eyebrow','text'],['directoryTitle','Directory heading','text'],['directoryDescription','Directory description','textarea']] },
  { group: 'Public pages', label: 'Footer Contact & Inquiry', key: 'page.inquiries', preview: '/inquiry', fields: [['contactEmail','Contact email','email'],['facebookUrl','Facebook URL','url'],['instagramUrl','Instagram URL','url'],['linkedInUrl','LinkedIn URL','url'],['youTubeUrl','YouTube URL','url'],['tikTokUrl','TikTok URL','url'],['githubUrl','GitHub URL','url'],['landingEyebrow','Inquiry eyebrow','text'],['landingHeading','Inquiry heading','text'],['landingDescription','Inquiry description','textarea'],['disclaimer','Inquiry clarification','textarea'],['servicesEyebrow','Services eyebrow','text'],['servicesTitle','Services heading','text'],['servicesIntro','Services introduction','textarea'],['servicesBodyTitle','Services message heading','text'],['servicesBody','Services message','textarea'],['servicesDetailsTitle','Helpful details heading','text'],['servicesDetails','Helpful details, one per line','textarea'],['servicesCta','Services button label','text']] },
  { group: 'Public pages', label: 'Privacy Policy', key: 'page.privacy', preview: '/privacy', fields: [['eyebrow','Page eyebrow','text'],['title','Page heading','text'],['description','Page description','textarea'],['effectiveDate','Effective date','text'],['overviewTitle','Overview heading','text'],['overviewBody','Overview','textarea'],['informationTitle','Information heading','text'],['informationBody','Information we collect','textarea'],['mediaTitle','Public media heading','text'],['mediaBody','Public website media','textarea'],['useTitle','Use heading','text'],['useBody','How information is used','textarea'],['sharingTitle','Sharing heading','text'],['sharingBody','Sharing and providers','textarea'],['retentionTitle','Retention heading','text'],['retentionBody','Retention and deletion','textarea'],['securityTitle','Security heading','text'],['securityBody','Security and choices','textarea'],['updatesTitle','Policy updates heading','text'],['updatesBody','Policy updates','textarea'],['contactTitle','Privacy contact heading','text'],['contactBody','Privacy contact description','textarea']] },
  { group: 'Shared across the website', label: 'Colors', key: 'global.appearance', fields: [['primaryTextColor','Primary text','color'],['secondaryTextColor','Secondary text','color'],['mutedTextColor','Muted text','color'],['accentColor','Accent and buttons','color'],['dividerLineColor','Borders and dividers','color']] },
];

export const SERVICE_FIELDS = [
  ['name','Service name','text'],['shortDescription','Short description','textarea'],['fullDescription','Full description','textarea'],['status','Status','status'],['displayOrder','Display order','number'],['publicVisibility','Show publicly','boolean'],['inquiryAvailability','Available in inquiries','boolean'],['iconUrl','Icon URL','url'],['featured','Featured','boolean'],['seoTitle','Search title','text'],['seoDescription','Search description','textarea'],
];

const APPROVED_ROUTES = ['/', '/about', '/work', '/projects', '/services', '/creatives', '/inquiry'];
const unsafePattern = /<script|javascript\s*:|data\s*:\s*text\/html|on(?:error|load)\s*=/i;

export function safeWebsiteValue(value, type = 'text') {
  if (type === 'boolean') return value === true;
  if (type === 'number') return Number.isFinite(Number(value)) ? Number(value) : 0;
  const text = String(value ?? '').trim();
  if (unsafePattern.test(text)) throw new Error('Scripts and unsafe HTML are not allowed.');
  if (type === 'route' && text && !APPROVED_ROUTES.includes(text)) throw new Error('Choose an approved public route.');
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
  if (entryKey === 'global.brand') return ['Navbar logo', 'Footer logo', 'page wording', 'browser metadata', 'login'];
  if (entryKey === 'global.navigation') return ['Public header', 'mobile navigation'];
  if (entryKey === 'global.appearance') return ['All public pages', 'light mode', 'dark mode'];
  if (entryKey === 'page.inquiries') return ['Contact', 'inquiry page', 'Footer contact links'];
  if (entryKey === 'page.privacy') return ['Privacy Policy'];
  if (entryKey?.startsWith('service.')) return ['Legacy compatibility data'];
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
  const alignedBundle = brandAlignedWebsiteBundle(bundle);
  const brand = alignedBundle['global.brand'] || {};
  const footer = alignedBundle['global.footer'] || {};
  const appearance = alignedBundle['global.appearance'] || {};
  const resolveSharedText = (value) => {
    if (typeof value === 'string') return value.replaceAll('{{brandName}}', brand.brandName || '').replaceAll('Lahat Liwa Collectives', brand.brandName || 'Lahat Liwa Collectives');
    if (Array.isArray(value)) return value.map(resolveSharedText);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveSharedText(item)]));
    return value;
  };
  const pages = Object.fromEntries(Object.entries(alignedBundle).filter(([key]) => key.startsWith('page.')).map(([key, value]) => [key.slice(5), resolveSharedText(value)]));
  const branches = Object.entries(alignedBundle).filter(([key]) => key.startsWith('branch.')).map(([, value]) => value).filter((item) => item?.status !== 'inactive').sort((a,b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
  const services = Object.entries(alignedBundle).filter(([key]) => key.startsWith('service.')).map(([, value]) => value).filter((item) => item?.status !== 'inactive').sort((a,b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0));
  const search = pages.search || {};
  const contact = pages.inquiries || {};
  const socialLinks = [['Facebook',contact.facebookUrl || search.facebookUrl],['Instagram',contact.instagramUrl || search.instagramUrl],['LinkedIn',contact.linkedInUrl || search.linkedInUrl],['YouTube',contact.youTubeUrl || search.youTubeUrl],['TikTok',contact.tikTokUrl || search.tikTokUrl],['GitHub',contact.githubUrl || search.githubUrl]].filter(([,href]) => href).map(([label,href]) => ({ label, href }));
  const navigation = alignedBundle['global.navigation'] || {};
  return {
    displayName: brand.brandName || '', legalName: brand.brandName || '', branchName: brand.branchName || 'Liwa Digital', tagline: brand.tagline || '',
    logoUrl: brand.headerLogoUrl || brand.logoUrl || '', logoAlt: brand.headerLogoAlt || brand.logoAlt || '',
    headerLogoUrl: brand.headerLogoUrl || brand.logoUrl || '', headerLogoAlt: brand.headerLogoAlt || brand.logoAlt || '',
    footerLogoUrl: brand.footerLogoUrl || brand.logoUrl || '', footerLogoAlt: brand.footerLogoAlt || brand.logoAlt || '',
    heroImageUrl: brand.heroImageUrl || '', heroImageAlt: brand.heroImageAlt || '', email: contact.contactEmail || brand.contactEmail || '',
    footerText: footer.footerText || '', footerContextLabel: footer.contextLabel || '', privacyLabel: navigation.privacyLabel || footer.privacyLabel || 'Privacy Policy',
    primaryTextColor: appearance.primaryTextColor || '', secondaryTextColor: appearance.secondaryTextColor || '', mutedTextColor: appearance.mutedTextColor || '', accentColor: appearance.accentColor || '', dividerLineColor: appearance.dividerLineColor || '',
    ...(socialLinks.length ? { socialLinks } : {}),
    websiteNavigation: navigation, websitePages: pages, websiteBranches: branches, websiteServices: services, websiteBundle: alignedBundle,
  };
}

export function branchesFromWebsiteContent(content = {}) {
  return (content.websiteBranches || []).map((branch) => ({ ...branch, slug: branch.key, label: branch.name, description: branch.longDescription || branch.shortDescription, is_published: branch.status !== 'inactive', included_services: (content.websiteServices || []).filter((service) => service.branchKey === branch.key && service.publicVisibility !== false && service.status !== 'inactive') }));
}

export function servicesFromWebsiteContent(content = {}, branchKey = '', { inquiryOnly = false } = {}) {
  return (content.websiteServices || []).filter((service) => service.branchKey === branchKey && service.status !== 'inactive' && service.publicVisibility !== false && (!inquiryOnly || service.inquiryAvailability !== false));
}
