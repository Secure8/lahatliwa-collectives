import { supabase } from './supabaseClient.js';

async function invoke(functionName, body) {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    let context = null; try { context = await error.context?.json(); } catch { context = null; }
    throw Object.assign(new Error(context?.message || error.message || 'The storage operation failed.'), { code: context?.code || 'STORAGE_OPERATION_FAILED' });
  }
  if (!data?.success) throw Object.assign(new Error(data?.message || 'The storage operation failed.'), { code: data?.code || 'STORAGE_OPERATION_FAILED' });
  return data;
}

export const fetchStorageGovernanceDashboard = () => invoke('storage-governance', { action: 'dashboard' });
export const updateStoragePolicy = (policy) => invoke('storage-governance', { action: 'update_policy', policy });
export const pausePublicMediaMigration = () => invoke('storage-governance', { action: 'pause_migration' });
export const resumePublicMediaMigration = () => invoke('storage-governance', { action: 'resume_migration' });
export const listPublicMediaMigrations = (options = {}) => invoke('storage-governance', { action: 'list_migrations', ...options });
export const inspectPublicMediaMigration = (id) => invoke('storage-governance', { action: 'inspect_migration', id });
export const retryPublicMediaMigration = (id) => invoke('storage-governance', { action: 'retry_migration', id });
export const markPublicMediaMigrationManualReview = (id, reason) => invoke('storage-governance', { action: 'mark_manual_review', id, reason });
export const verifyPublicMediaMigration = (id) => invoke('storage-governance', { action: 'verify_migration', id });
export const discoverPublicMediaMigration = (limit = 50) => invoke('public-media-migration', { action: 'discover', limit });
export const processPublicMediaMigrationBatch = (limit) => invoke('public-media-migration', { action: 'process_batch', ...(limit ? { limit } : {}) });
export async function reconcilePublicMediaProviders() {
  const [r2, supabaseResult] = await Promise.all([
    invoke('public-media-migration', { action: 'reconcile' }),
    invoke('supabase-media-reconciliation', { action: 'reconcile' }),
  ]);
  return { success: true, providers: { r2: r2.result, supabase: supabaseResult.result } };
}
