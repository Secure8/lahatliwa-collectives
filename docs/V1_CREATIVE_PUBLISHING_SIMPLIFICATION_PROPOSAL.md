# Lahat Liwa Collectives — V1 Creative Publishing Simplification Proposal

## Decision summary

V1 should introduce a separate `creative_posts` domain and make each Creative's public profile their publishing home.

- Keep `projects` as formal current-work and permanent-portfolio records.
- Keep `creative_members` as the public identity/profile record.
- Add Creative Posts for flexible, authored feed content.
- Reuse the proven structured-document, ownership, revision, R2 upload, and cleanup patterns already present in the repository.
- Do not revive the tourism Editorial CMS as the Creative interface and do not force Projects to behave like social posts.
- Migrate existing accounts into `super_admin` or `creative`, then enforce those two roles in the database and application.

The target Creative journey is:

> Login → My Profile → Create Post → Publish

The target Super Admin journey remains platform-oriented:

> Login → Platform Overview → Website / Accounts / Moderation / Inquiries

## 1. Existing implementation audit

### Authentication and account records

Supabase Auth supplies the authenticated user. `public.admin_users` is the application's account/access record. `ProtectedRoute` loads the active `admin_users` row and exposes its role and optional `creative_member_id` to the client.

The repository currently recognizes:

- `super_admin` (with legacy `owner` normalization)
- `admin`
- `editor`
- `writer` in the Editorial subsystem
- `creative`
- `viewer`

The role definitions are not centralized. They appear in React route guards, navigation, invitation logic, SQL constraints, RLS helpers, Editorial capabilities, Edge Functions, R2 authorization, tests, and member lifecycle routines. This makes deleting roles immediately unsafe.

### Current role behavior

| Role | Current practical access | V1 target |
| --- | --- | --- |
| Super Admin | Website Studio, team/accounts, all projects, profiles, inquiries, global settings, publishing and deletion privileges | Platform maintenance, accounts, global content, moderation, inquiries; no public Creative identity or authored feed |
| Admin | Nearly the same broad platform and project authority as Super Admin, except protected Super Admin lifecycle actions | Transitional only; manually classify each account as Super Admin or Creative before retirement |
| Editor | Project creation/editing, project publishing path, broad inquiry visibility; Editorial capabilities may also be assigned | Transitional only; normally migrate to Creative while preserving owned content |
| Writer | Primarily the dormant Editorial subsystem through `editorial_roles`; not consistently supported by the main admin UI | Transitional only; normally migrate to Creative while preserving authored Editorial records |
| Creative | Linked public profile, self-profile editing, project creation/editing when owner, broad project visibility, broad inquiry visibility | Public profile and own posts; own formal Projects only where retained; no platform CMS or global inquiry workspace |
| Viewer | Admin shell access to directory, projects, and inquiries without authoring | Remove as an authenticated product role; public viewing requires no account |

### Important role inconsistencies

- The React access helpers include `writer`, while several later standalone SQL role constraints omit it. The Editorial foundation adds it again. The deployed database must be catalogued before changing the constraint.
- `admin` and `super_admin` are both treated as platform-wide content managers in several helpers.
- Super Admin can currently enter My Profile and Create Project routes, which conflicts with the new non-creative Super Admin principle.
- All active team roles can currently read project inquiries. That is broader than the proposed separation and should be reduced during the authorization phase.
- R2 site uploads currently allow `editor`; project uploads allow owners and assigned project editors; profile uploads allow the linked Creative or platform admins.

### Creative profiles

`creative_members` already supports most of the proposed public profile:

- name and public slug
- role/title
- short and full bio
- profile photo
- cover photo
- skills
- social/external links
- availability text
- published and featured states

`admin_users.creative_member_id` links one active account to one Creative profile. A unique partial index protects that association for active/invited accounts.

The public profile currently renders a hero, profile/cover images, biography, skills, links, contact CTA, and credited Projects. It does not render authored posts. Owner controls are currently in `/admin/my-profile`, not on the public profile.

