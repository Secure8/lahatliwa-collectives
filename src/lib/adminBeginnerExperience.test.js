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

test('legacy CMS navigation is replaced by a compact operations window', () => {
  const layout = read('src/components/admin/AdminLayout.jsx');
  for (const label of ['Projects', 'Inquiries', 'Moderation', 'Join requests']) assert.match(layout, new RegExp(`\\['${label}'`));
  assert.match(layout, /ll-operations-window/);
  assert.match(layout, /Platform tools/);
  assert.doesNotMatch(layout, /ll-admin-tabs|ll-admin-drawer|Platform Overview|Website|Services|Creatives|Accounts/);
  assert.doesNotMatch(layout, /lg:w-64|lg:ml-64|admin-sidebar-link/);
  for (const removed of ['Media and storage', 'Audit history', 'System status', 'Editorial Studio']) assert.doesNotMatch(layout, new RegExp(removed));
});
