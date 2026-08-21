import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defaultSiteContent, SITE_TAGLINE } from '../data/siteContent.js';
import { BRANCH_INQUIRY_COPY, SERVICE_BRANCHES } from './serviceRequest.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path) => readFileSync(resolve(root, path), 'utf8');

test('the approved tagline remains exact in the public defaults', () => {
  assert.equal(SITE_TAGLINE, 'Build your presence. Shape your story.');
  assert.equal(defaultSiteContent.tagline, SITE_TAGLINE);
});

test('public positioning serves clients and published creatives without agency claims', () => {
  const home = source('pages/Home.jsx');
  const feed = source('components/CreativeFeed.jsx');
  const about = source('pages/About.jsx');
  const creatives = source('pages/Creatives.jsx');
  const footer = source('components/Footer.jsx');

  assert.match(home, /Work worth discovering/i);
  assert.match(feed, /Selected work/i);
  assert.match(about, /content\.displayName.*rooted in Aklan/i);
  assert.match(about, /does not automatically mean employment/i);
  assert.match(about, /Built from Aklan/i);
  assert.match(creatives, /people behind the work/i);
  assert.match(footer, /content\.tagline/);

  const publicCopy = [home, about, creatives, footer, source('pages/Services.jsx'), source('pages/Projects.jsx')].join('\n');
  assert.doesNotMatch(publicCopy, /full[- ]service agency|staffed departments|industry[- ]leading|guaranteed jobs|all creatives are (?:employees|staff)/i);
});

test('service branches stay distinct and inquiry copy frames creative selection as a preference', () => {
  assert.deepEqual(SERVICE_BRANCHES.map((branch) => branch.key), ['studio', 'tech', 'digital', 'social']);
  assert.equal(new Set(SERVICE_BRANCHES.map((branch) => branch.description)).size, 4);

  for (const branch of ['studio', 'digital', 'social', 'tech', 'general']) {
    const copy = BRANCH_INQUIRY_COPY[branch];
    assert.match(copy.recipientHelper, /preference/i);
    assert.match(copy.recipientHelper, /does not guarantee availability or assignment/i);
    assert.match(copy.teamOption, /General .*(?:request|inquiry)/i);
    assert.match(copy.confirmationTitle, /received/i);
    assert.doesNotMatch(copy.confirmationTitle, /safely with the team|safely with the collective/i);
  }
});

test('legacy project compatibility and Creative profiles preserve attribution and direct inquiry', () => {
  const projects = source('pages/Projects.jsx');
  const details = source('pages/ProjectDetails.jsx');
  const profile = source('components/CreativeProfileView.jsx');

  assert.match(projects, /project portfolio/);
  assert.match(details, /Published a formal project/);
  assert.match(details, /Credited contributors/);
  assert.match(profile, /Work with \{creative\.name\}/);
  assert.match(profile, /Direct inquiry/);
});

test('public brand names remain CMS-driven and custom logo behavior stays separate', () => {
  const collectiveHero = source('components/CollectiveHero.jsx');
  const about = source('pages/About.jsx');
  const creatives = source('pages/Creatives.jsx');
  const footer = source('components/Footer.jsx');

  assert.match(collectiveHero, /content\.displayName/);
  assert.match(about, /content\.displayName/);
  assert.match(creatives, /content\.displayName/);
  assert.match(footer, /content\.footerLogoUrl \|\| defaultFooterLogo/);
  assert.match(footer, /content\.displayName \|\| 'Liwa Collectives'/);
  assert.match(source('components/BrandLogo.jsx'), /src=\{src\}/);
});

test('footer contact and confirmation copy explain the correct next step', () => {
  const footer = source('components/Footer.jsx');
  const app = source('App.jsx');
  const confirmation = source('pages/InquiryConfirmation.jsx');

  assert.match(footer, /Message Lahat Liwa/);
  assert.match(footer, /\/inquiry\?kind=platform/);
  assert.match(app, /path="\/contact" element=\{<Navigate to="\/inquiry\?kind=platform" replace \/>\}/);
  assert.equal(existsSync(resolve(root, 'pages/Contact.jsx')), false);
  assert.match(confirmation, /identify the right next step/i);
  assert.match(confirmation, /does not confirm availability, scope, schedule, pricing, booking/i);
});

test('public page eyebrows use the current muted text-only label style', () => {
  const header = source('components/PublicPageHeader.jsx');

  assert.match(header, /className="accent-eyebrow[^"']*text-\[var\(--theme-text-muted\)\]/);
  assert.doesNotMatch(header, /rounded-full bg-current/);
  assert.doesNotMatch(header, /--accent-eyebrow-configured/);
});
