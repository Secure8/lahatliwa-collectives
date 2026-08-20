import assert from 'node:assert/strict';
import test from 'node:test';
import { BRAND_POSITIONING, CURRENT_WORK_COPY, brandAlignedWebsiteBundle, currentWorkPageCopy } from './brandContent.js';

test('brand positioning states the curated portfolio purpose clearly', () => {
  for (const phrase of ['curated portfolio platform', 'creative work', 'Aklan', 'independent Creatives']) {
    assert.match(BRAND_POSITIONING, new RegExp(phrase, 'i'));
  }
});

test('legacy tourism Website Studio copy cannot replace Current Work identity', () => {
  assert.deepEqual(currentWorkPageCopy({
    eyebrow: 'Aklan Tourism',
    title: 'Explore Aklan',
    description: 'Locally edited stories, destinations, events, activities, and products.',
  }), CURRENT_WORK_COPY);
});

test('valid current-work editing remains configurable', () => {
  const configured = { eyebrow: 'Inside the work', title: 'Updates from active projects', description: 'Follow our latest progress.' };
  assert.deepEqual(currentWorkPageCopy(configured), configured);
});

test('known legacy homepage, footer, navigation, and creative copy is aligned without replacing unrelated custom content', () => {
  const aligned = brandAlignedWebsiteBundle({
    'page.home': { featuredTitle: 'Meet the people telling Aklan’s stories.', inquiryDescription: 'Choose a tourism question.' },
    'global.footer': { contextLabel: 'Website by Liwa Digital', footerText: 'A service branch for websites.' },
    'global.navigation': { projectsLabel: 'Projects', servicesLabel: 'Services', contactLabel: 'Talk to us' },
    'page.creatives': { heroEyebrow: 'AKLAN CREATIVES', heroDescription: 'Publish projects under one collective identity.' },
  });
  assert.equal(aligned['page.home'].featuredTitle, 'Meet the people behind the work.');
  assert.equal(aligned['global.footer'].contextLabel, '');
  assert.equal(aligned['global.navigation'].projectsLabel, 'Portfolio');
  assert.equal(aligned['global.navigation'].servicesLabel, 'Services');
  assert.equal(aligned['global.navigation'].contactLabel, 'Talk to us');
  assert.equal(aligned['page.creatives'].heroTitle, 'People behind the work.');
});
