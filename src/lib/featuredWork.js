import { supabase } from './supabaseClient';

export const FEATURED_WORK_SLOT_COUNT = 6;

const postFields = 'id,creative_member_id,slug,title,summary,status,visibility,moderation_status,published_at,creative_post_media(id,post_id,display_order,thumbnail_url,display_url,expanded_url,alt_text,caption),creative_members(id,name,slug,profile_image_url,role)';

function chosenMedia(request, post) {
  const media = [...(post?.creative_post_media || [])].sort((a, b) => a.display_order - b.display_order);
  return media.find((item) => item.id === request.media_id) || media[0] || null;
}

async function hydrate(requests = []) {
  const ids = [...new Set(requests.map((item) => item.post_id).filter(Boolean))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from('creative_posts').select(postFields).in('id', ids);
  if (error) throw error;
  const posts = new Map((data || []).map((post) => [post.id, post]));
  return requests.map((request) => {
    const post = posts.get(request.post_id);
    return post ? { ...request, post, media: chosenMedia(request, post) } : null;
  }).filter((item) => item?.media);
}

export async function loadFeaturedWorkGallery() {
  const { data, error } = await supabase.from('featured_work_requests').select('*').eq('status', 'approved').order('slot_position');
  if (error) throw error;
  const items = await hydrate(data || []);
  return items.filter(({ post }) => post.status === 'published' && post.visibility === 'public' && post.moderation_status === 'clear');
}

export async function loadFeaturedWorkRequests() {
  const { data, error } = await supabase.from('featured_work_requests').select('*').order('requested_at', { ascending: false });
  if (error) throw error;
  return hydrate(data || []);
}

export async function loadFeaturedEligiblePosts() {
  const { data, error } = await supabase.from('creative_posts').select(postFields)
    .eq('status', 'published').eq('visibility', 'public').eq('moderation_status', 'clear')
    .order('published_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []).filter((post) => post.creative_post_media?.length);
}

export async function loadFeaturedRequestForPost(postId) {
  const { data, error } = await supabase.from('featured_work_requests').select('*').eq('post_id', postId)
    .in('status', ['pending', 'approved']).order('requested_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function requestFeaturedWork(postId, mediaId) {
  const { data, error } = await supabase.rpc('request_featured_work', { p_post_id: postId, p_media_id: mediaId || null, p_note: null });
  if (error) throw error;
  return data;
}

export async function withdrawFeaturedWorkRequest(requestId) {
  const { data, error } = await supabase.rpc('withdraw_featured_work_request', { p_request_id: requestId });
  if (error) throw error;
  return data;
}

export async function reviewFeaturedWorkRequest(requestId, action, slotPosition = null, note = '') {
  const { data, error } = await supabase.rpc('review_featured_work_request', { p_request_id: requestId, p_action: action, p_slot_position: slotPosition, p_admin_note: note || null });
  if (error) throw error;
  return data;
}

export async function setFeaturedWorkSlot(postId, mediaId, slotPosition) {
  const { data, error } = await supabase.rpc('set_featured_work_slot', { p_post_id: postId, p_media_id: mediaId, p_slot_position: slotPosition, p_admin_note: null });
  if (error) throw error;
  return data;
}

export async function clearFeaturedWorkSlot(slotPosition) {
  const { error } = await supabase.rpc('clear_featured_work_slot', { p_slot_position: slotPosition });
  if (error) throw error;
}
