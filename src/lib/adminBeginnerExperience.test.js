import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('dashboard is beginner-first and keeps attention conditional', () => {
  const dashboard = read('src/pages/admin/Dashboard.jsx');
  assert.match(dashboard, /Choose a task below to update the website, publish work, or respond to people\./);
  assert.match(dashboard, /What would you like to do\?/);
  for (const action of ['Edit website', 'Start a project', 'Update current work', 'Review inquiries', 'Manage team', 'View live website']) assert.match(dashboard, new RegExp(action));
  assert.match(dashboard, /state\.attention\.length > 0/);
  assert.match(dashboard, /Recent work/);
  assert.match(dashboard, /xl:grid-cols-4/);
  assert.match(dashboard, /sm:grid-cols-2 lg:grid-cols-3/);
  assert.doesNotMatch(dashboard, /Slideshow status|Nothing needs attention right now/);
});

test('admin navigation is compact, grouped, and avoids duplicate destinations', () => {
  const layout = read('src/components/admin/AdminLayout.jsx');
  for (const group of ['Home', 'Content', 'Messages', 'Team']) assert.match(layout, new RegExp(`\\['${group}'`));
  for (const label of ['Website Studio', 'Current Work & Portfolio', 'Creative Profiles', 'Post Moderation', 'Team Members']) assert.match(layout, new RegExp(`\\['${label}'`));
  assert.doesNotMatch(layout, /Editorial Studio/);
  for (const removed of ['Advanced', 'Media and storage', 'Feature flags', 'Audit history', 'System status']) assert.doesNotMatch(layout, new RegExp(`\\['${removed}'`));
  for (const removedGroup of ['Explore Aklan', 'Creative work']) assert.doesNotMatch(layout, new RegExp(`\\['${removedGroup}'`));
  assert.doesNotMatch(layout, /\['Categories'|\['Municipalities'|\['Assignments'|\['Delivery Status'/);
});
