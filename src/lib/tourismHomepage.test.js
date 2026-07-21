import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { carouselStep, mergeUniqueDestinations, normalizeHomepageSlides, swipeDirection, TOURISM_SLIDE_AUTOPLAY_MS, TOURISM_SLIDE_SLOTS } from './tourismHomepage.js';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function slide(type, overrides = {}) {
  return { slot_type: type, enabled: true, sort_order: TOURISM_SLIDE_SLOTS.findIndex((item) => item.key === type), editorial_posts: { id: `${type}-id`, content_type: type, title: type, slug: `${type}-story`, status: 'published', published_revision_id: 'revision', published_at: '2026-07-20T00:00:00Z', archived_at: null, cover_image_url: 'https://cdn.example/image.webp' }, ...overrides };
}

test('homepage defines exactly one slot for all five Editorial types', () => {
  assert.deepEqual(TOURISM_SLIDE_SLOTS.map((item) => item.key), ['journal', 'event', 'place', 'activity', 'local_product']);
  assert.equal(new Set(TOURISM_SLIDE_SLOTS.map((item) => item.key)).size, 5);
});

test('slide normalization orders valid selections and supports image-less stories', () => {
  const rows = [slide('place', { sort_order: 3 }), slide('journal', { sort_order: 0 }), slide('event', { editorial_posts: { ...slide('event').editorial_posts, status: 'archived', archived_at: '2026-07-21' } }), slide('activity', { editorial_posts: { ...slide('activity').editorial_posts, cover_image_url: '' } }), slide('local_product', { enabled: false })];
  assert.deepEqual(normalizeHomepageSlides(rows).map((item) => item.slot_type), ['journal', 'place', 'activity']);
});

test('deleted, unpublished, mismatched, and duplicate selections are rejected', () => {
  const good = slide('place');
  const duplicate = slide('place', { sort_order: 2 });
  const mismatched = slide('event', { editorial_posts: { ...slide('event').editorial_posts, content_type: 'journal' } });
  const deleted = slide('activity', { editorial_posts: null });
  const unpublished = slide('journal', { editorial_posts: { ...slide('journal').editorial_posts, published_revision_id: null } });
  assert.deepEqual(normalizeHomepageSlides([good, duplicate, mismatched, deleted, unpublished]), [good]);
});

test('carousel helpers support wraparound, swipe thresholds, and calm timing', () => {
  assert.equal(TOURISM_SLIDE_AUTOPLAY_MS, 9000);
  assert.equal(carouselStep(4, 5, 1), 0);
  assert.equal(carouselStep(0, 5, -1), 4);
  assert.equal(swipeDirection(200, 110), 1);
  assert.equal(swipeDirection(100, 170), -1);
  assert.equal(swipeDirection(100, 120), 0);
});

test('destination pagination merge does not duplicate rows', () => {
  assert.deepEqual(mergeUniqueDestinations([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }]).map((item) => item.id), ['a', 'b', 'c']);
});

test('homepage implementation is tourism-led, bounded, accessible, and has no project previews', () => {
  const home = read('src/pages/Home.jsx');
  const hero = read('src/components/ExploreAklanHero.jsx');
  const feed = read('src/components/DestinationsFeed.jsx');
  const api = read('src/features/editorial/editorialApi.js');
  assert.match(home, /data-explore-aklan-homepage/);
  assert.doesNotMatch(home, /ProjectGrid|fetchPublicProjectSummaries|Selected Projects/);
  assert.match(home, /Featured Creatives/);
  assert.match(hero, /visibilitychange/);
  assert.match(hero, /prefers-reduced-motion/);
  assert.match(hero, /onMouseEnter/);
  assert.match(hero, /onFocusCapture/);
  assert.match(hero, /onPointerDown/);
  assert.match(hero, /ArrowLeft/);
  assert.match(hero, /aria-roledescription="carousel"/);
  assert.match(hero, /TourismStoryFallback/);
  assert.match(feed, /Load more/);
  assert.match(feed, /TourismStoryFallback/);
  assert.match(api, /\.eq\('content_type', 'place'\)/);
  assert.match(api, /\.range\(from, from \+ pageSize\)/);
});

test('image-less fallback is visual-only and does not claim to depict a destination', () => {
  const fallback = read('src/components/TourismStoryFallback.jsx');
  assert.match(fallback, /data-tourism-story-fallback/);
  assert.match(fallback, /aria-hidden="true"/);
  assert.doesNotMatch(fallback, /<img|destination photograph|photo of/i);
});

test('slideshow migration is additive, typed, audited, feature-flagged, and Super Admin protected', () => {
  const sql = read('supabase/migrations/20260722090000_explore_aklan_homepage.sql');
  assert.match(sql, /create table if not exists public\.editorial_homepage_slides/);
  assert.match(sql, /slot_type in \('journal','event','place','activity','local_product'\)/);
  assert.match(sql, /on delete set null/);
  assert.match(sql, /homepage_slide_updated/);
  assert.match(sql, /public_portal_enabled and homepage_tourism_enabled/);
  assert.match(sql, /private\.editorial_role\(auth\.uid\(\)\) = 'super_admin'/);
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]+ to anon/i);
});
