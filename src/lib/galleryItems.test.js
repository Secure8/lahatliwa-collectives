import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getProjectExternalLinks, getSingleProjectExternalLink, projectExternalLinkLabel } from './projectExternalLinks.js';

test('one valid attached external link makes the detail cover eligible', () => {
  const link = getSingleProjectExternalLink({
    gallery_items: [{ id: 'video', type: 'youtube', platform: 'YouTube', url: 'https://www.youtube.com/watch?v=abc123' }],
  });
  assert.equal(link?.url, 'https://www.youtube.com/watch?v=abc123');
  assert.equal(projectExternalLinkLabel(link), 'Open project video on YouTube');
  const legacyLink = getSingleProjectExternalLink({ gallery_items: [{ type: 'external_link', platform: 'External Link', url: 'https://youtu.be/legacy123' }] });
  assert.equal(projectExternalLinkLabel(legacyLink), 'Open project video on YouTube');
});

test('no external links and multiple distinct links keep the cover ineligible', () => {
  assert.equal(getSingleProjectExternalLink({ gallery_images: ['projects/gallery/photo.webp'] }), null);
  assert.equal(getSingleProjectExternalLink({
    video_url: 'https://youtu.be/abc123',
    live_url: 'https://example.com/project',
  }), null);
});

test('uploaded images and PDFs never count as external project links', () => {
  const links = getProjectExternalLinks({
    gallery_images: ['projects/gallery/photo.webp'],
    gallery_items: [
      { id: 'image', type: 'image', url: 'https://cdn.example.com/photo.webp' },
      { id: 'pdf', type: 'pdf', url: 'https://cdn.example.com/brief.pdf' },
    ],
  });
  assert.deepEqual(links, []);
});

test('duplicate representations of one safe URL resolve to one link', () => {
  const url = 'https://www.facebook.com/example/posts/123';
  const links = getProjectExternalLinks({
    social_post_url: url,
    gallery_items: [
      { id: 'post-1', type: 'facebook', platform: 'Facebook', url },
      { id: 'post-2', type: 'facebook', platform: 'Facebook', url },
    ],
  });
  assert.equal(links.length, 1);
  assert.equal(getSingleProjectExternalLink({ social_post_url: url, gallery_items: [{ type: 'facebook', platform: 'Facebook', url }] })?.url, url);
});

test('missing, malformed, and unsafe URLs never make the cover clickable', () => {
  assert.equal(getSingleProjectExternalLink({ video_url: 'not a URL' }), null);
  assert.equal(getSingleProjectExternalLink({ gallery_items: [{ type: 'website', url: 'javascript:alert(1)' }] }), null);
  assert.equal(getSingleProjectExternalLink({ gallery_items: [{ type: 'external_link', url: '' }] }), null);
});

test('only the full project detail cover opts into the external destination', async () => {
  const [details, projectCard, adminCard] = await Promise.all([
    readFile(new URL('../pages/ProjectDetails.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/ProjectCard.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/admin/AdminProjectCard.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(details, /<ProjectCover cover=\{cover\} title=\{project\.title\} externalLink=\{coverExternalLink\}/);
  assert.match(details, /target="_blank" rel="noopener noreferrer" aria-label=\{projectExternalLinkLabel\(externalLink\)\}/);
  assert.doesNotMatch(projectCard, /getSingleProjectExternalLink|projectExternalLinkLabel|Open external project/);
  assert.doesNotMatch(adminCard, /getSingleProjectExternalLink|projectExternalLinkLabel|Open external project/);
});
