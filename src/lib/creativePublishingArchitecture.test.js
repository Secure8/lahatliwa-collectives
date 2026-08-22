import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('V1 migration reduces authenticated personas and enforces owned posts', () => {
  const sql = source('supabase/migrations/20260814090000_creative_social_portfolio_v1.sql');
  assert.match(sql, /check \(role in \('super_admin', 'creative'\)\)/);
  assert.match(sql, /create table public\.creative_posts/);
  assert.match(sql, /create table public\.creative_post_media/);
  assert.match(sql, /private\.valid_creative_post_document/);
  assert.match(sql, /jsonb_array_length\(block->'mediaIds'\) > 10/);
  assert.match(sql, /creative_posts_owner_update/);
  assert.match(sql, /private\.owns_creative_post\(auth\.uid\(\),id\)/);
  assert.match(sql, /private\.can_create_project[\s\S]*array\['super_admin'\]/);
  assert.match(sql, /CREATIVE_POST_IMAGE_DESCRIPTION_REQUIRED/);
});

test('authenticated Creative post writes can execute the document validator without opening anonymous writes', () => {
  const sql = source('supabase/migrations/20260821150000_creative_post_document_function_permissions.sql');
  assert.match(sql, /grant execute on function private\.valid_creative_post_document\(jsonb\)\s+to authenticated/);
  assert.doesNotMatch(sql, /to public|to anon|service_role/);
});

test('application separates Creative publishing and Super Admin maintenance', () => {
  const app = source('src/App.jsx');
  const access = source('src/lib/adminAccess.jsx');
  const login = source('src/pages/admin/Login.jsx');
  assert.match(app, /path="\/create"[\s\S]*CreativeRouteGuard/);
  assert.match(app, /path="\/admin\/dashboard"[\s\S]*?<PlatformTools \/>/);
  assert.match(app, /path="\/admin\/my-profile"[\s\S]*allow=\{\['creative'\]\}/);
  assert.deepEqual([...access.matchAll(/export const roles = \[([^\]]+)\]/g)].length, 1);
  assert.match(access, /roles = \['super_admin', 'creative'\]/);
  assert.match(login, /Navigate to="\/account"/);
});

test('Creative post media stays server-mediated in Cloudflare R2', () => {
  const shared = source('supabase/functions/_shared/r2Media.js');
  const edge = source('supabase/functions/r2-media/index.ts');
  const upload = source('supabase/functions/r2-media-upload/index.ts');
  assert.match(shared, /creative_post_image:[\s\S]*prefix: 'posts\/images'/);
  assert.match(shared, /role === 'creative'[\s\S]*post\.author_user_id === userId/);
  assert.doesNotMatch(shared, /r2CreativePostPermissionAllowed[\s\S]{0,180}super_admin/);
  assert.match(edge, /creative_post_id/);
  assert.match(upload, /r2CreativePostPermissionAllowed/);
});

