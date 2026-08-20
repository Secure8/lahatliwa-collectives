import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const iconAction = readFileSync(new URL('../components/IconLabelAction.jsx', import.meta.url), 'utf8');

test('shared action families use one control language', () => {
  assert.match(css, /Unified action language/);
  assert.match(css, /\.ll-icon-label-action > span/);
  assert.match(css, /\[data-admin-control\]\[data-variant="danger"\]/);
});

test('icon and label actions expose a readable label and visual tone', () => {
  assert.match(iconAction, /aria-label=\{label\}/);
  assert.match(iconAction, /data-tone=\{tone\}/);
  assert.match(iconAction, /<small>\{label\}<\/small>/);
});

test('public navigation keeps secondary pages direct and Sign out accessible', () => {
  const navbar = readFileSync(new URL('../components/Navbar.jsx', import.meta.url), 'utf8');
  assert.match(navbar, /navigation\.contactLabel \|\| 'Contact'/);
  assert.match(navbar, /navigation\.privacyLabel \|\| 'Privacy'/);
  assert.doesNotMatch(navbar, /More pages|public-more-menu|ll-public-menu-action/);
  assert.match(navbar, /<LogOut size=\{19\}/);
  assert.match(navbar, />Sign out<\/span>/);
});
