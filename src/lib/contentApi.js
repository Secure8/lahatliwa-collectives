import { useEffect, useMemo, useState } from 'react';
import { defaultPageContent, defaultSiteContent } from '../data/siteContent';
import { supabase } from './supabaseClient';

const SETTINGS_TABLE = 'site_settings';
const CONTENT_TABLE = 'page_content';
const MEDIA_TABLE = 'media_assets';
const BUCKET = 'project-media';

function mapSettingsRow(row) {
  if (!row) return {};
  return {
    settingsId: row.id,
    displayName: row.brand_name || defaultSiteContent.displayName,
    legalName: row.personal_name || defaultSiteContent.legalName,
    tagline: row.tagline || defaultSiteContent.tagline,
    logoUrl: row.logo_url || '',
    logoAlt: row.logo_alt || defaultSiteContent.logoAlt,
    heroImageUrl: row.hero_image_url || '',
    heroImageAlt: row.hero_image_alt || defaultSiteContent.heroImageAlt,
    email: row.contact_email || defaultSiteContent.email,
    footerText: row.footer_text || defaultSiteContent.footerText,
    primaryTextColor: row.primary_text_color || defaultSiteContent.primaryTextColor,
    secondaryTextColor: row.secondary_text_color || defaultSiteContent.secondaryTextColor,
    mutedTextColor: row.muted_text_color || defaultSiteContent.mutedTextColor,
    accentColor: row.accent_color || defaultSiteContent.accentColor,
    defaultBackgroundImageUrl: row.default_background_image_url || '',
    defaultBackgroundOverlayOpacity: row.default_background_overlay_opacity ?? defaultSiteContent.defaultBackgroundOverlayOpacity,
    socialLinks: [
      { label: 'GitHub', href: row.github_url || '' },
      { label: 'Facebook', href: row.facebook_url || '' },
      { label: 'Instagram', href: row.instagram_url || '' },
      { label: 'LinkedIn', href: row.linkedin_url || '' },
      { label: 'YouTube', href: row.youtube_url || '' },
      { label: 'TikTok', href: row.tiktok_url || '' },
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
    contact_email: settings.email || null,
    github_url: settings.githubUrl || '',
    facebook_url: settings.facebookUrl || '',
    instagram_url: settings.instagramUrl || '',
    linkedin_url: settings.linkedinUrl || '',
    youtube_url: settings.youtubeUrl || '',
    tiktok_url: settings.tiktokUrl || '',
    footer_text: settings.footerText || null,
    primary_text_color: settings.primaryTextColor || null,
    secondary_text_color: settings.secondaryTextColor || null,
    muted_text_color: settings.mutedTextColor || null,
    accent_color: settings.accentColor || null,
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
    defaultBackgroundImageUrl: content.defaultBackgroundImageUrl,
    defaultBackgroundOverlayOpacity: content.defaultBackgroundOverlayOpacity,
  };
}

export async function fetchSiteSettings() {
  const { data, error } = await supabase.from(SETTINGS_TABLE).select('*').order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (error) throw error;
  return mapSettingsRow(data);
}

export async function updateSiteSettings(settings) {
  const payload = mapSettingsToPayload(settings);
  if (settings.settingsId) {
    const { error } = await supabase.from(SETTINGS_TABLE).update(payload).eq('id', settings.settingsId);
    if (error) throw error;
    return settings.settingsId;
  }
  const { data, error } = await supabase.from(SETTINGS_TABLE).insert(payload).select('id').single();
  if (error) throw error;
  return data.id;
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
}

export async function uploadSiteAsset(file, folder = 'site') {
  if (!file) return '';
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  const path = `${folder}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
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

export async function uploadMediaAssetFile(file, folder = 'icons') {
  if (!file) return { url: '', path: '' };
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
  const path = `${folder}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
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

export function usePublicContent(pageKeys = []) {
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