Self-profile RLS and a guard trigger already ensure a Creative can update only their linked profile while preventing self-changes to protected fields such as publication status, featured state, display order, and originally the slug. Super Admin/Admin currently retain cross-profile management.

### Projects and current work

`projects` is a structured business/work record with:

- title, slug, category, description, tools, date, featured order
- cover, gallery items, documents, and external destinations
- active/completed public lifecycle and progress updates
- contributor credits
- owner, creator, updater, project access grants, and review state

It powers Current Work, the homepage active-work slider/cards, and the completed Portfolio. Its editor exposes many formal fields, contributor management, review controls, media cleanup, and project-specific links.

This is useful and should remain a separate domain. A flexible post such as a reflection, photo series, or process note should not require a Project title/category/review workflow. A post may optionally reference a Project.

### Dormant Editorial implementation

The repository contains an extensive Editorial domain originally built for tourism stories. Its public routes have been redirected to Current Work and its admin/studio routes are no longer registered in `App.jsx`, so it is effectively dormant in the current UI.

Useful reusable patterns include:

- versioned structured JSON documents
- server-side document validation
- immutable revisions and autosaves
- author ownership and Super Admin cross-account authority
- publish/archive/restore/delete RPCs
- safe R2 linkage for cover and inline media
- queued deletion and media cleanup
- audit/moderation-style event records

It should not be exposed unchanged. Its tourism content types, municipalities, sources, review panels, homepage slides, and complex three-panel editor do not match the V1 Creative experience. Its current document schema also lacks the full inline bold/italic/list model required by the brief.

### R2 media lifecycle

R2 is already the correct foundation. The current system:

- creates thumbnail, display, and expanded WebP variants in the browser
- validates derivative type, dimensions, and byte size on the server
- stores provider records in `external_media_objects`
- authorizes media against a Project, Creative profile, Editorial post, or site area
- reserves capacity, verifies upload completion, activates replacements, and queues cleanup
- checks that live references have moved before deleting replaced media

This should be extended with a `creative_post_image` category and `creative_post_id` reference. Direct video upload must remain unsupported.

## 2. Proposed role transition

### Stable conceptual roles

#### Super Admin

- May manage global site copy, appearance, navigation, footer, platform settings, accounts, inquiries, feature flags, and moderation.
- May hide, restore, or remove Creative content for a recorded moderation reason.
- Must not silently become the author or owner of a Creative's post.
- Must not have a public Creative profile.
- Must not see Create Post or normal Creative publishing controls.

#### Creative

- Must have an active `admin_users` account linked to exactly one `creative_members` record.
- May edit only that profile's editable identity fields and media.
- May create, edit, publish, archive, restore, and delete only their own posts.
- May manage only their own formal Projects if the Project feature remains available to Creatives.
- Must not access Website Studio, global settings, account management, or other Creatives' private controls.

### Compatibility phase

Do not alter the role constraint first. Add application-level role mapping and a migration report:

- `owner` → `super_admin` compatibility alias, then normalize persisted rows later.
- Existing `super_admin` remains Super Admin.
- Existing `creative` remains Creative when linked to a profile.
- Existing `admin`, `editor`, `writer`, and `viewer` rows enter a transition report and are manually assigned a target.
- Accounts with authored Projects or Editorial posts must retain the same Auth user ID so ownership is not broken.
- A non-Creative account cannot be converted to Creative until a unique linked `creative_members` record exists.
- A Creative cannot be converted to Super Admin while retaining a public profile; the profile must be reassigned, unpublished, or explicitly preserved as a non-login legacy profile.

Only after every active account has a target and the compatibility release is stable should the database constraint be reduced to `super_admin` and `creative` (with temporary `owner` compatibility if still required).

## 3. Proposed Creative profile experience

### Public profile

Retain the existing profile hero and identity data, then add a feed below the profile header:

