const callbackKeys = ['code', 'token', 'token_hash', 'access_token', 'refresh_token', 'error', 'error_code'];

export function readAuthCallback(locationLike) {
  const pathname = locationLike?.pathname || '';
  const search = new URLSearchParams(locationLike?.search || '');
  const hash = new URLSearchParams(String(locationLike?.hash || '').replace(/^#/, ''));
  const value = (key) => search.get(key) || hash.get(key) || '';
  const type = value('type');
  const hasEvidence = callbackKeys.some((key) => value(key)) || ['invite', 'recovery'].includes(type);
  return {
    isPasswordRoute: pathname === '/set-password',
    hasEvidence,
    type,
    code: value('code'),
    tokenHash: value('token_hash') || value('token'),
    accessToken: value('access_token'),
    refreshToken: value('refresh_token'),
    error: value('error') || value('error_code'),
    complete: search.get('complete') === '1',
  };
}

export function initialAuthFlow(callback) {
  if (!callback.isPasswordRoute) return 'none';
  if (callback.complete) return 'complete';
  if (callback.error || !callback.hasEvidence) return 'invalid';
  return callback.type === 'recovery' ? 'processing-recovery' : 'processing-invite';
}

export function dashboardRedirectAllowed(authFlow) {
  return authFlow === 'none';
}
