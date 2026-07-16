import { supabase } from './supabaseClient.js';

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('storage-governance', { body });
  if (error) {
    let context = null;
    try { context = await error.context?.json(); } catch { context = null; }
    throw Object.assign(new Error(context?.message || error.message || 'The storage operation failed.'), { code: context?.code || 'STORAGE_OPERATION_FAILED' });
  }
  if (!data?.success) throw Object.assign(new Error(data?.message || 'The storage operation failed.'), { code: data?.code || 'STORAGE_OPERATION_FAILED' });
  return data;
}

export const fetchStorageGovernanceDashboard = () => invoke({ action: 'dashboard' });
export const updateStoragePolicy = (policy) => invoke({ action: 'update_policy', policy });
