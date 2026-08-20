import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { latestProjectUpdate, normalizeProjectUpdates, projectWorkStatus } from './projectProgress.js';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('project updates are bounded, cleaned, ordered, and limited to safe links', () => {
  const updates = normalizeProjectUpdates([
    { id: 'older', type: 'event', date: '2026-08-01', title: ' Festival coverage ', body: ' Photos and interviews published. ', linkUrl: 'https://example.com/post' },
    { id: 'newer', type: 'content', date: '2026-08-12', title: 'Cafe post', body: 'A new campaign post went live.', linkUrl: 'javascript:alert(1)' },
    { id: 'empty', type: 'progress', date: '2026-08-13', title: '', body: '' },
  ]);
  assert.deepEqual(updates.map(({ id }) => id), ['newer', 'older']);
  assert.equal(updates[0].linkUrl, '');
  assert.equal(updates[1].linkUrl, 'https://example.com/post');
  assert.equal(latestProjectUpdate({ progress_updates: updates }).id, 'newer');
});

test('project lifecycle fails closed to the completed portfolio', () => {
  assert.equal(projectWorkStatus('active'), 'active');
  assert.equal(projectWorkStatus('completed'), 'completed');
  assert.equal(projectWorkStatus('unexpected'), 'completed');
});

test('homepage is the canonical curated Work surface while legacy routes remain compatible', () => {
  const home = read('src/pages/Home.jsx');
  const work = read('src/pages/CurrentWork.jsx');
  const app = read('src/App.jsx');
  assert.match(home, /data-creative-network-home/);
  assert.match(home, /loadPublicCreativeFeed\(\{ limit: 36 \}\)/);
  assert.doesNotMatch(home, /fetchPublicProjectSummaries\(\)/);
  assert.match(home, /<CreativeFeed/);
  assert.match(home, /People behind the work/);
  assert.doesNotMatch(home, /ActiveWorkHero|activeProjects/);
  assert.match(work, /normalizeProjectUpdates/);
  assert.match(work, /Event coverage/);
  assert.match(app, /path="\/work" element=\{<Navigate to="\/" replace \/>\}/);
  assert.match(app, /path="\/work\/:slug" element=\{<CreativePostDetails \/>\}/);
  assert.doesNotMatch(home, /ExploreAklanHero|DestinationsFeed|homepageTourismEnabled/);
});

test('project covers are square while uploaded gallery images retain their natural ratio', () => {
  const card = read('src/components/ProjectCard.jsx');
  const work = read('src/pages/CurrentWork.jsx');
  const details = read('src/pages/ProjectDetails.jsx');
  assert.match(card, /aspect-square/);
  assert.match(work, /aspect-square/);
  assert.match(details, /ll-project-detail__cover/);
  assert.match(read('src/index.css'), /\.ll-project-detail__cover[^}]*aspect-ratio:\s*1/);
  assert.match(details, /item\.type === 'image'[\s\S]*className="h-auto w-full/);
});

test('database migration adds a bounded active-to-completed lifecycle', () => {
  const sql = read('supabase/migrations/20260813090000_public_work_portal.sql');
  assert.match(sql, /work_status text not null default 'completed'/);
  assert.match(sql, /work_status in \('active','completed'\)/);
  assert.match(sql, /jsonb_array_length\(progress_updates\) <= 100/);
  assert.match(sql, /octet_length\(progress_updates::text\) <= 200000/);
  assert.match(sql, /where status = 'published'/);
});

test('admin project editor owns public stage and progress updates', () => {
  const form = read('src/components/admin/ProjectForm.jsx');
  const projects = read('src/pages/admin/AdminProjects.jsx');
  const progress = read('src/lib/projectProgress.js');
  assert.match(form, /work_status/);
  assert.match(form, /progress_updates/);
  assert.match(form, /Add public update/);
  assert.match(progress, /Event coverage/);
  assert.match(projects, /Current work/);
  assert.match(projects, /Portfolio/);
});
