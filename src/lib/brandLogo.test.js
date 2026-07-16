import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('shared adaptive logo preserves the source image and accessible metadata', async () => {
  const [component, css] = await Promise.all([
    readFile(new URL('../components/BrandLogo.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
  ]);

  assert.match(component, /if \(!src\) return null/);
  assert.match(component, /src=\{src\}/);
  assert.match(component, /alt=\{alt \|\| 'Site logo'\}/);
  assert.match(component, /data-brand-logo=\{variant\}/);
  assert.doesNotMatch(component, /useTheme|data-theme|lightLogo|darkLogo/);
  const wrapperRule = css.slice(css.indexOf('.brand-logo {'), css.indexOf('.brand-logo--admin'));
  const logoRules = css.slice(css.indexOf('.brand-logo {'), css.indexOf('.brand-wordmark {'));
  assert.doesNotMatch(wrapperRule, /background|border|box-shadow|padding|border-radius/);
  assert.match(css, /\.brand-logo__image \{[\s\S]*?filter: drop-shadow\(0 1px 1px rgb\(255 255 255 \/ 0\.14\)\) drop-shadow\(0 0 2px rgb\(255 174 0 \/ 0\.08\)\);/);
  assert.match(css, /\[data-theme="light"\] \.brand-logo__image \{[\s\S]*?filter: drop-shadow\(0 1px 1px rgb\(24 24 27 \/ 0\.45\)\) drop-shadow\(0 0 2px rgb\(24 24 27 \/ 0\.28\)\);/);
  assert.doesNotMatch(logoRules, /mix-blend-mode|invert\(|brightness\(|contrast\(|::before|::after/);
});

test('custom logos use one shared component without changing header structures', async () => {
  const [navbar, adminLayout, wordmark] = await Promise.all([
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/BrandWordmark.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(navbar, /<Link to="\/"[\s\S]*?aria-label=\{`\$\{content\.displayName\} home`\}/);
  assert.match(navbar, /content\.logoUrl \? \([\s\S]*?<BrandLogo src=\{content\.logoUrl\} alt=\{content\.logoAlt\}/);
  assert.match(navbar, /aria-controls="public-mobile-navigation"/);
  assert.match(navbar, /id="public-mobile-navigation"/);
  assert.match(adminLayout, /content\.logoUrl \?[\s\S]*?<BrandLogo src=\{content\.logoUrl\} alt=\{content\.logoAlt\} variant="admin"/);
  assert.match(adminLayout, /aria-label=\{`\$\{content\.displayName\} admin dashboard`\}/);
  assert.match(adminLayout, /aria-controls="admin-mobile-navigation"/);
  assert.doesNotMatch(wordmark, /BrandLogo|brand-logo/);
});

test('the same logo image remains mounted while CSS adapts between themes', async () => {
  const component = await readFile(new URL('../components/BrandLogo.jsx', import.meta.url), 'utf8');

  assert.equal((component.match(/<img/g) || []).length, 1);
  assert.equal((component.match(/src=\{src\}/g) || []).length, 1);
  assert.doesNotMatch(component, /theme ===|resolvedTheme|picture|source/);
});