1. cover photo
2. profile photo
3. Creative name
4. disciplines/capabilities
5. short bio and optional expanded bio
6. approved external links
7. authored post feed
8. optional formal Project/portfolio section, clearly separate from posts

The feed should be the primary living body of the profile. Formal Projects can remain a secondary “Selected projects” section or appear through referenced post cards.

### Own-profile behavior

When the signed-in account's `creative_member_id` matches the profile ID, show a restrained owner toolbar:

- Edit profile
- Create Post
- Drafts/Archived (inside a compact owner drawer, not a dashboard)

Each owned post gets a subtle overflow menu:

- Edit
- Archive or restore
- Delete (archive required first is recommended)
- Copy link

Visitors and other Creatives must never receive these controls in the DOM based only on client assumptions; the server/RLS remains authoritative.

### Login destination

- Creative: redirect directly to their public profile with owner controls.
- Super Admin: redirect to Platform Overview.
- If a Creative account is active but lacks a linked profile, show a clear blocked setup state rather than the Super Admin shell.

## 4. Proposed post composer

### Product shape

Use one primary action: **Create Post**.

Open a focused composer as a full page on small screens and a large modal/drawer on desktop. The default state is one writing canvas plus an image picker. Do not expose Project-style cards for title, client, tools, video URL, and destinations.

### Structured content model

Store a versioned, validated JSON document—not HTML. Use controlled blocks and inline marks:

- paragraph
- heading level 2 or 3
- block quote
- bulleted list
- numbered list
- divider
- text with bold, italic, and safe link marks
- external-media link block
- image-group block referencing uploaded post media

Recommended document boundary:

```json
{
  "version": 1,
  "blocks": [
    {
      "id": "uuid",
      "type": "paragraph",
      "content": [
        { "text": "Creative Direction: ", "marks": ["bold"] },
        { "text": "Jevin Ballester", "marks": [] }
      ]
    },
    { "id": "uuid", "type": "image_group", "mediaIds": ["uuid"] }
  ]
}
```

The database validator must reject unknown block types, raw HTML, CSS, scripts, unsafe protocols, excessive nesting, excessive text, and media IDs not owned by the post author. Rendering must be from explicit React components, never `dangerouslySetInnerHTML`.

The editor implementation can use a controlled rich-text library, but its internal document should be normalized to the platform schema at the API boundary. This avoids permanently coupling stored content to one editor package.

### Composer controls

Keep the visible toolbar small:

- paragraph / heading / subheading
- bold / italic
- quote
- bulleted / numbered list
- link
- divider
- add images

Advanced layout choices should appear only when an image group is selected. Typography, colors, and fonts remain platform-controlled.

### Image handling

- Zero images are valid for writing-only posts.
- One to ten images are permitted.
- Helper text: “Choose up to 10 images that best represent this work.”
- Accept still JPEG, PNG, and WebP sources; generate the existing three WebP variants.
- Validate count, MIME signature, dimensions, derivative size, ownership, and post association server-side.
- Let each image have optional alt text and caption.
- Preserve upload order and support simple reorder.
- Do not accept direct video files.

### External links and video

Links are inserted naturally in content. Normalize to HTTPS, reject credentials and dangerous schemes, and add `noopener noreferrer` for external targets.

Recognized YouTube, Vimeo, Facebook, Instagram, and Behance links may render a controlled preview. Unknown approved HTTPS links render as a simple external-link card. Preview metadata should be server-fetched, sanitized, cached, size-limited, and never execute provider HTML. V1 can ship with link cards first and add embeds later.

### Publishing validation

Publishing should require:

- active Creative account and matching profile
- non-empty meaningful text or at least one uploaded image
- no more than ten active images
- every referenced media record available and owned by the author/post
- valid structured document
- safe external URLs
- acknowledgement of the current Publishing Guidelines version

Draft saving can be more permissive but must still reject unsafe document shapes.

## 5. Feed and gallery presentation

### Adaptive media grid

