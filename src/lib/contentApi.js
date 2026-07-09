import { createContext, createElement, useContext, useEffect, useMemo, useState } from 'react';
import { defaultPageContent, defaultSiteContent } from '../data/siteContent';
import { optimizeImageForUpload } from './imageCompression';
import { supabase } from './supabaseClient';
import { validateUploadFile } from './uploadLimits';

const SETTINGS_TABLE = 'site_settings';
const CONTENT_TABLE = 'page_content';
const MEDIA_TABLE = 'media_assets';
const BUCKET = 'project-media';
const UPLOAD_OPTIONS = { upsert: false, cacheControl: '31536000' };
const PUBLIC_CONTENT_CACHE_KEY = 'hevv-public-content-cache-v2';
const LEGACY_PUBLIC_CONTENT_CACHE_KEYS = ['hevv-public-content-cache'];
const ALL_PAGE_KEYS = ['home', 'about', 'services', 'contact'];
const PUBLIC_CONTENT_MEMORY_TTL = 60 * 1000;
const PublicContentContext = createContext(null);
const OPTIONAL_SETTINGS_COLUMNS = new Set(['divider_line_color', 'show_hero_portrait']);
let memoryPublicContent = null;
let memoryPublicContentUpdatedAt = 0;
let publicContentRequest = null;

function validateFile(file, { allowedTypes, label }) {
  if (!file) return;
  if (allowedTypes?.length && !allowedTypes.includes(file.type)) {
    throw new Error(`${label} file type is not supported.`);
  }
}

function normalizeExternalUrl(url = '') {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('mailto:')) return trimmed;
  return `https://${trimmed}`;
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

export function mapSettingsToPayload(settings) {
  return {
    brand_name: settings.displayName || defaultSiteContent.displayName,
    personal_name: settings.legalName || defaultSiteContent.legalName,
    tagline: settings.tagline || null,
    logo_url: settings.logoUrl || null,
    logo_alt: settings.logoAlt || null,
    hero_image_url: settings.heroImageUrl || null,
    hero_image_alt: settings.heroImageAlt || null,
    show_hero_portrait: settings.showHeroPortrait === true,
    contact_email: settings.email || null,
    github_url: normalizeExternalUrl(settings.githubUrl || ''),
    facebook_url: normalizeExternalUrl(settings.facebookUrl || ''),
    instagram_url: normalizeExternalUrl(settings.instagramUrl || ''),
    linkedin_url: normalizeExternalUrl(settings.linkedinUrl || ''),
    youtube_url: normalizeExternalUrl(settings.youtubeUrl || ''),
    tiktok_url: normalizeExternalUrl(settings.tiktokUrl || ''),
    footer_text: settings.footerText || null,
    primary_text_color: settings.primaryTextColor || null,
    secondary_text_color: settings.secondaryTextColor || null,
    muted_text_color: settings.mutedTextColor || null,
    accent_color: settings.accentColor || null,
    divider_line_color: settings.dividerLineColor || null,
    default_background_image_url: settings.defaultBackgroundImageUrl || null,
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

export async function fetchSiteSettings() {
  const { data, error } = await supabase.from(SETTINGS_TABLE).select('*').order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return mapSettingsRow(data);
}

function missingSchemaColumn(error) {
  const match = error?.message?.match(/Could not find the '([^']+)' column/);
  return match?.[1] || '';
}

async function saveSettingsPayload(settings, payload) {
  const skippedColumns = [];
  let nextPayload = { ...payload };

  for (let attempt = 0; attempt < OPTIONAL_SETTINGS_COLUMNS.size + 1; attempt += 1) {
    const query = settings.settingsId
      ? supabase.from(SETTINGS_TABLE).update(nextPayload).eq('id', settings.settingsId).select('id').single()
      : supabase.from(SETTINGS_TABLE).insert(nextPayload).select('id').single();

    const { data, error } = await query;
    if (!error) return { id: data?.id || settings.settingsId, skippedColumns };

    const column = missingSchemaColumn(error);
    if (!OPTIONAL_SETTINGS_COLUMNS.has(column) || !(column in nextPayload)) throw error;

    skippedColumns.push(column);
    const { [column]: _removed, ...payloadWithoutColumn } = nextPayload;
    nextPayload = payloadWithoutColumn;
  }

  return { id: settings.settingsId, skippedColumns };
}

export async function updateSiteSettings(settings) {
  const payload = mapSettingsToPayload(settings);
  const data = await saveSettingsPayload(settings, payload);
  clearCachedPublicContent();
  return data;
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
  const { error } = await supabase.from(MEDIA_TABLE).delete().eq('id', asset.id);
  if (error) throw error;
  if (asset.storage_path) {
    await supabase.storage.from(BUCKET).remove([asset.storage_path]);
  }
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

function readCachedPublicContent() {
  if (typeof window === 'undefined') return null;
  if (memoryPublicContent) return memoryPublicContent;
  try {
    const raw = window.localStorage.getItem(PUBLIC_CONTENT_CACHE_KEY);
    memoryPublicContent = raw ? JSON.parse(raw) : null;
    return memoryPublicContent;
  } catch {
    return null;
  }
}

function writeCachedPublicContent(content) {
  memoryPublicContent = content;
  memoryPublicContentUpdatedAt = Date.now();
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PUBLIC_CONTENT_CACHE_KEY, JSON.stringify(content));
  } catch {
  }
}

