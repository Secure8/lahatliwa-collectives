import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import { defaultPageContent, defaultSiteContent } from '../data/siteContent';
import { optimizeImageForUpload } from './imageCompression';
import { supabase } from './supabaseClient';
import { validateUploadFile } from './uploadLimits';
import { collectReferencedStoragePaths, normalizeStoragePath } from './projectMediaCleanup';
import { cachedContentMatchesScope, publicContentScope } from './publicContentScope';
import { safeExternalUrl } from './externalUrls';

const SETTINGS_TABLE = 'site_settings';
const CONTENT_TABLE = 'page_content';
const MEDIA_TABLE = 'media_assets';
const BUCKET = 'project-media';
const UPLOAD_OPTIONS = { upsert: false, cacheControl: '31536000' };
const PUBLIC_CONTENT_CACHE_KEY = 'hevv-public-content-cache-v3';
const LEGACY_PUBLIC_CONTENT_CACHE_KEYS = ['hevv-public-content-cache', 'hevv-public-content-cache-v2'];
const PUBLIC_CONTENT_UPDATED_EVENT = 'hevv-public-content-updated';
const ALL_PAGE_KEYS = ['home', 'about', 'services', 'contact'];
const PUBLIC_CONTENT_MEMORY_TTL = 60 * 1000;
const PublicContentContext = createContext(null);
const OPTIONAL_SETTINGS_COLUMNS = new Set(['divider_line_color', 'show_hero_portrait']);
const memoryPublicContentByScope = new Map();
const publicContentRequests = new Map();

function validateFile(file, { allowedTypes, label }) {
  if (!file) return;
  if (allowedTypes?.length && !allowedTypes.includes(file.type)) {
    throw new Error(`${label} file type is not supported.`);
  }
}

function normalizeExternalUrl(url = '') {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return safeExternalUrl(trimmed, { allowMailto: true }) || safeExternalUrl(`https://${trimmed}`, { allowMailto: true });
}

