import { assertSupabaseConfigured, supabase } from '../../lib/supabaseClient.js';
import { emptyEditorialDocument, validateEditorialDocument } from './editorialDocument.js';

export const CONTENT_TYPES = Object.freeze([
  { key: 'journal', label: 'Journal', plural: 'Journal', path: '/journal' },
  { key: 'event', label: 'Event', plural: 'Events', path: '/events' },
  { key: 'place', label: 'Place', plural: 'Places', path: '/places' },
  { key: 'activity', label: 'Activity', plural: 'Activities', path: '/activities' },
  { key: 'local_product', label: 'Local product', plural: 'Local products', path: '/local-products' },
]);

export const EDITORIAL_STATUSES = Object.freeze(['draft', 'submitted', 'needs_revision', 'approved', 'scheduled', 'published', 'expired', 'archived']);
const EDITORIAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertEditorialDraftId(id) {
  const normalized = String(id ?? '').trim();
  if (!EDITORIAL_UUID_PATTERN.test(normalized)) throw Object.assign(new Error('This draft link is invalid. Return to Drafts and open it again.'), { code: 'EDITORIAL_DRAFT_ID_INVALID' });
  return normalized;
}

function withStudioStatus(post) {
  if (!post) return post;
  return { ...post, status: post.status === 'submitted' ? 'in_review' : post.status === 'needs_revision' ? 'changes_requested' : post.status };
}

export function editorialDraftError(error, phase = 'load') {
  const source = error || {};
  const raw = `${source.code || ''} ${source.message || ''} ${source.details || ''}`.toLowerCase();
  if (source.code === 'SUPABASE_CONFIGURATION_MISSING' || source.code === 'SUPABASE_PROJECT_MISMATCH' || source.code === 'EDITORIAL_DRAFT_ID_INVALID') return source;
  if (source.code === 'EDITORIAL_AUTH_REQUIRED' || /jwt|not authenticated|auth session missing|unauthorized/.test(raw)) return Object.assign(new Error('Your sign-in session is not ready. Refresh the page and sign in again if this continues.'), { code: 'EDITORIAL_AUTH_REQUIRED', cause: source });
  if (source.status === 403 || source.code === '42501' || /row-level security|permission denied|forbidden/.test(raw)) return Object.assign(new Error('Your account cannot access this draft. Check its assignment and your active Editorial role.'), { code: 'EDITORIAL_ACCESS_DENIED', cause: source });
  if (source instanceof TypeError || /failed to fetch|network|load failed/.test(raw)) return Object.assign(new Error('The draft could not reach Supabase. Check your connection and Preview environment, then retry.'), { code: 'EDITORIAL_NETWORK_ERROR', cause: source });
  if (/does not exist|schema cache|pgrst20|relation/.test(raw)) return Object.assign(new Error('The Editorial database is unavailable or its schema is not ready.'), { code: 'EDITORIAL_DATABASE_UNAVAILABLE', cause: source });
  return Object.assign(new Error(`The draft could not be ${phase === 'load' ? 'loaded' : phase}. ${source.message || 'Please retry.'}`), { code: 'EDITORIAL_QUERY_FAILED', cause: source });
}

export function editorialActionError(error, action = 'complete that action') {
  const source = error || {};
  const raw = `${source.code || ''} ${source.message || ''} ${source.details || ''}`.toLowerCase();
  if (source.code === 'EDITORIAL_REVISION_CONFLICT' || raw.includes('editorial_revision_conflict')) return Object.assign(new Error('This story was updated elsewhere. Reload before continuing.'), { code: 'EDITORIAL_REVISION_CONFLICT', cause: source });
  if (source.status === 403 || source.code === '42501' || /editorial_not_authorized|not authorized|permission denied|forbidden|row-level security/.test(raw)) return Object.assign(new Error('You do not have permission to edit this story.'), { code: 'EDITORIAL_ACCESS_DENIED', cause: source });
  if (source instanceof TypeError || /failed to fetch|network|load failed/.test(raw)) return Object.assign(new Error('The Editorial service could not be reached. Check your connection and try again.'), { code: 'EDITORIAL_NETWORK_ERROR', cause: source });
  if (/metadata_invalid|document_invalid|invalid input|check constraint/.test(raw)) return Object.assign(new Error('Check the highlighted story details and try again.'), { code: 'EDITORIAL_VALIDATION_ERROR', cause: source });
  return Object.assign(new Error(`We could not ${action}. Please try again.`), { code: source.code || 'EDITORIAL_ACTION_FAILED', cause: source });
}