function clearCachedPublicContent() {
  memoryPublicContent = null;
  memoryPublicContentUpdatedAt = 0;
  publicContentRequest = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PUBLIC_CONTENT_CACHE_KEY);
    LEGACY_PUBLIC_CONTENT_CACHE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  } catch {
  }
}

function usesCompletePublicBundle(pageKeys) {
  return pageKeys.length === ALL_PAGE_KEYS.length && ALL_PAGE_KEYS.every((key) => pageKeys.includes(key));
}

async function fetchPublicContentBundle(pageKeys) {
  const [settings, pageEntries] = await Promise.all([
    fetchSiteSettings().catch(() => ({})),
    Promise.all(pageKeys.map(async (key) => [key, await fetchPageContent(key).catch(() => null)])),
  ]);
  return mergePublicContent(settings, Object.fromEntries(pageEntries));
}

async function loadPublicContentBundle(pageKeys) {
  const sharedBundle = usesCompletePublicBundle(pageKeys);
  const memoryIsFresh = memoryPublicContent
    && memoryPublicContentUpdatedAt
    && Date.now() - memoryPublicContentUpdatedAt < PUBLIC_CONTENT_MEMORY_TTL;

  if (sharedBundle && memoryIsFresh) return memoryPublicContent;
  if (!sharedBundle) return fetchPublicContentBundle(pageKeys);
  if (publicContentRequest) return publicContentRequest;

  publicContentRequest = fetchPublicContentBundle(pageKeys);
  try {
    return await publicContentRequest;
  } finally {
    publicContentRequest = null;
  }
}

function themeStyle(content) {
  return {
    '--site-accent': content.accentColor || defaultSiteContent.accentColor,
    '--site-primary-text': content.primaryTextColor || defaultSiteContent.primaryTextColor,
    '--site-secondary-text': content.secondaryTextColor || defaultSiteContent.secondaryTextColor,
    '--site-muted-text': content.mutedTextColor || defaultSiteContent.mutedTextColor,
    '--site-divider': content.dividerLineColor || content.accentColor || defaultSiteContent.dividerLineColor,
  };
}

export function PublicContentProvider({ children, pageKeys = ALL_PAGE_KEYS }) {
  const cached = useMemo(() => readCachedPublicContent(), []);
  const [content, setContent] = useState(() => cached || mergePublicContent());
  const [loading, setLoading] = useState(!cached);

  useEffect(() => {
    let active = true;
    async function loadContent() {
      try {
        const nextContent = await loadPublicContentBundle(pageKeys);
        if (!active) return;
        setContent(nextContent);
        writeCachedPublicContent(nextContent);
      } catch {
        if (active && !cached) setContent(mergePublicContent());
      } finally {
        if (active) setLoading(false);
      }
    }
    loadContent();
    return () => {
      active = false;
    };
  }, [cached, pageKeys]);

  const value = { content, loading };

  return createElement(
    PublicContentContext.Provider,
    { value },
    createElement('div', { style: themeStyle(value.content) }, children),
  );
}

export function usePublicContent(pageKeys = []) {
  const context = useContext(PublicContentContext);
  if (context) return context;

  const keys = useMemo(() => pageKeys, [pageKeys.join('|')]);
  const [content, setContent] = useState(() => mergePublicContent());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadContent() {
      setLoading(true);
      try {
        const [settings, pageEntries] = await Promise.all([
          fetchSiteSettings().catch(() => ({})),
          Promise.all(keys.map(async (key) => [key, await fetchPageContent(key).catch(() => null)])),
        ]);
        if (!active) return;
        setContent(mergePublicContent(settings, Object.fromEntries(pageEntries)));
      } finally {
        if (active) setLoading(false);
      }
    }
    loadContent();
    return () => {
      active = false;
    };
  }, [keys]);

  return { content, loading };
}