| Image count | Feed preview |
| --- | --- |
| 1 | One large refined media area; use the image's focal crop for the card and natural ratio in the viewer |
| 2 | Two equal balanced columns |
| 3 | One large image plus two stacked images on wide screens; compact balanced grid on small screens |
| 4 | Clean 2 × 2 grid |
| 5–10 | Show the first four in a 2 × 2 grid and overlay `+N` on the fourth, where N is the number not shown |

The feed grid uses controlled crops to maintain a stable card. The lightbox uses the original image ratio from the expanded derivative.

### Lightbox

The viewer must include:

- previous and next controls
- close control
- position, for example `3 / 8`
- caption and accessible alt text
- keyboard Escape, Left Arrow, and Right Arrow
- focus trap and focus return
- swipe support on touch devices
- body scroll lock
- reduced-motion support

Only one modal instance should exist at a time. Route-backed media state is optional; the post itself must always have a stable share URL.

### Feed card anatomy

- author identity and profile link
- published/updated timestamp
- structured content excerpt or full short post
- adaptive media grid
- safe external link cards
- professional CTA: “Ask About This Work” linking to the existing inquiry flow with post context
- optional single “Appreciate” action only after abuse controls and a genuine product use case are defined

Comments, followers, friend relationships, reaction variants, and public popularity counters are out of V1 scope.

## 6. Proposed data model

### Keep existing domains

- `creative_members`: continue as public profile identity.
- `projects`: continue as current-work and completed-portfolio records.
- `project_creatives`: continue as formal Project credits.
- `external_media_objects`, reservations, cleanup jobs, and R2 worker: continue as the managed media ledger/lifecycle.
- Website Studio tables: continue for platform content only.

### Add Creative Posts domain

#### `creative_posts`

Recommended columns:

- `id uuid primary key`
- `creative_member_id uuid not null references creative_members`
- `author_user_id uuid not null references auth.users`
- `slug text unique not null`
- `document jsonb not null`
- `document_version integer not null default 1`
- `status text`: `draft`, `published`, `archived`
- `visibility text`: `public`, `hidden`
- `moderation_status text`: `clear`, `flagged`, `changes_requested`, `hidden`, `removed`
- `moderation_reason text`
- `moderated_by uuid`
- `moderated_at timestamptz`
- `project_id uuid null references projects` for an optional formal-work connection
- `published_at`, `archived_at`, `created_at`, `updated_at`
- `publishing_guidelines_version text`
- `guidelines_accepted_at timestamptz`

Keep authorship immutable after insertion. Moderation fields must not be writable through the Creative save path.

#### `creative_post_revisions`

Store immutable snapshots on meaningful saves/publishes:

- `id`, `post_id`, `revision_number`, `document`, `created_by`, `created_at`

V1 does not need to expose a complex revision UI to Creatives. Revisions provide recovery and moderation evidence without turning the experience into a CMS.

#### `creative_post_media`

Store post presentation data separately from provider ledger rows:

- `id`
- `post_id`
- `media_group_id` referencing the R2 media group identity
- `display_order` constrained to 0–9
- `alt_text`
- `caption`
- optional `focal_x`, `focal_y`
- `created_at`

Enforce a maximum of ten active rows using transaction-safe RPC logic and a trigger as defense in depth. A simple table `CHECK` cannot enforce a count across rows.

#### `creative_post_moderation_events`

Record moderation separately from authorship:

- post, moderator, action, reason, previous state, next state, timestamp

Creatives may read moderation actions concerning their own posts. Only Super Admin can insert them.

#### Optional later tables

- `creative_post_appreciations` only if Appreciate is approved
- `creative_post_embed_cache` if rich external previews are implemented
- normalized hashtag/search tables only when discovery requirements justify them

### Why not reuse `editorial_posts` directly

The Editorial domain has useful engineering patterns but carries tourism types, taxonomy, assigned editors, review/scheduling workflow, sources, municipalities, homepage slides, and feature gates. Retrofitting it would preserve unwanted CMS complexity and blur ownership. A clean Posts domain with copied/shared validators is safer than semantic overloading.