async function editorialFunctionError(error) {
  let payload = null;
  if (error?.context) {
    try { payload = await error.context.clone().json(); } catch { payload = null; }
  }
  return Object.assign(new Error(payload?.message || error?.message || 'The Editorial service could not complete the action.'), { code: payload?.code || error?.code || 'EDITORIAL_WORKFLOW_FAILED', cause: error });
}

async function invokeEditorialWorkflow(body) {
  const { data, error } = await supabase.functions.invoke('editorial-workflow', { body });
  if (error) throw await editorialFunctionError(error);
  if (!data?.success) throw Object.assign(new Error(data?.message || 'The Editorial service could not complete the action.'), { code: data?.code || 'EDITORIAL_WORKFLOW_FAILED' });
  return data.result;
}

function withPublishedSnapshot(post) {
  const snapshot = post?.published_metadata || {};
  return {
    ...post,
    title: snapshot.title || post.title,
    summary: snapshot.summary ?? post.summary,
    slug: snapshot.slug || post.slug,
    cover_image_url: snapshot.coverImageUrl ?? post.cover_image_url,
    cover_image_alt: snapshot.coverImageAlt ?? post.cover_image_alt,
    category_id: snapshot.categoryId ?? post.category_id,
    municipality_id: snapshot.municipalityId ?? post.municipality_id,
  };
}

export function contentTypeMeta(type = '') {
  return CONTENT_TYPES.find((item) => item.key === type) || CONTENT_TYPES[0];
}

export function slugifyEditorial(value = '') {
  return String(value || '').trim().toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
}

export async function listPublishedEditorial({ type, search = '', municipality = '', category = '', tag = '', from = '', to = '', limit = 48 } = {}) {
  let municipalityId = '';
  let categoryId = '';
  let postIds = null;
  if (municipality) {
    const { data } = await supabase.from('editorial_municipalities').select('id').eq('slug', municipality).maybeSingle();
    if (!data) return [];
    municipalityId = data.id;
  }
  if (category) {
    const { data } = await supabase.from('editorial_categories').select('id').eq('slug', category).maybeSingle();
    if (!data) return [];
    categoryId = data.id;
  }
  if (tag) {
    const { data: tagRow } = await supabase.from('editorial_tags').select('id').eq('slug', tag).maybeSingle();
    if (!tagRow) return [];
    const { data: links } = await supabase.from('editorial_post_tags').select('post_id').eq('tag_id', tagRow.id);
    postIds = (links || []).map((item) => item.post_id);
    if (!postIds.length) return [];
  }
  if (type === 'event' && (from || to)) {
    let eventQuery = supabase.from('editorial_event_details').select('post_id');
    if (from) eventQuery = eventQuery.gte('starts_at', `${from}T00:00:00.000Z`);
    if (to) eventQuery = eventQuery.lte('starts_at', `${to}T23:59:59.999Z`);
    const { data: events } = await eventQuery;
    const eventIds = (events || []).map((item) => item.post_id);
    postIds = postIds ? postIds.filter((id) => eventIds.includes(id)) : eventIds;
    if (!postIds.length) return [];
  }
  let query = supabase.from('editorial_posts').select('id,content_type,title,slug,summary,cover_image_url,cover_image_alt,published_at,published_metadata,municipality_id,category_id,editorial_municipalities(name,slug),editorial_categories(name,slug),editorial_post_tags(editorial_tags(name,slug))')
    .not('published_revision_id', 'is', null).is('archived_at', null).order('published_at', { ascending: false }).limit(Math.min(Math.max(limit * 4, limit), 200));
  if (type) query = query.eq('content_type', type);
  if (municipalityId) query = query.contains('published_metadata', { municipalityId });
  if (categoryId) query = query.contains('published_metadata', { categoryId });
  if (postIds) query = query.in('id', postIds);
  const { data, error } = await query;
  if (error) throw error;
  const normalized = (data || []).map(withPublishedSnapshot);
  const needle = search.trim().toLocaleLowerCase();
  return (needle ? normalized.filter((post) => `${post.title} ${post.summary || ''}`.toLocaleLowerCase().includes(needle)) : normalized).slice(0, limit);
}

