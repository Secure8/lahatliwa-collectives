import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('the product exposes exactly the Super Admin and Creative account personas', () => {
  const access = read('src/lib/adminAccess.jsx');
  const roles = read('src/lib/teamRoles.js');
  assert.match(access, /roles = \['super_admin', 'creative'\]/);
  assert.match(access, /role === 'super_admin' \|\| role === 'owner' \|\| role === 'admin'/);
  assert.match(roles, /TEAM_ROLES = \['creative'\]/);
  assert.doesNotMatch(roles, /TEAM_ROLES = \[[^\]]*'admin'|TEAM_ROLES = \[[^\]]*'editor'/);
});

test('protected routes separate Creative publishing from Super Admin operations', () => {
  const app = read('src/App.jsx');
  const adminGuard = read('src/components/admin/AdminRouteGuard.jsx');
  const creativeGuard = read('src/components/CreativeRouteGuard.jsx');
  assert.match(app, /path="\/admin\/dashboard"[\s\S]*?<PlatformTools \/>/);
  assert.match(app, /path="\/admin\/my-profile" element=\{<Navigate to="\/account" replace/);
  assert.match(app, /<CreativeRouteGuard><CreativePostEditor/);
  assert.match(adminGuard, /Navigate to="\/account" replace/);
  assert.match(creativeGuard, /resolvedRole !== 'creative' \|\| !creativeMemberId/);
  assert.match(creativeGuard, /usePublicAccount/);
});

test('login and recovery resolve both personas through the shared account router', () => {
  const login = read('src/pages/admin/Login.jsx');
  const forgot = read('src/pages/ForgotPassword.jsx');
  const landing = read('src/components/AccountRedirect.jsx');
  assert.match(login, /Navigate to="\/account" replace/);
  assert.match(login, /navigate\('\/account', \{ replace: true \}\)/);
  assert.match(forgot, /Navigate to="\/account" replace/);
  assert.match(landing, /role === 'super_admin'[\s\S]*Navigate to="\/"/);
  assert.match(landing, /profile\.slug[\s\S]*Navigate to=\{`\/creatives\/\$\{profile\.slug\}`\} replace/);
  assert.doesNotMatch(landing, /CreativeWorkspace|Creative workspace/);
  assert.match(landing, /Account needs attention/);
});

test('only active Team records enter the protected application', () => {
  const route = read('src/components/ProtectedRoute.jsx');
  const claim = read('src/lib/teamInvite.js');
  assert.match(route, /data\.status !== 'active'/);
  assert.match(claim, /existingRecord\.user_id === user\.id && existingRecord\.status === 'active'/);
  assert.match(claim, /status: 'active'/);
  assert.match(claim, /existingRecord\.user_id && existingRecord\.user_id !== user\.id/);
});

test('database ownership and moderation remain enforced server-side', () => {
  const sql = read('supabase/migrations/20260814090000_creative_social_portfolio_v1.sql');
  assert.match(sql, /check \(role in \('super_admin', 'creative'\)\)/);
  assert.match(sql, /private\.current_creative_member_id\(\)/);
  assert.match(sql, /private\.owns_creative_post\(auth\.uid\(\),id\)/);
  assert.match(sql, /private\.can_moderate_creative_posts\(auth\.uid\(\)\)/);
  assert.match(sql, /create policy creative_posts_public_read/);
  assert.match(sql, /create policy creative_posts_owner_update/);
  assert.match(sql, /create policy creative_post_media_owner_insert/);
});

test('Creatives can remove only notifications addressed to their own profile', () => {
  const notifications = read('src/lib/creativeNotifications.js');
  const page = read('src/pages/CreativeNotifications.jsx');
  const sql = read('supabase/migrations/20260815020000_creative_notification_deletion.sql');
  assert.match(notifications, /from\('creative_notifications'\)\.delete\(\)\.eq\('id', notificationId\)/);
  assert.match(page, /Delete this notification\?/);
  assert.match(page, /Delete notification/);
  assert.match(sql, /for delete[\s\S]*creative_member_id = private\.current_creative_member_id\(\)/);
  assert.doesNotMatch(sql, /delete from public\.project_inquiries/);
});

test('the final interface layer is flat and uses the standard icon library', () => {
  const css = read('src/index.css');
  const feed = read('src/components/CreativeFeed.jsx');
  const layout = read('src/components/admin/AdminLayout.jsx');
  assert.match(css, /Final flat overrides/);
  assert.match(css, /backdrop-filter: none/);
  assert.match(css, /box-shadow: none !important/);
  assert.match(css, /transform: none !important/);
  assert.match(feed, /Selected work/);
  assert.doesNotMatch(feed, /Sparkles|Wand|Bot/);
  assert.doesNotMatch(layout, /AdminCommandPalette/);
});
