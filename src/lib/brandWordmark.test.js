import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { brandWordmarkLengthClass, isBrandWordmarkText, normalizeBrandWordmark } from './brandWordmark.js';

test('brand wordmark helpers preserve CMS text and handle compact long names', () => {
  assert.equal(normalizeBrandWordmark('  Lahat   Liwa  '), 'Lahat Liwa');
  assert.equal(normalizeBrandWordmark('', 'Fallback Collective'), 'Fallback Collective');
  assert.equal(brandWordmarkLengthClass('Lahat Liwa'), '');
  assert.equal(brandWordmarkLengthClass('A Longer Collective Name'), 'brand-wordmark--long');
  assert.equal(brandWordmarkLengthClass('An Exceptionally Long Custom Collective Brand Name'), 'brand-wordmark--very-long');
});

test('only an exact configured brand heading becomes a display wordmark', () => {
  assert.equal(isBrandWordmarkText('Lahat Liwa', 'Lahat Liwa'), true);
  assert.equal(isBrandWordmarkText('Lahat Liwa Collectives', 'Lahat Liwa'), true);
  assert.equal(isBrandWordmarkText('Lahat Liwa Collectives', 'Liwa Digital', ['Lahat Liwa']), true);
  assert.equal(isBrandWordmarkText('Build your next idea', 'Lahat Liwa'), false);
  assert.equal(isBrandWordmarkText('The people shaping Lahat Liwa', 'Lahat Liwa'), false);
});

test('shared wordmark keeps CMS branding, logo support, and accessible placement contracts', async () => {
  const [component, navbar, footer, adminLayout, login, forgotPassword, setPassword, protectedRoute, creativeHero, projectDetails, home, css, html] = await Promise.all([
    readFile(new URL('../components/BrandWordmark.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/Navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/Footer.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminLayout.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/admin/Login.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/ForgotPassword.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/SetPassword.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/ProtectedRoute.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/CreativeHero.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/ProjectDetails.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/Home.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../index.css', import.meta.url), 'utf8'),
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
  ]);

  assert.match(component, /name \?\? content\.displayName/);
  assert.match(component, /usePublicContent\(\[\]\)/);
  assert.doesNotMatch(component, /Lahat Liwa/);
  assert.match(navbar, /<nav/);
  assert.match(navbar, /aria-label=\{`\$\{content\.displayName\} home`\}/);
  assert.match(navbar, /content\.logoUrl \? \([\s\S]*?<BrandLogo src=\{content\.logoUrl\} alt=\{content\.logoAlt\}/);
  assert.match(navbar, /<BrandWordmark name=\{content\.displayName\} variant="compact" mobileVariant="mobile-compact"/);
  assert.match(navbar, /aria-controls="public-mobile-navigation"/);
  assert.match(navbar, /id="public-mobile-navigation"/);
  assert.match(footer, /<BrandWordmark name=\{content\.displayName\} variant="footer" to="\/"/);
  assert.match(adminLayout, /<BrandWordmark name=\{content\.displayName\} variant="admin" mobileVariant="mobile-compact"/);
  assert.match(login, /<BrandWordmark variant="auth" to="\/"/);
  assert.match(forgotPassword, /<BrandWordmark variant="auth" to="\/"/);
  assert.match(setPassword, /<BrandWordmark variant="auth" to="\/"/);
  assert.match(protectedRoute, /<BrandWordmark variant="auth" to="\/"/);
  assert.match(creativeHero, /<BrandWordmark variant="eyebrow"/);
  assert.match(projectDetails, /Published under <BrandWordmark name=\{content\.displayName\} variant="inline"/);
  assert.match(home, /isBrandWordmarkText\(content\.home\.heroTitle, content\.displayName, \[defaultSiteContent\.displayName, defaultSiteContent\.legalName\]\)/);
  assert.match(css, /color: var\(--brand-wordmark-fill\)/);
  assert.match(css, /var\(--brand-wordmark-accent, var\(--site-brand-accent, #f6d58b\)\)/);
  assert.match(css, /\[data-theme="light"\] \.brand-wordmark/);
  assert.match(component, /variant = 'standard'/);
  assert.match(component, /mobileVariant && `brand-wordmark--\$\{mobileVariant\}`/);
  assert.match(component, /if \(to\) return <Link to=\{to\}/);
  assert.match(css, /\.brand-wordmark \{[\s\S]*?font-family: "Chakra Petch", "Trebuchet MS", "Arial Narrow", Arial, ui-sans-serif, system-ui, sans-serif[\s\S]*?text-shadow: none;/);
  assert.match(css, /\.brand-wordmark--hero \{[\s\S]*?font-family: "Chakra Petch", "Trebuchet MS", "Arial Narrow", Arial, ui-sans-serif, system-ui, sans-serif;[\s\S]*?font-weight: 600/);
  assert.match(css, /\.brand-wordmark--auth \{[\s\S]*?font-family: "Chakra Petch", "Trebuchet MS", "Arial Narrow", Arial, ui-sans-serif, system-ui, sans-serif;[\s\S]*?font-weight: 600/);
  assert.match(css, /@media \(min-width: 768px\) \{[\s\S]*?\.brand-wordmark--hero,[\s\S]*?\.brand-wordmark--auth \{[\s\S]*?font-family: "Rubik 80s Fade", "Chakra Petch", "Trebuchet MS", "Arial Narrow", Arial, ui-sans-serif, system-ui, sans-serif;[\s\S]*?font-weight: 400/);
  assert.match(css, /\.brand-wordmark--compact \{[\s\S]*?font-size: 0\.96rem/);
  assert.match(css, /\.brand-wordmark--footer \{[\s\S]*?font-size: clamp\(1\.15rem, 2\.3vw, 1\.45rem\)/);
  assert.match(css, /@media \(max-width: 639px\) \{[\s\S]*?\.brand-wordmark--mobile-compact \{[\s\S]*?font-size: 0\.84rem/);
  assert.match(css, /\.brand-wordmark--mobile-compact\.brand-wordmark--very-long \{[\s\S]*?font-size: 0\.8rem/);
  assert.match(css, /body \{[\s\S]*?min-width: 0;/);
  assert.match(html, /family=Chakra\+Petch:wght@600&family=Rubik\+80s\+Fade&display=swap/);
  assert.doesNotMatch(`${css}\n${html}`, /Orbitron/);
});
