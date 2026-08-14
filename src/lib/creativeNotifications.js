import { supabase } from './supabaseClient';

export async function loadCreativeNotifications() {
  const { data, error } = await supabase.from('creative_notifications')
    .select('id,inquiry_id,title,preview,source_path,read_at,created_at,project_inquiries(public_reference,name,client_email,client_phone,organization,summary,details,preferred_contact,preferred_schedule,general_location,budget_range,created_at)')
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

export async function markCreativeNotificationsRead(ids) {
  const values = (ids || []).filter(Boolean);
  if (!values.length) return;
  const { error } = await supabase.from('creative_notifications').update({ read_at: new Date().toISOString() }).in('id', values).is('read_at', null);
  if (error) throw error;
}
