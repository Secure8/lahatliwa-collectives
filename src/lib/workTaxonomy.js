import { supabase } from './supabaseClient.js';

export const WORK_TAXONOMY_KINDS = Object.freeze(['discipline', 'specialty', 'industry']);
export const WORK_AVAILABILITY = Object.freeze([
  { value: 'available', label: 'Available for work' },
  { value: 'limited', label: 'Limited availability' },
  { value: 'unavailable', label: 'Not currently available' },
]);

export function normalizeWorkMetadata(value = {}) {
  const year = Number(value.work_year);
  return {
    title: String(value.title || '').trim().slice(0, 140),
    summary: String(value.summary || '').trim().slice(0, 320),
    work_year: Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : null,
    external_url: /^https:\/\//i.test(String(value.external_url || '').trim()) ? String(value.external_url).trim() : null,
    tags: [...new Set((Array.isArray(value.tags) ? value.tags : String(value.tags || '').split(',')).map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))].slice(0, 12),
  };
}

export function groupWorkTaxonomy(terms = []) {
  return WORK_TAXONOMY_KINDS.reduce((groups, kind) => ({ ...groups, [kind]: terms.filter((term) => term.kind === kind) }), {});
}

export async function loadWorkTaxonomy() {
  const { data, error } = await supabase.from('creative_taxonomy_terms').select('id,kind,name,slug,sort_order').eq('is_active', true).order('kind').order('sort_order').order('name');
  if (error) throw new Error(error.message || 'Work filters could not be loaded.');
  return data || [];
}

export async function loadWorkTermIds(postId) {
  if (!postId) return [];
  const { data, error } = await supabase.from('creative_post_taxonomy').select('term_id').eq('post_id', postId);
  if (error) throw new Error(error.message || 'Work categories could not be loaded.');
  return (data || []).map((row) => row.term_id);
}

export async function loadMemberTermIds(creativeMemberId) {
  if (!creativeMemberId) return [];
  const { data, error } = await supabase.from('creative_member_taxonomy').select('term_id').eq('creative_member_id', creativeMemberId);
  if (error) throw new Error(error.message || 'Creative categories could not be loaded.');
  return (data || []).map((row) => row.term_id);
}

export async function saveMemberTaxonomy(creativeMemberId, termIds = []) {
  const { error: removeError } = await supabase.from('creative_member_taxonomy').delete().eq('creative_member_id', creativeMemberId);
  if (removeError) throw new Error(removeError.message || 'Creative categories could not be updated.');
  const uniqueIds = [...new Set(termIds)].filter(Boolean);
  if (!uniqueIds.length) return [];
  const rows = uniqueIds.map((termId) => ({ creative_member_id: creativeMemberId, term_id: termId }));
  const { data, error } = await supabase.from('creative_member_taxonomy').insert(rows).select('term_id');
  if (error) throw new Error(error.message || 'Creative categories could not be updated.');
  return data || [];
}

export async function saveWorkMetadata(postId, metadata, termIds = []) {
  const normalized = normalizeWorkMetadata(metadata);
  const { data, error } = await supabase.from('creative_posts').update(normalized).eq('id', postId).select('*').single();
  if (error) throw new Error(error.message || 'Work details could not be saved.');
  const { error: removeError } = await supabase.from('creative_post_taxonomy').delete().eq('post_id', postId);
  if (removeError) throw new Error(removeError.message || 'Work categories could not be updated.');
  const uniqueIds = [...new Set(termIds)].filter(Boolean);
  if (uniqueIds.length) {
    const { error: insertError } = await supabase.from('creative_post_taxonomy').insert(uniqueIds.map((termId) => ({ post_id: postId, term_id: termId })));
    if (insertError) throw new Error(insertError.message || 'Work categories could not be updated.');
  }
  return data;
}
