import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Creative owners manage published posts and primary projects from their wall', () => {
  const card = read('src/components/CreativePostCard.jsx');
  const profile = read('src/components/CreativeProfileView.jsx');
  const app = read('src/App.jsx');
  const migration = read('supabase/migrations/20260814230000_public_wall_permissions_and_image_position.sql');
  assert.match(card, /Delete post/);
  assert.match(profile, /onEditProject/);
  assert.match(profile, /onDeleteProject/);
  assert.match(app, /allow=\{\['super_admin','creative'\]\}><EditProject/);
  assert.match(migration, /credit\.is_primary=true/);
  assert.match(migration, /role in \('super_admin','creative'\)/);
});

test('Super Admin moderates public work without receiving Creative edit controls', () => {
  const card = read('src/components/CreativePostCard.jsx');
  const home = read('src/pages/Home.jsx');
  const inlineEdit = read('src/components/PublicInlineEditButton.jsx');
  const studio = read('src/pages/admin/WebsiteStudio.jsx');
  assert.match(card, /moderator && !owner/);
  assert.match(card, /Remove with note/);
  assert.match(home, /moderateCreativePost/);
  assert.match(home, /moderatePublicProject/);
  assert.match(inlineEdit, /ll-inline-admin-edit/);
  assert.doesNotMatch(inlineEdit, />\s*Edit this page\s*</);
  assert.match(studio, /ll-site-editor-preview/);
  assert.match(studio, /Desktop editing only/);
  assert.doesNotMatch(studio, /<AdminLayout>/);
});

test('profile templates preserve Social as default while offering opt-in layouts', () => {
  const editor = read('src/components/CreativeInlineProfileEditor.jsx');
  const profile = read('src/components/CreativeProfileView.jsx');
  const migration = read('supabase/migrations/20260814240000_creative_templates_and_private_inquiries.sql');
  assert.match(editor, /Choose your profile style/);
  assert.match(profile, /ll-profile-template--/);
  assert.match(migration, /default 'social'/);
});

test('Creative inquiries are private, targeted, and create notifications', () => {
  const inquiry = read('src/pages/StartProject.jsx');
  const notifications = read('src/pages/CreativeNotifications.jsx');
  const migration = read('supabase/migrations/20260814240000_creative_templates_and_private_inquiries.sql');
  assert.match(inquiry, /Choose the Creative you want to contact/);
  assert.match(inquiry, /inquiryKind: platformInquiry \? 'platform' : 'creative'/);
  assert.match(notifications, /private to you and the Super Admin/);
  assert.match(migration, /Creative can read assigned inquiries/);
  assert.match(migration, /create_targeted_creative_notification/);
});

test('feed projects show their primary Creative identity', () => {
  const feed = read('src/components/CreativeFeed.jsx');
  const projectFeed = read('src/components/ProjectFeedCard.jsx');
  const projectData = read('src/lib/publicProjectData.js');
  assert.match(feed, /Published a formal project/);
  assert.match(feed, /author\.profileImageUrl/);
  assert.match(feed, /ProjectFeedCard/);
  assert.doesNotMatch(feed, /import ProjectCard/);
  assert.match(projectFeed, /ll-project-post__media/);
  assert.match(projectFeed, /ll-project-post__caption/);
  assert.match(projectData, /profile_image_url/);
});

test('profile media supports user-controlled framing and quiet scrollbars', () => {
  const editor = read('src/components/CreativeInlineProfileEditor.jsx');
  const hero = read('src/components/CreativeHero.jsx');
  const css = read('src/index.css');
  assert.match(editor, /Move left or right/);
  assert.match(editor, /Move up or down/);
  assert.match(hero, /cover_image_position/);
  assert.match(css, /::-webkit-scrollbar \{ width: 4px/);
  assert.match(css, /backdrop-filter: none !important/);
});