export async function getPublishedEditorial(type, slug) {
  const { data: post, error } = await supabase.from('editorial_posts')
    .select('id,content_type,title,slug,summary,cover_image_url,cover_image_alt,published_at,published_revision_id,published_metadata,contributor_id,municipality_id,category_id,editorial_municipalities(name,slug),editorial_categories(name,slug),editorial_contributors(display_name,slug,bio,avatar_url),editorial_post_tags(editorial_tags(name,slug)),editorial_corrections(id,summary,corrected_at),editorial_sources(id,source_name,source_url,official_contact,verified_at)')
    .eq('content_type', type).contains('published_metadata', { slug }).not('published_revision_id', 'is', null).is('archived_at', null).maybeSingle();
  if (error || !post) return null;
  const [{ data: revision }, { data: event }, { data: place }, { data: activity }, { data: product }] = await Promise.all([
    supabase.from('editorial_revisions').select('document,seo_title,seo_description').eq('id', post.published_revision_id).maybeSingle(),
    type === 'event' ? supabase.from('editorial_event_details').select('*').eq('post_id', post.id).maybeSingle() : Promise.resolve({ data: null }),
    type === 'place' ? supabase.from('editorial_place_details').select('*').eq('post_id', post.id).maybeSingle() : Promise.resolve({ data: null }),
    type === 'activity' ? supabase.from('editorial_activity_details').select('*').eq('post_id', post.id).maybeSingle() : Promise.resolve({ data: null }),
    type === 'local_product' ? supabase.from('editorial_product_details').select('*').eq('post_id', post.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return { ...withPublishedSnapshot(post), revision: revision || { document: emptyEditorialDocument() }, details: post.published_metadata?.details || event || place || activity || product || null };
}

export async function listEditorialTaxonomy() {
  const [municipalities, categories, tags] = await Promise.all([
    supabase.from('editorial_municipalities').select('id,name,slug').eq('is_active', true).order('name'),
    supabase.from('editorial_categories').select('id,name,slug,content_type').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('editorial_tags').select('id,name,slug').order('name'),
  ]);
  return { municipalities: municipalities.data || [], categories: categories.data || [], tags: tags.data || [] };
}

export const EDITORIAL_DETAIL_CONFIG = Object.freeze({
  event: { table: 'editorial_event_details', fields: ['starts_at', 'ends_at', 'venue_name', 'location_text', 'organizer', 'official_contact', 'official_url', 'price_note', 'event_status'] },
  place: { table: 'editorial_place_details', fields: ['address_text', 'latitude', 'longitude', 'opening_hours_note', 'contact_note', 'accessibility_note', 'place_type', 'verification_status', 'official_url'] },
  activity: { table: 'editorial_activity_details', fields: ['activity_type', 'availability_note', 'duration_note', 'difficulty', 'meeting_point', 'contact_note', 'safety_note', 'verification_status', 'official_url'] },
  local_product: { table: 'editorial_product_details', fields: ['product_type', 'maker_name', 'purchase_location', 'contact_note', 'price_note', 'verification_status', 'official_url'] },
});

function cleanEditorText(value, max = 2000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export function sanitizeEditorialDetails(contentType, details = {}) {
  const config = EDITORIAL_DETAIL_CONFIG[contentType];
  if (!config) return {};
  return Object.fromEntries(config.fields.map((key) => {
    const value = details?.[key];
    if (['latitude', 'longitude'].includes(key)) return [key, value === '' || value == null ? null : Number(value)];
    if (['starts_at', 'ends_at'].includes(key)) return [key, value ? new Date(value).toISOString() : null];
    if (key === 'official_url') return [key, cleanEditorText(value, 2048) || null];
    return [key, cleanEditorText(value, 2000)];
  }));
}

export function sanitizeEditorialSources(sources = []) {
  return (Array.isArray(sources) ? sources : []).slice(0, 50).map((source) => ({
    id: EDITORIAL_UUID_PATTERN.test(String(source?.id || '')) ? source.id : globalThis.crypto?.randomUUID?.(),
    source_name: cleanEditorText(source?.source_name, 180),
    source_url: cleanEditorText(source?.source_url, 2048),
    publisher: cleanEditorText(source?.publisher, 180),
    note: cleanEditorText(source?.note, 1000),
    official_contact: cleanEditorText(source?.official_contact, 500),
    verification_status: ['unverified', 'verified', 'needs_review', 'unavailable'].includes(source?.verification_status) ? source.verification_status : 'unverified',
    verified_at: source?.verification_status === 'verified' ? source?.verified_at || null : null,
  }));
}

export async function listTourismHomepageSections() {
  const { data, error } = await supabase.from('editorial_homepage_sections')
    .select('id,section_key,heading,description,sort_order,editorial_homepage_items(id,label,sort_order,editorial_posts(id,content_type,title,slug,summary,cover_image_url,cover_image_alt,published_revision_id,published_at,published_metadata,status,archived_at))')
    .eq('is_visible', true).order('sort_order').order('sort_order', { referencedTable: 'editorial_homepage_items' });
  if (error) throw error;
  return (data || []).map((section) => ({ ...section, editorial_homepage_items: (section.editorial_homepage_items || []).filter((item) => item.editorial_posts?.published_revision_id && !item.editorial_posts.archived_at && item.editorial_posts.status !== 'expired').map((item) => ({ ...item, editorial_posts: withPublishedSnapshot(item.editorial_posts) })) })).filter((section) => section.editorial_homepage_items.length);
}

export async function listEditorialWorkspace({ userId, role, scope = 'all', status = '' } = {}) {
  let query = supabase.from('editorial_posts').select('id,content_type,title,slug,summary,status,author_user_id,assigned_editor_user_id,contributor_id,category_id,municipality_id,cover_image_url,cover_image_alt,current_revision_id,updated_at,published_at,scheduled_for,editorial_municipalities(name,slug),editorial_categories(name,slug),editorial_contributors(display_name)').order('updated_at', { ascending: false }).limit(100);
  if (scope === 'drafts') query = query.in('status', ['draft', 'needs_revision']);
  if (scope === 'assigned') query = query.eq('assigned_editor_user_id', userId);
  if (scope === 'review') query = query.eq('status', 'submitted');
  if (status) query = query.eq('status', status);
  if (!['super_admin', 'owner'].includes(String(role || '').toLowerCase())) query = query.eq('author_user_id', userId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(withStudioStatus);
}

export async function getEditorialDraft(id) {
  const draftId = assertEditorialDraftId(id);
  assertSupabaseConfigured();
  const { data: authData, error: authError } = await supabase.auth.getSession();
  if (authError) throw editorialDraftError(authError, 'authenticated');
  if (!authData?.session?.user) throw Object.assign(new Error('Your sign-in session is not ready.'), { code: 'EDITORIAL_AUTH_REQUIRED' });
  const { data: post, error } = await supabase.from('editorial_posts').select('*').eq('id', draftId).maybeSingle();
  if (error) throw editorialDraftError(error);
  if (!post) return null;
  const detailConfig = EDITORIAL_DETAIL_CONFIG[post.content_type];
  const [revisionResult, autosaveResult, detailResult, sourceResult] = await Promise.all([
    post.current_revision_id ? supabase.from('editorial_revisions').select('*').eq('id', post.current_revision_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    supabase.from('editorial_autosaves').select('document,metadata,updated_at').eq('post_id', draftId).maybeSingle(),
    detailConfig ? supabase.from(detailConfig.table).select('*').eq('post_id', draftId).maybeSingle() : Promise.resolve({ data: {}, error: null }),
    supabase.from('editorial_sources').select('id,source_name,source_url,publisher,note,official_contact,verification_status,verified_at').eq('post_id', draftId).order('updated_at'),
  ]);
  if (revisionResult.error) throw editorialDraftError(revisionResult.error, 'loaded with its revision');
  if (autosaveResult.error) throw editorialDraftError(autosaveResult.error, 'loaded with its autosave');
  if (detailResult.error) throw editorialDraftError(detailResult.error, 'loaded with its tourism details');
  if (sourceResult.error) throw editorialDraftError(sourceResult.error, 'loaded with its sources');
  const revision = revisionResult.data;
  const autosave = autosaveResult.data;
  const savedAt = revision?.created_at ? new Date(revision.created_at).getTime() : 0;
  const autosaveAt = autosave?.updated_at ? new Date(autosave.updated_at).getTime() : 0;
  const recovered = autosaveAt > savedAt ? autosave.metadata || {} : {};
  return withStudioStatus({ ...post, ...recovered, details: recovered.editorial_details || detailResult.data || {}, sources: recovered.editorial_sources || sourceResult.data || [], revision: { ...(revision || { document: emptyEditorialDocument(), seo_title: '', seo_description: '', editor_note: '' }), ...(autosaveAt > savedAt ? { document: autosave.document } : {}) }, autosave: autosaveAt > savedAt ? autosave : null });
}

export async function saveEditorialAutosave(userId, post, document) {
  const validation = validateEditorialDocument(document);
  if (!validation.valid || !userId || !post?.id) return false;
  const metadata = {
    title: String(post.title || '').slice(0, 180), slug: slugifyEditorial(post.slug || post.title),
    summary: String(post.summary || '').slice(0, 500), cover_image_url: post.cover_image_url || null,
    cover_image_alt: String(post.cover_image_alt || '').slice(0, 240), category_id: post.category_id || null,
    municipality_id: post.municipality_id || null, assigned_editor_user_id: post.assigned_editor_user_id || null,
    editorial_details: sanitizeEditorialDetails(post.content_type, post.details),
    editorial_sources: sanitizeEditorialSources(post.sources),
  };
  const { error } = await supabase.from('editorial_autosaves').upsert({ post_id: post.id, user_id: userId, document: validation.document, metadata, base_revision_id: post.current_revision_id || null, updated_at: new Date().toISOString() }, { onConflict: 'post_id,user_id' });
  if (error) throw error;
  return true;
}

export async function clearEditorialAutosave(postId) {
  const { error } = await supabase.from('editorial_autosaves').delete().eq('post_id', postId);
  if (error) throw error;
}

export async function createEditorialDraft({ userId, contentType = 'journal', title = 'Untitled story', municipalityId = null, categoryId = null, document = emptyEditorialDocument() } = {}) {
  const cleanTitle = String(title || '').trim();
  const { data: recoverable, error: recoveryError } = await supabase.from('editorial_posts').select('*')
    .eq('author_user_id', userId).eq('content_type', contentType).eq('title', cleanTitle)
    .eq('status', 'draft').is('current_revision_id', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (recoveryError) throw recoveryError;
  const id = globalThis.crypto?.randomUUID?.();
  const slug = `${slugifyEditorial(cleanTitle) || 'untitled'}-${String(id).slice(0, 8)}`;
  let data = recoverable;
  let inserted = false;
  if (!data) {
    const result = await supabase.from('editorial_posts').insert({ id, content_type: contentType, title: cleanTitle, slug, author_user_id: userId, municipality_id: municipalityId || null, category_id: categoryId || null, status: 'draft' }).select('*').single();
    if (result.error) throw result.error;
    data = result.data;
    inserted = true;
  }
  if (!data?.id || !EDITORIAL_UUID_PATTERN.test(data.id)) throw Object.assign(new Error('The draft was created, but its identifier was not returned. Open it from Drafts.'), { code: 'EDITORIAL_DRAFT_CREATE_ID_MISSING' });
  try {
    const revision = await saveEditorialDraft({ ...data, municipality_id: municipalityId || data.municipality_id || null, category_id: categoryId || data.category_id || null }, document, {});
    return withStudioStatus({ ...data, municipality_id: municipalityId || data.municipality_id || null, category_id: categoryId || data.category_id || null, current_revision_id: revision.id, revision });
  } catch (error) {
    if (inserted) await supabase.rpc('delete_editorial_post', { p_post_id: data.id });
    throw error;
  }
}

export async function saveEditorialDetails(post) {
  const config = EDITORIAL_DETAIL_CONFIG[post?.content_type];
  if (!config) return {};
  const details = sanitizeEditorialDetails(post.content_type, post.details);
  const hasDetails = Object.entries(details).some(([key, value]) => !['event_status', 'verification_status'].includes(key) && value !== '' && value != null);
  if (!hasDetails) return details;
  if (post.content_type === 'event' && !details.starts_at) throw Object.assign(new Error('Add the event start date before saving event details.'), { code: 'EDITORIAL_EVENT_DATE_REQUIRED' });
  const { data, error } = await supabase.from(config.table).upsert({ post_id: post.id, ...details }, { onConflict: 'post_id' }).select('*').single();
  if (error) throw editorialActionError(error, 'save the tourism details');
  return data;
}

export async function syncEditorialSources(post, userId) {
  const sources = sanitizeEditorialSources(post?.sources).filter((source) => source.source_name);
  for (const source of sources) {
    if (source.source_url && !/^https:\/\/[^\s<>"']+$/i.test(source.source_url)) throw Object.assign(new Error('Use an HTTPS link for each source.'), { code: 'EDITORIAL_SOURCE_URL_INVALID' });
  }
  const { data: existing, error: readError } = await supabase.from('editorial_sources').select('id').eq('post_id', post.id);
  if (readError) throw editorialActionError(readError, 'load the sources');
  const currentIds = new Set(sources.map((source) => source.id));
  const removedIds = (existing || []).map((source) => source.id).filter((id) => !currentIds.has(id));
  if (removedIds.length) {
    const { error } = await supabase.from('editorial_sources').delete().in('id', removedIds);
    if (error) throw editorialActionError(error, 'remove the source');
  }
  for (const source of sources) {
    const payload = { post_id: post.id, source_name: source.source_name, source_url: source.source_url || null, publisher: source.publisher, note: source.note, official_contact: source.official_contact, verification_status: source.verification_status, verified_at: source.verification_status === 'verified' ? source.verified_at || new Date().toISOString() : null };
    if ((existing || []).some((row) => row.id === source.id)) {
      const { error } = await supabase.from('editorial_sources').update(payload).eq('id', source.id);
      if (error) throw editorialActionError(error, 'update the source');
    } else {
      const { error } = await supabase.from('editorial_sources').insert({ id: source.id, ...payload, created_by: userId });
      if (error) throw editorialActionError(error, 'add the source');
    }
  }
  return sources;
}

export async function saveEditorialDraft(post, document, revision = {}) {
  const validation = validateEditorialDocument(document);
  if (!validation.valid) throw Object.assign(new Error(validation.errors[0] || 'The story contains an unsupported block.'), { code: 'EDITORIAL_DOCUMENT_INVALID' });
  try {
    const data = await invokeEditorialWorkflow({
      action: 'save_revision', postId: post.id, document: validation.document,
      seoTitle: revision.seo_title || '', seoDescription: revision.seo_description || '', editorNote: revision.editor_note || '',
      expectedCurrentRevisionId: post.current_revision_id || null,
      metadata: {
        title: String(post.title || '').trim(), slug: slugifyEditorial(post.slug || post.title),
        summary: String(post.summary || '').trim().slice(0, 500), coverImageUrl: post.cover_image_url || null,
        coverImageAlt: String(post.cover_image_alt || '').trim().slice(0, 240), categoryId: post.category_id || null,
        municipalityId: post.municipality_id || null, assignedEditorUserId: post.assigned_editor_user_id || null,
      },
    });
    await clearEditorialAutosave(post.id);
    return data;
  } catch (revisionError) {
    if (revisionError?.code === 'EDITORIAL_REVISION_CONFLICT' || String(revisionError?.message || '').includes('EDITORIAL_REVISION_CONFLICT')) throw Object.assign(new Error('A newer revision was saved by someone else. Your autosave was preserved; reload and compare before saving again.'), { code: 'EDITORIAL_REVISION_CONFLICT' });
    if (revisionError?.code === 'EDITORIAL_METADATA_INVALID' || String(revisionError?.message || '').includes('EDITORIAL_METADATA_INVALID')) throw Object.assign(new Error('Check the title, slug, cover URL, and other story details.'), { code: 'EDITORIAL_METADATA_INVALID' });
    throw editorialActionError(revisionError, 'save your draft');
  }
}

const WORKFLOW_ACTIONS = Object.freeze({
  submit: 'submit', request_changes: 'request_changes', approve: 'approve', schedule: 'schedule',
  publish: 'publish', start_revision: 'start_revision', archive: 'archive', restore: 'restore_archived', delete: 'delete',
});

export function editorialDirectPublishSteps(status) {
  const normalized = status === 'submitted' ? 'in_review' : status === 'needs_revision' ? 'changes_requested' : status;
  if (['draft', 'changes_requested', 'in_review', 'approved', 'scheduled', 'expired'].includes(normalized)) return ['publish'];
  return [];
}

export async function runEditorialWorkflow(postId, action, options = {}) {
  const edgeAction = WORKFLOW_ACTIONS[action];
  if (!edgeAction) throw new Error('This workflow action is unavailable.');
  const body = { action: edgeAction, postId };
  if (action === 'schedule') body.scheduledFor = options.scheduledFor;
  if (['request_changes', 'approve', 'archive'].includes(action)) body.note = options.note || '';
  try {
    return withStudioStatus(await invokeEditorialWorkflow(body));
  } catch (error) {
    throw editorialActionError(error, action === 'publish' ? 'publish this story' : action === 'archive' ? 'archive this story' : action === 'restore' ? 'restore this story' : action === 'delete' ? 'delete this story' : 'complete that action');
  }
}

export async function restoreEditorialRevision(postId, revisionId) {
  return invokeEditorialWorkflow({ action: 'restore_revision', postId, revisionId });
}
