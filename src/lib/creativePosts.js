import { commitManagedMediaReplacement, requestManagedMediaDeletion, uploadManagedWebsiteImage } from './r2Media.js';
import { safeExternalUrl } from './externalUrls.js';
import { supabase } from './supabaseClient.js';

export const CREATIVE_POST_GUIDELINES_VERSION = '2026-08-v1';
export const CREATIVE_POST_MAX_IMAGES = 10;
export const CREATIVE_POST_BLOCK_TYPES = Object.freeze(['paragraph', 'heading', 'quote', 'bullet_list', 'numbered_list', 'divider', 'image_group', 'external_embed']);

export function createPostBlock(type = 'paragraph') {
  const id = globalThis.crypto?.randomUUID?.() || `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (type === 'heading') return { id, type, level: 2, content: [{ text: '', marks: [] }] };
  if (type === 'quote') return { id, type, content: [{ text: '', marks: [] }] };
  if (type === 'bullet_list' || type === 'numbered_list') return { id, type, items: [''] };
  if (type === 'divider') return { id, type };
  if (type === 'image_group') return { id, type, mediaIds: [] };
  if (type === 'external_embed') return { id, type, url: '', label: '' };
  return { id, type: 'paragraph', content: [{ text: '', marks: [] }] };
}

export function emptyCreativePostDocument() {
  return { version: 1, blocks: [createPostBlock('paragraph')] };
}

function cleanSegment(segment = {}) {
  const text = String(segment.text || '').slice(0, 10000);
  const marks = [...new Set((Array.isArray(segment.marks) ? segment.marks : []).filter((mark) => ['bold', 'italic'].includes(mark)))];
  const href = safeExternalUrl(segment.href);
  const secureHref = href.startsWith('https://') ? href : '';
  return { text, marks, ...(secureHref ? { href: secureHref } : {}) };
}

export function normalizeCreativePostDocument(value) {
  const source = value && typeof value === 'object' ? value : {};
  const blocks = (Array.isArray(source.blocks) ? source.blocks : []).slice(0, 80).map((block) => {
    const type = CREATIVE_POST_BLOCK_TYPES.includes(block?.type) ? block.type : 'paragraph';
    const id = String(block?.id || globalThis.crypto?.randomUUID?.() || `block-${Date.now()}`);
    if (['paragraph', 'heading', 'quote'].includes(type)) return {
      id, type,
      ...(type === 'heading' ? { level: [2, 3].includes(Number(block.level)) ? Number(block.level) : 2 } : {}),
      content: (Array.isArray(block.content) ? block.content : [{ text: block.text || '', marks: [] }]).slice(0, 200).map(cleanSegment),
    };
    if (type === 'bullet_list' || type === 'numbered_list') return { id, type, items: (Array.isArray(block.items) ? block.items : ['']).slice(0, 40).map((item) => String(item || '').slice(0, 2000)) };
    if (type === 'image_group') return { id, type, mediaIds: [...new Set((Array.isArray(block.mediaIds) ? block.mediaIds : []).map(String))].slice(0, CREATIVE_POST_MAX_IMAGES) };
    if (type === 'external_embed') { const url = safeExternalUrl(block.url); return { id, type, url: url.startsWith('https://') ? url : '', label: String(block.label || '').slice(0, 160) }; }
    return { id, type: 'divider' };
  });
  return { version: 1, blocks: blocks.length ? blocks : [createPostBlock('paragraph')] };
}

export function creativePostPlainText(document) {
  return normalizeCreativePostDocument(document).blocks.map((block) => {
    if (block.content) return block.content.map((segment) => segment.text).join('');
    if (block.items) return block.items.join(' ');
    if (block.type === 'external_embed') return block.label || block.url;
    return '';
  }).filter(Boolean).join('\n').trim();
}

export function creativePostExcerpt(document, max = 180) {
  const text = creativePostPlainText(document).replace(/\s+/g, ' ');
  return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

export function postMediaById(media = []) {
  return new Map((media || []).map((item) => [item.id, item]));
}

export function applyCreativePostInlineStyle(content = [], start = 0, end = 0, style = {}) {
  const segments = (Array.isArray(content) ? content : []).map(cleanSegment);
  const total = segments.reduce((sum, segment) => sum + segment.text.length, 0);
  const from = Math.max(0, Math.min(Number(start) || 0, total));
  const to = Math.max(from, Math.min(Number(end) || 0, total));
  if (from === to) return segments;
  const selected = []; let cursor = 0;
  for (const segment of segments) {
    const segmentStart = cursor; const segmentEnd = cursor + segment.text.length; cursor = segmentEnd;
    if (segmentEnd <= from || segmentStart >= to) continue;
    selected.push(segment);
  }
  const removeMark = style.mark && selected.length > 0 && selected.every((segment) => segment.marks.includes(style.mark));
  const result = []; cursor = 0;
  for (const segment of segments) {
    const segmentStart = cursor; const segmentEnd = cursor + segment.text.length; cursor = segmentEnd;
    const localStart = Math.max(0, from - segmentStart); const localEnd = Math.min(segment.text.length, to - segmentStart);
    if (localStart >= localEnd) { result.push(segment); continue; }
    if (localStart > 0) result.push({ ...segment, text: segment.text.slice(0, localStart) });
    const middle = { ...segment, text: segment.text.slice(localStart, localEnd) };
    if (style.mark) middle.marks = removeMark ? middle.marks.filter((mark) => mark !== style.mark) : [...new Set([...middle.marks, style.mark])];
    if ('href' in style) { const href = safeExternalUrl(style.href); if (href.startsWith('https://')) middle.href = href; else delete middle.href; }
    result.push(middle);
    if (localEnd < segment.text.length) result.push({ ...segment, text: segment.text.slice(localEnd) });
  }
  return result.filter((segment) => segment.text.length > 0);
}

function postError(error, fallback) {
  const raw = `${error?.message || ''} ${error?.details || ''}`;
  if (/CREATIVE_POST_CONFLICT/.test(raw)) return new Error('This post changed in another tab. Reload it before saving again.');
  if (/MEDIA_LIMIT/.test(raw)) return new Error('Choose no more than 10 images for one post.');
  if (/MEDIA_REFERENCES_INVALID|MEDIA_INVALID/.test(raw)) return new Error('One or more post images are unavailable. Remove them or upload them again.');
  if (/IMAGE_DESCRIPTION_REQUIRED/.test(raw)) return new Error('Describe every image before publishing so the post is accessible.');
  if (/ARCHIVE_REQUIRED/.test(raw)) return new Error('Archive this post before deleting it.');
  if (/NOT_AUTHORIZED|permission|row-level security/i.test(raw)) return new Error('You can only manage posts that belong to your Creative profile.');
  return new Error(fallback || error?.message || 'The post action could not be completed.');
}

export async function createCreativePostDraft() {
  const { data, error } = await supabase.rpc('create_creative_post');
  if (error) throw postError(error, 'A new post could not be created.');
  return data;
}

export async function loadCreativePostForEdit(id) {
  const { data, error } = await supabase.from('creative_posts').select('*,creative_post_media(*)').eq('id', id).single();
  if (error) throw postError(error, 'This post could not be opened.');
  return { ...data, creative_post_media: [...(data.creative_post_media || [])].sort((a, b) => a.display_order - b.display_order) };
}

export async function loadPublicCreativePosts(creativeMemberId) {
  const { data, error } = await supabase.from('creative_posts')
    .select('id,creative_member_id,slug,document,status,visibility,moderation_status,published_at,updated_at,creative_post_media(*)')
    .eq('creative_member_id', creativeMemberId).eq('status', 'published').eq('visibility', 'public').eq('moderation_status', 'clear')
    .order('published_at', { ascending: false });
  if (error) throw postError(error, 'Creative posts could not be loaded.');
  return (data || []).map((post) => ({ ...post, creative_post_media: [...(post.creative_post_media || [])].sort((a, b) => a.display_order - b.display_order) }));
}

export async function loadPublicCreativeFeed({ limit = 30 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 30, 60));
  const { data, error } = await supabase.from('creative_posts')
    .select('id,creative_member_id,slug,document,status,visibility,moderation_status,published_at,updated_at,creative_post_media(*),creative_members(id,name,slug,role,short_bio,profile_image_url)')
    .eq('status', 'published').eq('visibility', 'public').eq('moderation_status', 'clear')
    .order('published_at', { ascending: false }).limit(safeLimit);
  if (error) throw postError(error, 'The creative feed could not be loaded.');
  return (data || []).map((post) => ({
    ...post,
    creative_post_media: [...(post.creative_post_media || [])].sort((a, b) => a.display_order - b.display_order),
  }));
}

export async function loadOwnCreativePosts() {
  const { data, error } = await supabase.from('creative_posts')
    .select('id,creative_member_id,slug,document,status,visibility,moderation_status,moderation_reason,published_at,updated_at,creative_post_media(*)')
    .order('updated_at', { ascending: false });
  if (error) throw postError(error, 'Your posts could not be loaded.');
  return (data || []).map((post) => ({ ...post, creative_post_media: [...(post.creative_post_media || [])].sort((a, b) => a.display_order - b.display_order) }));
}

export async function loadPublicCreativePost(slug) {
  const { data, error } = await supabase.from('creative_posts')
    .select('id,creative_member_id,slug,document,status,visibility,moderation_status,published_at,updated_at,creative_post_media(*),creative_members(id,name,slug,role,profile_image_url)')
    .eq('slug', slug).eq('status', 'published').eq('visibility', 'public').eq('moderation_status', 'clear').single();
  if (error) throw postError(error, 'Post not found or no longer public.');
  return { ...data, creative_post_media: [...(data.creative_post_media || [])].sort((a, b) => a.display_order - b.display_order) };
}

export async function loadPostsForModeration() {
  const { data, error } = await supabase.from('creative_posts')
    .select('id,slug,status,visibility,moderation_status,moderation_reason,published_at,updated_at,document,creative_post_media(*),creative_members(id,name,slug,profile_image_url)')
    .order('updated_at', { ascending: false });
  if (error) throw postError(error, 'Creative posts could not be loaded for moderation.');
  return data || [];
}

export async function moderateCreativePost(postId, action, reason) {
  const { data, error } = await supabase.rpc('moderate_creative_post', { p_post_id: postId, p_action: action, p_reason: reason });
  if (error) throw postError(error, 'The moderation action could not be completed.');
  return data;
}

export async function saveCreativePost(post, document) {
  const normalized = normalizeCreativePostDocument(document);
  const { data, error } = await supabase.rpc('save_creative_post', { p_post_id: post.id, p_document: normalized, p_expected_updated_at: post.updated_at });
  if (error) throw postError(error, 'Your post could not be saved.');
  return data;
}

export async function publishCreativePost(postId) {
  const { data, error } = await supabase.rpc('publish_creative_post', { p_post_id: postId, p_guidelines_version: CREATIVE_POST_GUIDELINES_VERSION });
  if (error) throw postError(error, 'Your post could not be published.');
  return data;
}

export async function archiveCreativePost(postId) {
  const { data, error } = await supabase.rpc('archive_creative_post', { p_post_id: postId });
  if (error) throw postError(error, 'Your post could not be archived.');
  return data;
}

export async function restoreCreativePost(postId) {
  const { data, error } = await supabase.rpc('restore_creative_post', { p_post_id: postId });
  if (error) throw postError(error, 'Your post could not be restored.');
  return data;
}

export async function deleteCreativePost(postId) {
  const { data, error } = await supabase.rpc('delete_creative_post', { p_post_id: postId });
  if (error) throw postError(error, 'Your post could not be deleted.');
  return data;
}

export async function uploadCreativePostImage(file, { postId, order, altText = '', caption = '', onStatus } = {}) {
  const managed = await uploadManagedWebsiteImage(file, { category: 'creative_post_image', creativePostId: postId, onStatus });
  const { data, error } = await supabase.from('creative_post_media').insert({
    post_id: postId, media_group_id: managed.groupId, display_order: order,
    thumbnail_url: managed.urls?.thumbnail || managed.primaryUrl,
    display_url: managed.urls?.display || managed.primaryUrl,
    expanded_url: managed.urls?.expanded || managed.primaryUrl,
    alt_text: altText, caption,
  }).select('*').single();
  if (error) {
    await requestManagedMediaDeletion(managed.primaryUrl).catch(() => null);
    throw postError(error, 'The image could not be attached to this post.');
  }
  await commitManagedMediaReplacement(managed.primaryUrl, '');
  return data;
}

export async function updateCreativePostMedia(id, patch) {
  const allowed = { alt_text: String(patch.alt_text || '').slice(0, 240), caption: String(patch.caption || '').slice(0, 500) };
  if (Number.isInteger(Number(patch.display_order))) allowed.display_order = Number(patch.display_order);
  const { data, error } = await supabase.from('creative_post_media').update(allowed).eq('id', id).select('*').single();
  if (error) throw postError(error, 'The image details could not be updated.');
  return data;
}

export async function removeCreativePostMedia(media) {
  const { error } = await supabase.from('creative_post_media').delete().eq('id', media.id);
  if (error) throw postError(error, 'The image could not be removed.');
  await requestManagedMediaDeletion(media.expanded_url || media.display_url).catch(() => null);
}
