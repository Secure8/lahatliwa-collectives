import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  const about = source('pages/About.jsx');
  const creatives = source('pages/Creatives.jsx');
  const footer = source('components/Footer.jsx');

  assert.match(home, /four Liwa branches/i);
  assert.match(home, /published creatives/i);
  assert.match(about, /independently operated/i);
  assert.match(about, /does not automatically mean being employed/i);
  assert.match(about, /Built from Aklan/i);
  assert.match(creatives, /published creatives and credited work/i);
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
    assert.match(copy.teamOption, /General .*request/i);
    assert.match(copy.confirmationTitle, /received/i);
    assert.doesNotMatch(copy.confirmationTitle, /safely with the team|safely with the collective/i);
  }
});

test('public project and profile copy emphasizes publication and contributor credit', () => {
  const projects = source('pages/Projects.jsx');
  const details = source('pages/ProjectDetails.jsx');
  const profile = source('components/CreativeProfileView.jsx');

  assert.match(projects, /Published work and credited contributions/);
  assert.match(details, /Published through <BrandWordmark name=\{content\.displayName\}/);
  assert.match(details, /Credited contributors/);
  assert.match(profile, /does not guarantee availability or assignment/);
  assert.match(profile, />Inquire <ArrowRight/);
});

test('public brand names remain CMS-driven and custom logo behavior stays separate', () => {
  const home = source('pages/Home.jsx');
  const about = source('pages/About.jsx');
  const creatives = source('pages/Creatives.jsx');
  const footer = source('components/Footer.jsx');

  assert.match(home, /content\.displayName/);
  assert.match(about, /content\.displayName/);
  assert.match(creatives, /content\.displayName/);
  assert.match(footer, /name=\{content\.displayName\}/);
  assert.match(source('components/BrandLogo.jsx'), /src=\{src\}/);
});

test('contact and confirmation copy explain the correct next step', () => {
  const contact = source('pages/Contact.jsx');
  const confirmation = source('pages/InquiryConfirmation.jsx');

  assert.match(contact, /For service support, the guided inquiry/);
  assert.match(contact, /profile or credit questions/i);
  assert.match(confirmation, /inquiry may be redirected/i);
  assert.match(confirmation, /does not confirm a booking, agreement/i);
});
