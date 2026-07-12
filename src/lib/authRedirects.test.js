import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { TEAM_PASSWORD_PATH, teamPasswordRedirectUrl } from './authRedirects.js';

const root = resolve(import.meta.dirname, '../..');

test('team invitation and recovery callbacks use the public password route', () => {
  assert.equal(TEAM_PASSWORD_PATH, '/set-password');
  assert.equal(teamPasswordRedirectUrl('https://www.lahatliwa.studio'), 'https://www.lahatliwa.studio/set-password');
  assert.equal(teamPasswordRedirectUrl('http://localhost:5173/admin/login'), 'http://localhost:5173/set-password');
});

test('the app and invitation function expose the same set-password destination', () => {
  const app = readFileSync(resolve(root, 'src/App.jsx'), 'utf8');
  const login = readFileSync(resolve(root, 'src/pages/admin/Login.jsx'), 'utf8');
  const setPassword = readFileSync(resolve(root, 'src/pages/SetPassword.jsx'), 'utf8');
  const inviteFunction = readFileSync(resolve(root, 'supabase/functions/invite-team-member/index.ts'), 'utf8');
  assert.match(app, /path="\/set-password"/);
  assert.match(app, /path="\/forgot-password"/);
  assert.match(login, /teamPasswordRedirectUrl\(window\.location\.origin\)/);
  assert.match(inviteFunction, /Deno\.env\.get\('PUBLIC_SITE_URL'\)/);
  assert.match(inviteFunction, /invitationRedirectUrl\(siteUrl\)/);
  assert.doesNotMatch(inviteFunction, /redirectTo\s*=\s*['"]https:\/\/www\.lahatliwa\.studio\/admin\/login/);
  assert.doesNotMatch(setPassword, /supabase\.auth\.onAuthStateChange/);
  assert.match(setPassword, /supabase\.auth\.updateUser\(\{ password \}\)/);
  assert.match(setPassword, /claimSignedInTeamRecord/);
});

test('one application provider owns the Supabase auth subscription', () => {
  const provider = readFileSync(resolve(root, 'src/lib/authSession.jsx'), 'utf8');
  const protectedRoute = readFileSync(resolve(root, 'src/components/ProtectedRoute.jsx'), 'utf8');
  const footer = readFileSync(resolve(root, 'src/components/Footer.jsx'), 'utf8');
  const login = readFileSync(resolve(root, 'src/pages/admin/Login.jsx'), 'utf8');
  assert.match(provider, /supabase\.auth\.onAuthStateChange/);
  [protectedRoute, footer, login].forEach((source) => assert.doesNotMatch(source, /onAuthStateChange|getSession\(\)/));
});

test('authentication password fields use the shared accessible reveal control', () => {
  const passwordField = readFileSync(resolve(root, 'src/components/auth/PasswordField.jsx'), 'utf8');
  const login = readFileSync(resolve(root, 'src/pages/admin/Login.jsx'), 'utf8');
  const setPassword = readFileSync(resolve(root, 'src/pages/SetPassword.jsx'), 'utf8');
  assert.match(passwordField, /type=\{visible \? 'text' : 'password'\}/);
  assert.match(passwordField, /type="button"/);
  assert.match(passwordField, /aria-label=/);
  assert.match(login, /PasswordField/);
  assert.match(setPassword, /PasswordField/);
});
