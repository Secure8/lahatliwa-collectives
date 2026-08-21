import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('login uses the dedicated V2 interface without changing authentication flows', async () => {
  const [login, passwordField, css] = await Promise.all([
    readFile(new URL('../pages/admin/Login.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/auth/PasswordField.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);

  assert.match(login, /ll-auth-page ll-login-page/);
  assert.match(login, /ll-auth-card ll-login-card/);
  assert.match(login, /ll-login-heading__icon/);
  assert.match(login, /ll-login-input/);
  assert.match(login, /ll-login-submit/);
  assert.match(login, /supabase\.auth\.signInWithPassword/);
  assert.match(login, /claimSignedInTeamRecord/);
  assert.match(login, /supabase\.auth\.signUp/);
  assert.match(passwordField, /leadingIcon/);
  assert.match(passwordField, /ll-password-field__leading/);
  assert.match(css, /--ll-login-orange: #f3a257/);
  assert.match(css, /--ll-login-green: #253122/);
  assert.match(css, /--ll-login-gray: #b6bfc1/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.ll-login-card/);
});