## 7. Authorization design

### Core database helpers

Introduce narrow helpers with fixed `search_path` and revoked public execution:

- `private.is_active_super_admin(user_id)`
- `private.current_creative_member_id()` (retain/harden existing helper)
- `private.owns_creative_post(user_id, post_id)`
- `private.can_moderate_creative_post(user_id)`

Do not use client-supplied role strings for authorization.

### Creative Post RLS

- Public SELECT: only `status = 'published'`, `visibility = 'public'`, `moderation_status = 'clear'`, and published profile.
- Creative SELECT: own drafts, published, archived, and moderated rows.
- Creative INSERT: `author_user_id = auth.uid()` and `creative_member_id = private.current_creative_member_id()`.
- Creative UPDATE: own row only; immutable author/profile IDs; moderation fields preserved by trigger/RPC.
- Creative DELETE: preferably through an archive-required RPC that queues R2 cleanup transactionally.
- Super Admin SELECT: all posts for moderation.
- Super Admin moderation: RPC updates only moderation fields and writes an event; it does not rewrite `document` or author identity.

### Media authorization

Add R2 category `creative_post_image` with prefix such as `posts/images/<post-id>/<group-id>/<variant>.webp`.

- Initiate/finalize: post author only while post is editable, or Super Admin only for explicit cleanup/moderation operations.
- Replacement: post author only and reference switch must be verified.
- Delete: queue only after no active post document/media row references the group.
- Add `creative_post_id` to `external_media_objects` and include it in cleanup/reference reconciliation.

### Platform boundaries

- Website Studio and global content: Super Admin only.
- Account invitations and access changes: Super Admin only.
- Global inquiry list: Super Admin only in initial V1.
- Creative-specific inquiry delivery can be added later through explicit assignment and limited row visibility; do not keep the current “all team members read all inquiries” rule.
- Formal Project access: owner-only for Creatives; Super Admin receives moderation/read visibility but normal UI should not present authorship editing as routine platform maintenance.

### Edge Function boundaries

Update `authenticatedTeamMember`, R2 authorization helpers, invitation functions, storage budget role rules, and any project/editorial workflow code to use the compatibility role model. UI route guards are convenience only; Edge Functions and RLS remain authoritative.

## 8. UI simplification map

### Creative experience

| Current surface | V1 action |
| --- | --- |
| `/admin/dashboard` | Replace for Creatives with redirect to their public profile |
| `/admin/my-profile` | Simplify into an owner-only profile editing drawer/page linked from the public profile |
| `/admin/projects` | Keep only if formal Projects remain Creative-owned; label “Projects” and do not make it the default experience |
| `/admin/projects/new` and long Project form | Keep for formal Projects only; never use as Create Post |
| `/admin/directory` | Replace with public Creatives discovery; authenticated special copy is unnecessary |
| `/admin/inquiries` | Remove from general Creative access in V1 |
| dormant Editorial Studio | Do not expose; reuse engineering patterns only |
| New profile feed | Primary Creative home and content library without calling it a library/manager/dashboard |
| New Create Post composer | Primary publishing action |

### Super Admin experience

Keep a conventional but reduced administration shell:

- Platform Overview
- Website Studio (Branding, Navigation, Pages, Contact/Social, Privacy, Appearance)
- Creatives & Accounts
- Moderation
- Inquiries
- Platform Settings only when a real setting exists

Remove or hide empty, dormant, or technical surfaces. Storage/R2 remains implementation infrastructure, not a daily admin page. System details can remain accessible through operational tooling instead of the normal navigation.

The Super Admin Projects view, if retained, should be a moderation/reference view. Routine Edit Content controls should belong to the Creative owner.

## 9. Safe migration and rollout strategy

### Phase 0 — live catalogue and acceptance criteria

Before SQL changes, run read-only inventory queries against production:

- active accounts by role/status and profile linkage
- Super Admins with linked profiles
- orphan Creative profiles and duplicate links
- Projects by owner/creator and role
- Editorial posts by author/status
- active Editorial flags/routes
- R2 media by target category and cleanup state
- current policies/functions/grants from `pg_catalog`