function toNullableString(value) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export function resolvePublicAssetUrl(url = '') {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  if (/^(https?:)?\/\//i.test(trimmed) || /^(data|blob):/i.test(trimmed) || trimmed.startsWith('/')) return trimmed;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(trimmed);
  return data?.publicUrl || trimmed;
}

function mapSettingsRow(row) {
  if (!row) return {};
  return {
    settingsId: row.id,
    displayName: row.brand_name || defaultSiteContent.displayName,
    legalName: row.personal_name || defaultSiteContent.legalName,
    tagline: row.tagline || defaultSiteContent.tagline,
    logoUrl: resolvePublicAssetUrl(row.logo_url),
    logoAlt: row.logo_alt || defaultSiteContent.logoAlt,
    heroImageUrl: resolvePublicAssetUrl(row.hero_image_url),
    heroImageAlt: row.hero_image_alt || defaultSiteContent.heroImageAlt,
    showHeroPortrait: row.show_hero_portrait ?? defaultSiteContent.showHeroPortrait,
    email: row.contact_email || defaultSiteContent.email,
    footerText: row.footer_text || defaultSiteContent.footerText,
    primaryTextColor: row.primary_text_color || defaultSiteContent.primaryTextColor,
    secondaryTextColor: row.secondary_text_color || defaultSiteContent.secondaryTextColor,
    mutedTextColor: row.muted_text_color || defaultSiteContent.mutedTextColor,
    accentColor: row.accent_color || defaultSiteContent.accentColor,
    dividerLineColor: row.divider_line_color || defaultSiteContent.dividerLineColor,
    defaultBackgroundImageUrl: resolvePublicAssetUrl(row.default_background_image_url),
    defaultBackgroundOverlayOpacity: row.default_background_overlay_opacity ?? defaultSiteContent.defaultBackgroundOverlayOpacity,
    socialLinks: [
      { label: 'GitHub', href: normalizeExternalUrl(row.github_url || '') },
      { label: 'Facebook', href: normalizeExternalUrl(row.facebook_url || '') },
      { label: 'Instagram', href: normalizeExternalUrl(row.instagram_url || '') },
      { label: 'LinkedIn', href: normalizeExternalUrl(row.linkedin_url || '') },
      { label: 'YouTube', href: normalizeExternalUrl(row.youtube_url || '') },
      { label: 'TikTok', href: normalizeExternalUrl(row.tiktok_url || '') },
    ].filter((link) => link.href),
  };
}

export function settingsFormFromRow(row) {
  if (!row) return {};
  return {
    settingsId: row.id,
    displayName: row.brand_name || defaultSiteContent.displayName,
    legalName: row.personal_name || defaultSiteContent.legalName,
    tagline: row.tagline ?? defaultSiteContent.tagline,
    logoUrl: row.logo_url ?? null,
    logoAlt: row.logo_alt || defaultSiteContent.logoAlt,
    heroImageUrl: row.hero_image_url ?? null,
    heroImageAlt: row.hero_image_alt || defaultSiteContent.heroImageAlt,
    showHeroPortrait: row.show_hero_portrait ?? defaultSiteContent.showHeroPortrait,
    email: row.contact_email ?? defaultSiteContent.email,
    footerText: row.footer_text ?? defaultSiteContent.footerText,
    primaryTextColor: row.primary_text_color ?? defaultSiteContent.primaryTextColor,
    secondaryTextColor: row.secondary_text_color ?? defaultSiteContent.secondaryTextColor,
    mutedTextColor: row.muted_text_color ?? defaultSiteContent.mutedTextColor,
    accentColor: row.accent_color ?? defaultSiteContent.accentColor,
    dividerLineColor: row.divider_line_color ?? defaultSiteContent.dividerLineColor,
    defaultBackgroundImageUrl: row.default_background_image_url ?? null,
    defaultBackgroundOverlayOpacity: row.default_background_overlay_opacity ?? defaultSiteContent.defaultBackgroundOverlayOpacity,
    githubUrl: row.github_url ?? '',
    facebookUrl: row.facebook_url ?? '',
    instagramUrl: row.instagram_url ?? '',
    linkedinUrl: row.linkedin_url ?? '',
    youtubeUrl: row.youtube_url ?? '',
    tiktokUrl: row.tiktok_url ?? '',
  };
}

export function mapSettingsToPayload(settings) {
  return {
    brand_name: toNullableString(settings.displayName) || defaultSiteContent.displayName,
    personal_name: toNullableString(settings.legalName) || defaultSiteContent.legalName,
    tagline: toNullableString(settings.tagline),
    logo_url: toNullableString(settings.logoUrl),
    logo_alt: toNullableString(settings.logoAlt),
    hero_image_url: toNullableString(settings.heroImageUrl),
    hero_image_alt: toNullableString(settings.heroImageAlt),
    show_hero_portrait: settings.showHeroPortrait === true,
    contact_email: toNullableString(settings.email),
    github_url: toNullableString(normalizeExternalUrl(settings.githubUrl || '')),
    facebook_url: toNullableString(normalizeExternalUrl(settings.facebookUrl || '')),
    instagram_url: toNullableString(normalizeExternalUrl(settings.instagramUrl || '')),
    linkedin_url: toNullableString(normalizeExternalUrl(settings.linkedinUrl || '')),
    youtube_url: toNullableString(normalizeExternalUrl(settings.youtubeUrl || '')),
    tiktok_url: toNullableString(normalizeExternalUrl(settings.tiktokUrl || '')),
    footer_text: toNullableString(settings.footerText),
    primary_text_color: toNullableString(settings.primaryTextColor),
    secondary_text_color: toNullableString(settings.secondaryTextColor),
    muted_text_color: toNullableString(settings.mutedTextColor),
    accent_color: toNullableString(settings.accentColor),
    divider_line_color: toNullableString(settings.dividerLineColor),
    default_background_image_url: toNullableString(settings.defaultBackgroundImageUrl),
    default_background_overlay_opacity: Number(settings.defaultBackgroundOverlayOpacity ?? defaultSiteContent.defaultBackgroundOverlayOpacity),
    updated_at: new Date().toISOString(),
  };
}

export function settingsFromSiteContent(content) {
  const social = Object.fromEntries((content.socialLinks || []).map((link) => [link.label.toLowerCase(), link.href]));
  return {
    settingsId: content.settingsId || '',
    displayName: content.displayName,
    legalName: content.legalName,
    tagline: content.tagline,
    logoUrl: content.logoUrl,
    logoAlt: content.logoAlt,
    heroImageUrl: content.heroImageUrl,
    heroImageAlt: content.heroImageAlt,
    showHeroPortrait: content.showHeroPortrait === true,
    email: content.email,
    githubUrl: social.github || '',
    facebookUrl: social.facebook || '',
    instagramUrl: social.instagram || '',
    linkedinUrl: social.linkedin || '',
    youtubeUrl: social.youtube || '',
    tiktokUrl: social.tiktok || '',
    footerText: content.footerText,
    primaryTextColor: content.primaryTextColor,
    secondaryTextColor: content.secondaryTextColor,
    mutedTextColor: content.mutedTextColor,
    accentColor: content.accentColor,
    dividerLineColor: content.dividerLineColor,
    defaultBackgroundImageUrl: content.defaultBackgroundImageUrl,
    defaultBackgroundOverlayOpacity: content.defaultBackgroundOverlayOpacity,
  };
}

async function fetchCanonicalSiteSettingsRow() {
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchSiteSettings() {
  const row = await fetchCanonicalSiteSettingsRow();
  return mapSettingsRow(row);
}

function missingSchemaColumn(error) {
  const match = error?.message?.match(/Could not find the '([^']+)' column/);
  return match?.[1] || '';
}

async function saveSettingsPayload(settings, payload) {
  const skippedColumns = [];
  let nextPayload = { ...payload };
  let targetId = settings.settingsId || null;

  if (!targetId) {
    const existingRow = await fetchCanonicalSiteSettingsRow();
    targetId = existingRow?.id || null;
  }

  for (let attempt = 0; attempt < OPTIONAL_SETTINGS_COLUMNS.size + 1; attempt += 1) {
    const query = targetId
      ? supabase.from(SETTINGS_TABLE).update(nextPayload).eq('id', targetId).select('*').single()
      : supabase.from(SETTINGS_TABLE).insert(nextPayload).select('*').single();

    const { data, error } = await query;
    if (!error) {
      if (!data?.id) throw new Error('The saved settings could not be refreshed.');
      return { row: data, skippedColumns };
    }

    const column = missingSchemaColumn(error);
    if (!OPTIONAL_SETTINGS_COLUMNS.has(column) || !(column in nextPayload)) throw error;

    skippedColumns.push(column);
    const { [column]: _removed, ...payloadWithoutColumn } = nextPayload;
    nextPayload = payloadWithoutColumn;
  }

  throw new Error('The saved settings could not be refreshed.');
}

export async function updateSiteSettings(settings) {
  const payload = mapSettingsToPayload(settings);
  const { row, skippedColumns } = await saveSettingsPayload(settings, payload);
  const mappedSettings = mapSettingsRow(row);
  syncPublicContentCache(mappedSettings);
  return { row, settings: mappedSettings, skippedColumns };
}

export async function fetchPageContent(pageKey) {
  const { data, error } = await supabase.from(CONTENT_TABLE).select('*').eq('page_key', pageKey).maybeSingle();
  if (error) throw error;
  return data?.content || null;
}

export async function updatePageContent(pageKey, content) {
  const payload = { page_key: pageKey, content, updated_at: new Date().toISOString() };
  const { data: existing, error: fetchError } = await supabase.from(CONTENT_TABLE).select('id').eq('page_key', pageKey).maybeSingle();
  if (fetchError) throw fetchError;
  const query = existing
    ? supabase.from(CONTENT_TABLE).update(payload).eq('id', existing.id)
    : supabase.from(CONTENT_TABLE).insert(payload);
  const { error } = await query;
  if (error) throw error;
  clearCachedPublicContent();
}

export async function uploadSiteAsset(file, folder = 'site', limitKey = 'siteImage', { onStatus } = {}) {
  if (!file) return '';
  validateFile(file, {
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
    label: 'Image',
  });
  validateUploadFile(file, limitKey);
  const prepared = await optimizeImageForUpload(file, limitKey, { label: 'Image', onStatus });
  onStatus?.({ phase: 'uploading', ...prepared });
  const uploadFile = prepared.file;
  const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  const path = `${folder}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, uploadFile, UPLOAD_OPTIONS);
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function createMediaAsset({ name, type = 'icon', category = '', url, storagePath = '', altText = '' }) {
  const payload = {
    name,
    type,
    category: category || null,
    url,
    storage_path: storagePath || null,
    alt_text: altText || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from(MEDIA_TABLE).insert(payload).select('*').single();
  if (error) throw error;
  return data;
}

export async function fetchMediaAssets(type = 'icon') {
  const { data, error } = await supabase.from(MEDIA_TABLE).select('*').eq('type', type).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function deleteMediaAsset(asset) {
  const path = normalizeStoragePath(asset.storage_path || asset.url);
  if (path) {
    const referenceQueries = await Promise.all([
      supabase.from('projects').select('cover_image, gallery_images, gallery_items'),
      supabase.from('creative_members').select('profile_image_url, cover_image'),
      supabase.from(SETTINGS_TABLE).select('*'),
      supabase.from(CONTENT_TABLE).select('content'),
      supabase.from('service_branches').select('icon_url, image_url'),
    ]);
    const failedReferenceQuery = referenceQueries.find((result) => result.error);
    if (failedReferenceQuery) throw new Error(`Media usage could not be verified, so nothing was deleted: ${failedReferenceQuery.error.message}`);
    const references = collectReferencedStoragePaths(...referenceQueries.map((result) => result.data || []));
    if (references.has(path)) throw new Error('This media file is still used by site content and cannot be deleted. Remove those references first.');
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([path]);
    if (storageError) throw new Error(`The storage file could not be removed, so its media record was kept: ${storageError.message}`);
  }
  const { error } = await supabase.from(MEDIA_TABLE).delete().eq('id', asset.id);
  if (error) throw new Error(path ? `The storage file was removed, but the media record could not be deleted: ${error.message}` : error.message);
}

export async function uploadMediaAssetFile(file, folder = 'icons', { onStatus } = {}) {
  if (!file) return { url: '', path: '' };
  validateFile(file, {
    allowedTypes: ['image/svg+xml', 'image/png', 'image/webp'],
    label: 'Icon',
  });
  validateUploadFile(file, 'mediaIcon');
  const prepared = await optimizeImageForUpload(file, 'mediaIcon', { label: 'Icon', onStatus });
  onStatus?.({ phase: 'uploading', ...prepared });
  const uploadFile = prepared.file;
  const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  const path = `${folder}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, uploadFile, UPLOAD_OPTIONS);
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export function mergePublicContent(settings = {}, pages = {}) {
  const mergedSettings = { ...defaultSiteContent, ...settings };
  return {
    ...mergedSettings,
    home: { ...defaultPageContent.home, ...(pages.home || {}) },
    about: { ...defaultPageContent.about, ...(pages.about || {}) },
    servicesPage: { ...defaultPageContent.services, ...(pages.services || {}) },
    contactPage: { ...defaultPageContent.contact, ...(pages.contact || {}) },
  };
}

function readCachedPublicContent(pageKeys = ALL_PAGE_KEYS) {
  if (typeof window === 'undefined') return null;
  const scope = publicContentScope(pageKeys);
  const memoryEntry = memoryPublicContentByScope.get(scope);
  if (memoryEntry) return memoryEntry.content;
  try {
    const raw = window.localStorage.getItem(PUBLIC_CONTENT_CACHE_KEY);
    const cached = raw ? JSON.parse(raw) : null;
    if (!cachedContentMatchesScope(cached, pageKeys)) return null;
    memoryPublicContentByScope.set(scope, { content: cached.content, updatedAt: cached.updatedAt || 0 });
    return cached.content;
  } catch {
    return null;
  }
}

function writeCachedPublicContent(content, pageKeys = ALL_PAGE_KEYS) {
  const scope = publicContentScope(pageKeys);
  const updatedAt = Date.now();
  memoryPublicContentByScope.set(scope, { content, updatedAt });
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PUBLIC_CONTENT_CACHE_KEY, JSON.stringify({ scope, content, updatedAt }));
  } catch {
  }
}

