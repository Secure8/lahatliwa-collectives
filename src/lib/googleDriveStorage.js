import { supabase } from './supabaseClient.js';

const RESULT_MESSAGES = Object.freeze({
  connected: { tone: 'success', message: 'Google Drive is connected. Your Lahat Liwa folders are ready.' },
  reconnected: { tone: 'success', message: 'Google Drive access has been restored.' },
  cancelled: { tone: 'error', message: 'Google Drive authorization was cancelled. Nothing changed.' },
  account_in_use: { tone: 'error', message: 'That Google account is already connected to another eligible Lahat Liwa account.' },
  account_mismatch: { tone: 'error', message: 'Reconnect with the same Google account that was originally connected.' },
  missing_refresh_token: { tone: 'error', message: 'Google did not grant offline access. Reconnect and approve the requested access.' },
  scope_missing: { tone: 'error', message: 'The required Google Drive permission was not granted. Reconnect and approve Drive access.' },
  folder_missing: { tone: 'error', message: 'The managed Lahat Liwa folder is unavailable. Restore it in Drive, then reconnect.' },
  folder_ambiguous: { tone: 'error', message: 'Multiple managed Lahat Liwa folders were found. Contact the Super Admin before reconnecting.' },
  state_expired: { tone: 'error', message: 'The secure Google authorization request expired or was already used. Start again.' },
  state_invalid: { tone: 'error', message: 'The Google authorization request could not be verified. Start again.' },
  provider_error: { tone: 'error', message: 'Google Drive could not finish connecting. Please try again.' },
  configuration_error: { tone: 'error', message: 'Google Drive connection is not configured on the server yet.' },
});

export function consumeGoogleDriveOAuthResult(location = window.location, history = window.history) {
  const url = new URL(location.href);
  const code = url.searchParams.get('storage_oauth') || '';
  if (!code) return null;
  url.searchParams.delete('storage_oauth');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return RESULT_MESSAGES[code] || RESULT_MESSAGES.provider_error;
}

async function invoke(functionName, body) {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    let context = null;
    try { context = await error.context?.json(); } catch { context = null; }
    const failure = new Error(context?.message || error.message || 'The storage service could not complete the request.');
    failure.code = context?.code || 'STORAGE_SERVICE_ERROR';
    throw failure;
  }
  if (!data?.success) {
    const failure = new Error(data?.message || 'The storage service could not complete the request.');
    failure.code = data?.code || 'STORAGE_SERVICE_ERROR';
    throw failure;
  }
  return data;
}

export function getGoogleDriveConnectionStatus() {
  return invoke('google-drive-connection-check', { action: 'status' });
}

export function verifyGoogleDriveConnection() {
  return invoke('google-drive-connection-check', { action: 'verify' });
}

export async function startGoogleDriveConnection(connectionId = '') {
  const data = await invoke('google-drive-oauth-start', {
    returnPath: '/admin/storage',
    ...(connectionId ? { connectionId, forceConsent: true } : {}),
  });
  const destination = new URL(data.authorizationUrl);
  if (destination.origin !== 'https://accounts.google.com') throw new Error('The Google authorization destination is invalid.');
  window.location.assign(destination.toString());
}

export function disconnectGoogleDriveConnection(connectionId) {
  return invoke('google-drive-disconnect', { connectionId, confirmation: 'DISCONNECT_GOOGLE_DRIVE' });
}

export const GOOGLE_DRIVE_TEST_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

export function validateGoogleDriveTestFile(file) {
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
  if (!file) throw new Error('Choose one file to upload.');
  if (!allowed.has(file.type)) throw new Error('Choose a JPEG, PNG, WebP, or PDF file.');
  if (file.size <= 0 || file.size > GOOGLE_DRIVE_TEST_UPLOAD_MAX_BYTES) throw new Error('The test file must be larger than 0 bytes and no more than 2 MB.');
  return file;
}

export function uploadGoogleDriveTestFile(file) {
  validateGoogleDriveTestFile(file);
  const body = new FormData();
  body.append('file', file, file.name);
  body.append('purpose', 'admin_test_upload');
  return invoke('google-drive-upload', body);
}

export function googleDriveStatusLabel(status) {
  return ({
    connected: 'Connected', reconnect_required: 'Reconnect required', error: 'Attention needed',
    pending: 'Pending', revoked: 'Disconnected', disabled: 'Disconnected',
  })[status] || 'Not connected';
}