The repository contains both timestamped migrations and standalone SQL scripts that were applied manually, so source files alone cannot prove the exact deployed policy order.

Define acceptance tests for the two personas and take a database backup before migration.

### Phase 1 — additive backend behind a disabled flag

- Add `creative_posts`, revisions, media presentation, moderation events, and publishing-guideline acceptance support.
- Add RLS, triggers, RPCs, indexes, and `creative_post_id` media linkage.
- Extend R2 and cleanup reconciliation.
- Add a `creative_posts_enabled` feature flag defaulting to false.
- Do not change current roles, routes, Projects, or public profile output.

### Phase 2 — composer and owner feed pilot

- Add profile feed renderer, adaptive grids, lightbox, and composer behind the flag.
- Enable only for selected Creative accounts or a private environment.
- Validate creation, draft recovery, publish, edit, archive, restore, delete, cleanup, keyboard access, mobile layout, and malicious document rejection.

### Phase 3 — public dual run

- Enable published post feeds on Creative profiles.
- Keep existing Projects and Current Work unchanged.
- Add optional post-to-Project references and post-context inquiry links.
- Measure errors and media cleanup before changing role navigation.

### Phase 4 — persona routing and authorization tightening

- Redirect Creatives to their profile.
- Reduce Creative navigation to profile, create, public discovery, and optionally own formal Projects.
- Make global inquiries and Website Studio Super Admin-only.
- Add Moderation to Super Admin.
- Remove Super Admin Create Post/My Profile actions.

### Phase 5 — role consolidation

- Generate and approve an account-by-account mapping report.
- Convert active legacy roles in a transaction while preserving user IDs and ownership.
- Keep compatibility parsing for at least one release.
- Tighten role constraints and invitation choices only after zero active legacy roles remain.

### Phase 6 — retirement cleanup

- Remove unreachable legacy UI code only after route and database usage telemetry/inventory show zero dependencies.
- Archive, do not drop, dormant Editorial data initially.
- Do not delete Projects or migrate their media into Posts.
- Consider dropping obsolete tables/functions only in a separately reviewed future migration with rollback/export artifacts.

## 10. Required test gates

At minimum, automated tests must prove:

- Creative A cannot select, update, archive, delete, or upload media to Creative B's private post.
- Creative B cannot see Creative A's draft.
- Public users see only published, clear, public posts belonging to published profiles.
- Super Admin cannot accidentally become post author through moderation.
- Moderation requires a reason and creates an immutable event.
- A post cannot publish with 11 images, foreign media, uploading media, unsafe URLs, or invalid document JSON.
- Archive/delete queues all R2 variants and does not delete still-referenced media.
- Direct video files are rejected.
- Lightbox keyboard navigation, focus return, reduced motion, and mobile gestures work.
- Creative routes cannot access Website Studio, Team, global Inquiries, or another profile's edit UI.
- Super Admin sees no Create Post control and has no required public profile.
- Existing Current Work, Portfolio, Project details, profile data, inquiries, and Website Studio remain operational while the feature flag is off.

## 11. Recommended implementation order

1. Production catalogue SQL and role/content ownership report.
2. Additive Posts schema, RLS, RPCs, and feature flag.
3. R2 post-image target and cleanup integration.
4. Structured document validator/renderer and security tests.
5. Composer with 10-image limit.
6. Feed media grid and accessible lightbox.
7. Profile owner controls and Creative login redirect.
8. Super Admin moderation and inquiry boundary tightening.
9. Account-by-account role migration.
10. Legacy UI retirement after verified zero use.

## Final recommendation

Proceed with the additive Posts domain rather than modifying Projects or reviving Editorial as-is. This produces the desired simple Creative experience while preserving the mature ownership, media, cleanup, and structured-content ideas already present in the system.

No production table, role, route, policy, or content should be removed during the first implementation phase.
