import { createWebsiteImageDerivatives } from './imageCompression.js';
import { STORAGE_FEATURE_FLAGS } from './storageFeatureFlags.js';
import { supabase } from './supabaseClient.js';

let capabilityPromise = null;
const uploadReceipts = new Map();

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('r2-media', { body });
  if (error) {
    let context = null; try { context = await error.context?.json(); } catch { context = null; }
    const failure = new Error(context?.message || error.message || 'The website media service could not complete the request.');
    failure.code = context?.code || 'MEDIA_SERVICE_ERROR';
    throw failure;
  }
  if (!data?.success) throw Object.assign(new Error(data?.message || 'The website media service could not complete the request.'), { code: data?.code || 'MEDIA_SERVICE_ERROR' });
  return data;
}

export async function managedMediaAvailable() {
  if (!STORAGE_FEATURE_FLAGS.r2MediaEnabled) return false;
  capabilityPromise ||= invoke({ action: 'capability' }).then((result) => result.enabled === true).catch(() => false);
  return capabilityPromise;
}

export async function uploadManagedWebsiteImage(file, { category, projectId = '', creativeMemberId = '', onStatus } = {}) {
  if (!await managedMediaAvailable()) return null;
  const derivatives = await createWebsiteImageDerivatives(file, { label: 'Website image', onStatus });
  const started = await invoke({
    action: 'initiate', category,
    ...(projectId ? { projectId } : {}),
    ...(creativeMemberId ? { creativeMemberId } : {}),
    variants: derivatives.map(({ variant, mimeType, sizeBytes, width, height }) => ({ variant, mimeType, sizeBytes, width, height })),
  });
  const groupId = started.upload?.groupId;
  try {
    for (const upload of started.upload?.uploads || []) {
      const derivative = derivatives.find((item) => item.variant === upload.variant);
      if (!derivative) throw new Error('A prepared image size is missing.');
      onStatus?.({ phase: 'uploading', message: `Uploading ${upload.variant} image…`, variant: upload.variant });
      const form = new FormData();
      form.append('mediaId', upload.mediaId);
      form.append('groupId', groupId);
      form.append('file', derivative.file, `${upload.variant}.webp`);
      const { data, error } = await supabase.functions.invoke('r2-media-upload', { body: form });
      if (error || !data?.success) throw new Error(data?.message || error?.message || 'A website image size could not be uploaded.');
    }
    const finalized = await invoke({ action: 'finalize', groupId });
    uploadReceipts.set(finalized.media.primaryUrl, { groupId, media: finalized.media });
    return finalized.media;
  } catch (error) {
    if (groupId) await invoke({ action: 'cancel', groupId }).catch(() => null);
    throw error;
  }
}

export async function commitManagedMediaReplacement(newUrl, oldUrl) {
  if (!newUrl || newUrl === oldUrl) return { queued: 0 };
  const receipt = uploadReceipts.get(newUrl);
  if (!receipt) {
    if (oldUrl) return requestManagedMediaDeletion(oldUrl);
    return { queued: 0 };
  }
  try {
    const result = await invoke({ action: 'commit_replacement', groupId: receipt.groupId, oldUrl: oldUrl || '' });
    uploadReceipts.delete(newUrl);
    return result;
  } catch (error) {
    if (error.code === 'REPLACEMENT_NOT_AVAILABLE' || error.code === 'MEDIA_NOT_FOUND') return { queued: 0 };
    throw error;
  }
}

export async function requestManagedMediaDeletion(publicUrl) {
  if (!publicUrl || !/^https:\/\//i.test(publicUrl)) return { queued: 0 };
  try { return await invoke({ action: 'request_delete', publicUrl }); }
  catch (error) {
    if (['MEDIA_NOT_FOUND','R2_MEDIA_DISABLED'].includes(error.code)) return { queued: 0 };
    throw error;
  }
}

export async function prepareManagedProjectDeletion(projectId) {
  if (!projectId) return { count: 0, authorization: null };
  try { return await invoke({ action: 'prepare_project_delete', projectId }); }
  catch (error) {
    if (error.code === 'MEDIA_LOOKUP_FAILED') throw error;
    if (error.code === 'R2_MEDIA_DISABLED') throw new Error('Managed media cleanup is not configured, so this project cannot be safely deleted.');
    throw error;
  }
}

export async function finalizeManagedProjectDeletion(projectId, authorization) {
  if (!projectId || !authorization) return { queued: 0 };
  return invoke({ action: 'finalize_project_delete', projectId, authorization });
}

export function managedMediaReceipt(url) {
  return uploadReceipts.get(url) || null;
}