function notifyPublicContentChanged(content) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(PUBLIC_CONTENT_UPDATED_EVENT, { detail: content }));
  } catch {
  }
}

export function syncPublicContentCache(settings = {}) {
  let nextContent = mergePublicContent(settings);
  for (const [scope, entry] of memoryPublicContentByScope.entries()) {
    const cached = entry.content;
    const scopedContent = mergePublicContent(settings, {
      home: cached.home || {},
      about: cached.about || {},
      services: cached.servicesPage || {},
      contact: cached.contactPage || {},
    });
    memoryPublicContentByScope.set(scope, { content: scopedContent, updatedAt: Date.now() });
    nextContent = scopedContent;
  }
  const latestEntry = [...memoryPublicContentByScope.entries()].at(-1);
  if (latestEntry) {
    const [scope, entry] = latestEntry;
    try {
      window.localStorage.setItem(PUBLIC_CONTENT_CACHE_KEY, JSON.stringify({ scope, content: entry.content, updatedAt: entry.updatedAt }));
    } catch {
    }
  }
  notifyPublicContentChanged(nextContent);
  return nextContent;
}

function clearCachedPublicContent() {
  memoryPublicContentByScope.clear();
  publicContentRequests.clear();
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PUBLIC_CONTENT_CACHE_KEY);
    LEGACY_PUBLIC_CONTENT_CACHE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  } catch {
  }
}

