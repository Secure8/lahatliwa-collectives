import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('Super Admin overview is task-oriented and keeps attention conditional', () => {
  const dashboard = read('src/pages/admin/Dashboard.jsx');
  assert.match(dashboard, /Maintain the platform, support Creatives, and respond to professional inquiries/);
  assert.match(dashboard, /Choose an area/);
  for (const action of ['Website', 'Create project', 'Update current work', 'Services', 'Review inquiries', 'Moderation', 'Manage team', 'View live website']) assert.match(dashboard, new RegExp(action));
  assert.match(dashboard, /state\.attention\.length > 0/);
  assert.match(dashboard, /Recent work/);
  assert.doesNotMatch(dashboard, /Slideshow status|Nothing needs attention right now/);
});

test('admin navigation is a compact top-level operations model without a permanent sidebar', () => {
  const layout = read('src/components/admin/AdminLayout.jsx');
  for (const group of ['Overview', 'Platform', 'Communication', 'Access']) assert.match(layout, new RegExp(`\\['${group}'`));
  for (const label of ['Platform Overview', 'Website', 'Services', 'Projects', 'Creatives', 'Moderation', 'Inquiries', 'Accounts']) assert.match(layout, new RegExp(`\\['${label}'`));
  assert.match(layout, /ll-admin-tabs/);
  assert.match(layout, /ll-admin-drawer/);
  assert.doesNotMatch(layout, /lg:w-64|lg:ml-64|admin-sidebar-link/);
  for (const removed of ['Media and storage', 'Audit history', 'System status', 'Editorial Studio']) assert.doesNotMatch(layout, new RegExp(removed));
});
