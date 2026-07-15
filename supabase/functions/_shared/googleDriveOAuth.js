export const GOOGLE_DRIVE_SCOPES = Object.freeze([
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
]);

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const OAUTH_STATE_TTL_SECONDS = 600;
export const SAFE_STORAGE_RETURN_PATH = '/admin/storage';

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function randomBase64Url(size = 32, cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.getRandomValues) throw new Error('Secure random generation is unavailable.');
  return bytesToBase64Url(cryptoApi.getRandomValues(new Uint8Array(size)));
}

export async function sha256Base64Url(value, cryptoApi = globalThis.crypto) {
  if (!cryptoApi?.subtle) throw new Error('Secure hashing is unavailable.');
  const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode(String(value)));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function normalizeReturnPath(value) {
  if (!value) return SAFE_STORAGE_RETURN_PATH;
  try {
    const url = new URL(String(value), 'https://return-path.invalid');
    return url.origin === 'https://return-path.invalid' && url.pathname === SAFE_STORAGE_RETURN_PATH
      ? url.pathname
      : SAFE_STORAGE_RETURN_PATH;
  } catch {
    return SAFE_STORAGE_RETURN_PATH;
  }
}

export function normalizeSiteOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.origin : '';
  } catch {
    return '';
  }
}

export function oauthConfiguration(env = {}) {
  const enabled = String(env.GOOGLE_DRIVE_OAUTH_ENABLED || '').toLowerCase() === 'true';
  const clientId = String(env.GOOGLE_DRIVE_CLIENT_ID || '').trim();
  const clientSecret = String(env.GOOGLE_DRIVE_CLIENT_SECRET || '').trim();
  const redirectUri = String(env.GOOGLE_DRIVE_REDIRECT_URI || '').trim();
  let validRedirect = false;
  try { validRedirect = ['http:', 'https:'].includes(new URL(redirectUri).protocol); } catch { validRedirect = false; }
  return {
    enabled,
    clientId,
    clientSecret,
    redirectUri,
    configured: enabled && Boolean(clientId && clientSecret && validRedirect),
  };
}

export function buildGoogleAuthorizationUrl({ clientId, redirectUri, state, codeChallenge, forceConsent = false }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_DRIVE_SCOPES.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  if (forceConsent) params.set('prompt', 'consent');
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function parseGrantedScopes(value) {
  return [...new Set(String(value || '').split(/\s+/).filter(Boolean))].sort();
}

export function hasRequiredGoogleScopes(value) {
  const scopes = new Set(Array.isArray(value) ? value : parseGrantedScopes(value));
  return scopes.has('openid')
    && (scopes.has('email') || scopes.has('https://www.googleapis.com/auth/userinfo.email'))
    && (scopes.has('profile') || scopes.has('https://www.googleapis.com/auth/userinfo.profile'))
    && scopes.has(GOOGLE_DRIVE_SCOPE);
}

export function validateOAuthStateRecord(record, now = new Date()) {
  if (!record || record.consumed_at) return { ok: false, code: 'OAUTH_STATE_REUSED' };
  const expiresAt = Date.parse(record.expires_at || '');
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return { ok: false, code: 'OAUTH_STATE_EXPIRED' };
  if (!record.owner_user_id || !record.pkce_verifier) return { ok: false, code: 'OAUTH_STATE_INVALID' };
  return { ok: true };
}

export function isRecentSessionJwt(jwt, maxAgeSeconds = 900, nowSeconds = Math.floor(Date.now() / 1000)) {
  try {
    const payloadPart = String(jwt || '').split('.')[1];
    if (!payloadPart) return false;
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadPart.length / 4) * 4, '=');
    const payload = JSON.parse(atob(base64));
    const authenticationTimes = Array.isArray(payload.amr)
      ? payload.amr.map((entry) => Number(entry?.timestamp)).filter(Number.isFinite)
      : [];
    const authenticatedAt = authenticationTimes.length ? Math.max(...authenticationTimes) : Number(payload.iat);
    return Number.isFinite(authenticatedAt) && authenticatedAt <= nowSeconds + 60 && nowSeconds - authenticatedAt <= maxAgeSeconds;
  } catch {
    return false;
  }
}

export function safeOAuthResultCode(value) {
  const allowed = new Set([
    'connected', 'reconnected', 'cancelled', 'account_in_use', 'account_mismatch',
    'missing_refresh_token', 'scope_missing', 'folder_missing', 'folder_ambiguous',
    'state_expired', 'state_invalid', 'provider_error', 'configuration_error',
  ]);
  return allowed.has(value) ? value : 'provider_error';
}
