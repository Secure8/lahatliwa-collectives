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

test('public navigation keeps Contact and Privacy in the footer and Sign out accessible', () => {
  const navbar = readFileSync(new URL('../components/Navbar.jsx', import.meta.url), 'utf8');
  const mobile = readFileSync(new URL('../components/MobileTopNavigation.jsx', import.meta.url), 'utf8');
  const navigation = readFileSync(new URL('./publicNavigation.js', import.meta.url), 'utf8');
  const footer = readFileSync(new URL('../components/Footer.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(navigation, /navigation\.contactLabel|\/contact|Mail/);
  assert.doesNotMatch(navbar, /navigation\.privacyLabel|ShieldCheck|\/privacy/);
  assert.doesNotMatch(mobile, /ShieldCheck|\/privacy/);
  assert.match(footer, /to="\/privacy"/);
  assert.match(footer, /Message Lahat Liwa/);
  assert.match(footer, /to="\/inquiry\?kind=platform"/);
  assert.doesNotMatch(navbar, /More pages|public-more-menu|ll-public-menu-action/);
  assert.match(navbar, /<LogOut size=\{19\}/);
  assert.match(navbar, /className="ll-signout-action" aria-label="Sign out" title="Sign out"/);
  assert.match(navbar, /ll-account-action--creative/);
});

test('theme and rectangular actions use the modern shared shapes', () => {
  const appearance = readFileSync(new URL('../components/AppearanceMenuAction.jsx', import.meta.url), 'utf8');
  assert.match(appearance, /ll-theme-switch__track/);
  assert.match(css, /\.ll-theme-switch__knob/);
  assert.match(css, /\.ll-post-card__actions a/);
  assert.match(css, /border-radius: \.8rem/);
});
