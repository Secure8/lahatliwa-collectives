export const TEAM_PASSWORD_PATH = '/set-password';

export function teamPasswordRedirectUrl(origin) {
  return new URL(TEAM_PASSWORD_PATH, origin).toString();
}
