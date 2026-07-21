import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('dashboard is beginner-first and keeps attention conditional', () => {
  const dashboard = read('src/pages/admin/Dashboard.jsx');
  assert.match(dashboard, /Manage Explore Aklan, creative work, inquiries, and your team from one place\./);
  for (const action of ['Create a story', 'Manage destinations', 'Review inquiries', 'Manage team', 'View live website']) assert.match(dashboard, new RegExp(action));
  assert.match(dashboard, /state\.attention\.length > 0/);
  assert.match(dashboard, /Recent work/);
  assert.match(dashboard, /xl:grid-cols-4/);
  assert.doesNotMatch(dashboard, /Slideshow status|Nothing needs attention right now/);
});

test('admin navigation is compact, grouped, and avoids duplicate destinations', () => {
  const layout = read('src/components/admin/AdminLayout.jsx');
  for (const group of ['Home', 'Explore Aklan', 'Creative work', 'Messages', 'Team', 'Website', 'Advanced']) assert.match(layout, new RegExp(`\\['${group}'`));
  for (const label of ['Stories', 'Create story', 'Destinations', 'Homepage slideshow', 'Media and storage', 'Feature flags', 'Audit history', 'System status']) assert.match(layout, new RegExp(`\\['${label}'`));
  assert.doesNotMatch(layout, /\['Categories'|\['Municipalities'|\['Assignments'|\['Delivery Status'/);
});