async function fetchPublicContentBundle(pageKeys) {
  const [settings, pageEntries] = await Promise.all([
    fetchSiteSettings(),
    Promise.all(pageKeys.map(async (key) => [key, await fetchPageContent(key)])),
  ]);
  return mergePublicContent(settings, Object.fromEntries(pageEntries));
}

async function loadPublicContentBundle(pageKeys) {
  const scope = publicContentScope(pageKeys);
  const memoryEntry = memoryPublicContentByScope.get(scope);
  const memoryIsFresh = memoryEntry?.updatedAt && Date.now() - memoryEntry.updatedAt < PUBLIC_CONTENT_MEMORY_TTL;
  if (memoryIsFresh) return memoryEntry.content;
  if (publicContentRequests.has(scope)) return publicContentRequests.get(scope);

  const request = fetchPublicContentBundle(pageKeys);
  publicContentRequests.set(scope, request);
  try {
    return await request;
  } finally {
    publicContentRequests.delete(scope);
  }
}

function readCurrentCachedContent(pageKeys) {
  return readCachedPublicContent(pageKeys);
}

function themeStyle(content) {
  return {
    '--site-brand-accent': content.accentColor || defaultSiteContent.accentColor,
    '--site-primary-text': content.primaryTextColor || defaultSiteContent.primaryTextColor,
    '--site-secondary-text': content.secondaryTextColor || defaultSiteContent.secondaryTextColor,
    '--site-muted-text': content.mutedTextColor || defaultSiteContent.mutedTextColor,
    '--site-divider': content.dividerLineColor || content.accentColor || defaultSiteContent.dividerLineColor,
  };
}

