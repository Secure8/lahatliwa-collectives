import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

test('featured gallery is limited, approval-based, and reuses existing work media', () => {
  const migration = read('supabase/migrations/20260822233000_featured_work_gallery.sql');
  assert.match(migration, /slot_position between 1 and 6/);
  assert.match(migration, /featured_work_approved_slot_idx/);
  assert.match(migration, /featured_work_active_post_idx/);
  assert.match(migration, /request_featured_work/);
  assert.match(migration, /review_featured_work_request/);
  assert.match(migration, /set_featured_work_slot/);
  assert.match(migration, /clear_featured_work_slot/);
  assert.match(migration, /private\.can_moderate_creative_posts/);
  assert.match(migration, /private\.owns_creative_post\(auth\.uid\(\), p_post_id\)/);
  assert.doesNotMatch(migration, /create table[^;]*(featured_work_media|featured_gallery_media)/i);
});

test('only approved featured placements are public while Creative requests remain private', () => {
  const migration = read('supabase/migrations/20260822233000_featured_work_gallery.sql');
  assert.match(migration, /featured_work_public_read[\s\S]*status = 'approved'/);
  assert.match(migration, /featured_work_owner_read[\s\S]*private\.owns_creative_post\(auth\.uid\(\), post_id\)/);
  assert.match(migration, /featured_work_moderator_read[\s\S]*can_moderate_creative_posts/);
  assert.match(migration, /revoke all on function public\.request_featured_work/);
  assert.match(migration, /grant execute on function public\.request_featured_work[\s\S]*to authenticated/);
});

test('mobile visitors see the featured gallery before every feed item', () => {
  const home = read('src/pages/Home.jsx');
  const header = home.indexOf('<PublicPageHeader');
  const gallery = home.indexOf('<FeaturedWorkGallery');
  const creativeStrip = home.indexOf('className="ll-creative-strip"');
  const feed = home.indexOf('<CreativeFeed');
  assert.ok(header >= 0 && gallery > header);
  assert.ok(gallery < creativeStrip);
  assert.ok(gallery < feed);
});

test('desktop work details use a sticky rail without making the post wider', () => {
  const details = read('src/pages/CreativePostDetails.jsx');
  const styles = read('src/index.css');
  assert.match(details, /ll-work-detail-featured/);
  assert.match(details, /FeaturedWorkRequestControl/);
  assert.match(details, /loadFeaturedWorkGallery\(\)\.catch\(\(\) => \[\]\)/);
  assert.match(styles, /\.ll-featured-work--rail \{[\s\S]*position: sticky;/);
  assert.match(styles, /grid-template-columns: minmax\(0, 960px\) minmax\(15rem, 19rem\)/);
  assert.match(styles, /\.ll-featured-work--mobile \{ display: none;/);
  assert.match(styles, /@media \(max-width: 639px\)[\s\S]*\.ll-featured-work--mobile \{ display: block;/);
});

test('Super Admin tools expose featured approvals and slot management', () => {
  const routes = read('src/App.jsx');
  const layout = read('src/components/admin/AdminLayout.jsx');
  const admin = read('src/pages/admin/AdminFeaturedWork.jsx');
  assert.match(routes, /path="\/admin\/featured"/);
  assert.match(layout, /Featured/);
  assert.match(admin, /Creative requests/);
  assert.match(admin, /Add published work directly/);
  assert.match(admin, /Place work/);
  assert.doesNotMatch(admin, /document\.getElementById/);
});