test('empty composers stay local and owned drafts can be deleted directly', () => {
  const editor = source('src/pages/CreativePostEditor.jsx');
  const card = source('src/components/CreativePostCard.jsx');
  const migration = source('supabase/migrations/20260814190000_inline_profile_and_draft_cleanup.sql');
  assert.match(editor, /create \? \{ id: null, status: 'draft'/);
  assert.match(editor, /creativePostHasContent/);
  assert.match(editor, /Start writing to save/);
  assert.match(card, /Delete draft/);
  const wallMigration = source('supabase/migrations/20260814230000_public_wall_permissions_and_image_position.sql');
  assert.doesNotMatch(wallMigration, /CREATIVE_POST_ARCHIVE_REQUIRED/);
  assert.match(wallMigration, /using\(private\.owns_creative_post\(auth\.uid\(\),id\)\)/);
});

test('image insertion uses the shared autosave path and preserves retryable failures', () => {
  const editor = source('src/pages/CreativePostEditor.jsx');
  assert.match(editor, /const savePromiseRef = useRef\(null\)/);
  assert.match(editor, /if \(savingRef\.current\)[\s\S]*await savePromiseRef\.current/);
  assert.match(editor, /const savingDocument = documentRef\.current/);
  assert.match(editor, /const savingMetadata = normalizeWorkMetadata\(metadataRef\.current\)/);
  assert.match(editor, /saveCreativePostEditor\(persisted, savingDocument, savingMetadata, savingTermIds\)/);
  assert.match(editor, /console\.error\('\[CreativePostEditor\] Save failed'/);
  assert.match(editor, /Your changes could not be saved\. Your work is still here; try again\./);
  assert.match(editor, /revisionRef\.current \+= 1; setStatus\('unsaved'\);[\s\S]*?await saveNow\(\)/);
  assert.doesNotMatch(editor, /const saved = await saveCreativePost\(persisted, nextDocument\)/);
});

test('post and project creation open in focused floating workspaces', () => {
  const postEditor = source('src/pages/CreativePostEditor.jsx');
  const workEditor = source('src/pages/admin/NewProject.jsx');
  const styles = source('src/index.css');
  assert.match(postEditor, /ll-composer-modal-layer/);
  assert.match(postEditor, /role="dialog"[\s\S]*Add work/);
  assert.match(postEditor, /globalThis\.document\.body\.style\.overflow/);
  assert.doesNotMatch(postEditor, /const previousOverflow = document\.body/);
  assert.match(workEditor, /ll-work-editor-layer/);
  assert.match(workEditor, /role="dialog"[\s\S]*ProjectForm/);
  assert.match(styles, /\.ll-composer-modal, \.ll-work-editor[\s\S]*?border-radius: 1rem/);
  assert.match(styles, /\.ll-composer-modal-body, \.ll-work-editor-body \{ min-height: 0; overflow-y: auto/);
});

test('post editor provides visible structured rich text with familiar shortcuts', () => {
  const editor = source('src/pages/CreativePostEditor.jsx');
  const styles = source('src/index.css');
  assert.match(editor, /contentEditable/);
  assert.match(editor, /readRichTextSegments/);
  assert.match(editor, /writeRichTextSegments/);
  assert.match(editor, /event\.key\.toLowerCase\(\) === 'b'/);
  assert.match(editor, /event\.key\.toLowerCase\(\) === 'i'/);
  assert.match(editor, /event\.key\.toLowerCase\(\) === 'u'/);
  assert.match(editor, /event\.key\.toLowerCase\(\) === 'k'/);
  assert.match(editor, /title="Bold \(Ctrl\+B\)"/);
  assert.match(styles, /\.ll-rich-text-editor strong \{ font-weight: 750/);
  assert.match(editor, /Image or gallery/);
  assert.match(editor, /moveCreativePostBlock/);
  assert.match(editor, /getRichTextSelectionOffsets/);
  assert.match(editor, /applyCreativePostInlineStyle/);
  assert.match(editor, /normalizeCreativePostLink/);
  assert.match(editor, /Insert photos at the end/);
  assert.doesNotMatch(editor, /execCommand/);
  assert.doesNotMatch(editor, /dangerouslySetInnerHTML/);
});

test('editor autosave commits document, metadata, and taxonomy atomically', () => {
  const migration = source('supabase/migrations/20260822193000_creative_post_editor_save_pipeline.sql');
  assert.match(migration, /create or replace function public\.save_creative_post_editor/);
  assert.match(migration, /for update/);
  assert.match(migration, /private\.valid_creative_post_document\(p_document\)/);
  assert.match(migration, /insert into public\.creative_post_revisions/);
  assert.match(migration, /update public\.creative_posts[\s\S]*title =/);
  assert.match(migration, /delete from public\.creative_post_taxonomy/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
});

test('underline remains structured and is accepted by the database validator', () => {
  const client = source('src/lib/creativePosts.js');
  const migration = source('supabase/migrations/20260815050000_creative_post_underline_mark.sql');
  assert.match(client, /\['bold', 'italic', 'underline'\]/);
  assert.match(migration, /not in \('bold','italic','underline'\)/);
  assert.match(migration, /Raw HTML remains forbidden/);
});