export function PublicContentProvider({ children, pageKeys = ALL_PAGE_KEYS }) {
  const scope = publicContentScope(pageKeys);
  const cached = useMemo(() => readCachedPublicContent(pageKeys), [scope]);
  const [contentScope, setContentScope] = useState(scope);
  const [content, setContent] = useState(() => cached || mergePublicContent());
  const [loading, setLoading] = useState(!cached);
  const [resolved, setResolved] = useState(Boolean(cached));
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadContent() {
      const scopedCache = readCachedPublicContent(pageKeys);
      if (scopedCache) {
        setContent(scopedCache);
        setResolved(true);
      } else {
        setLoading(true);
        setResolved(false);
      }
      setContentScope(scope);
      setError('');
      try {
        const nextContent = await loadPublicContentBundle(pageKeys);
        if (!active) return;
        setContent(nextContent);
        setResolved(true);
        writeCachedPublicContent(nextContent, pageKeys);
      } catch (loadError) {
        if (active && !scopedCache) setError(loadError?.message || 'Live site content could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadContent();

    const handleCacheChange = () => {
      const nextContent = readCurrentCachedContent(pageKeys);
      if (nextContent) {
        setContent(nextContent);
        setResolved(true);
        setLoading(false);
        setError('');
      }
    };

    const handleStorageChange = (event) => {
      if (event.key && event.key !== PUBLIC_CONTENT_CACHE_KEY) return;
      memoryPublicContentByScope.delete(scope);
      handleCacheChange();
    };

    window.addEventListener(PUBLIC_CONTENT_UPDATED_EVENT, handleCacheChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      active = false;
      window.removeEventListener(PUBLIC_CONTENT_UPDATED_EVENT, handleCacheChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [scope]);

  const value = contentScope === scope
    ? { content, loading, resolved, error }
    : {
        content: cached || mergePublicContent(),
        loading: !cached,
        resolved: Boolean(cached),
        error: '',
      };

  return createElement(
    PublicContentContext.Provider,
    { value },
    createElement('div', { className: 'theme-content-root', style: themeStyle(value.content) }, children),
  );
}

export function usePublicContent(pageKeys = []) {
  const context = useContext(PublicContentContext);
  if (context) return context;

  const keys = useMemo(() => pageKeys, [pageKeys.join('|')]);
  const cached = readCachedPublicContent(keys);
  const [content, setContent] = useState(() => cached || mergePublicContent());
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let active = true;
    async function loadContent() {
      setLoading(true);
      try {
        const [settings, pageEntries] = await Promise.all([
          fetchSiteSettings(),
          Promise.all(keys.map(async (key) => [key, await fetchPageContent(key)])),
        ]);
        if (!active) return;
        setContent(mergePublicContent(settings, Object.fromEntries(pageEntries)));
      } finally {
        if (active) setLoading(false);
      }
    }
    loadContent();

    const handleCacheChange = () => {
      const nextContent = readCurrentCachedContent(keys);
      if (nextContent) {
        setContent(nextContent);
        setLoading(false);
      }
    };

    const handleStorageChange = (event) => {
      if (event.key && event.key !== PUBLIC_CONTENT_CACHE_KEY) return;
      memoryPublicContentByScope.delete(publicContentScope(keys));
      handleCacheChange();
    };

    window.addEventListener(PUBLIC_CONTENT_UPDATED_EVENT, handleCacheChange);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      active = false;
      window.removeEventListener(PUBLIC_CONTENT_UPDATED_EVENT, handleCacheChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [keys]);

  return { content, loading };
}
