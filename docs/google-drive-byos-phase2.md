# Google Drive BYOS — Phase 2 runbook

Status: complete and deployed to production project `fgelzlxfqeooxvvcpndd`. Phase 2 provides Google Drive connection management only; the separately reviewed Phase 3 test upload and Phase 4 project-gallery image flow were deployed later. Supabase remains the global default and public-delivery provider, and historical-media migration remains disabled.

## Security boundary

The browser authenticates to four Edge Functions. It receives only an authorization URL and normalized connection status. The Google authorization code is exchanged by the callback Edge Function. Access tokens and refresh tokens are never returned to React, local storage, query parameters, operational views, or logs.

OAuth state is generated with a cryptographically secure random source, stored only as a SHA-256 hash, bound to the initiating authenticated user, expires after 10 minutes, and is atomically consumed once. The PKCE verifier is stored behind a Vault reference and deleted when state is consumed. Callback return paths are restricted to `/admin/storage`.

Refresh tokens are stored in Supabase Vault. `storage_connections.credential_secret_id` is an opaque UUID. Private SQL helpers create, read, replace, and delete provider secrets. OAuth-state and credential operations remain entirely in the non-exposed `private` schema. Edge Functions use Supabase’s platform-provided `SUPABASE_DB_URL` direct connection with a one-connection pool; no decrypted credential is returned through the Data API, a browser response, or an operational view.

The requested scopes are exactly:

```text
openid
email
profile
https://www.googleapis.com/auth/drive.file
```

`drive.file` allows the application to work with files and folders it creates or that the user explicitly opens with it. The implementation does not request full-Drive access.

Eligible owners are active Super Admins managing their own connection and active creative users linked to a published creative profile. Every browser-triggered operation derives the owner from the verified Supabase JWT; it never trusts an owner ID supplied by the client. A Google account may have only one active Lahat Liwa owner connection.

## Managed folders

Connection completion prepares this metadata-only structure:

```text
Lahat Liwa
├── Originals
├── Project Files
├── Profile Media
└── Archive
```

Folders use the Google Drive folder MIME type and private `appProperties` (`lahatLiwaRole` and `lahatLiwaSchema=v1`). Reconnect verifies the stored root ID and its metadata. It does not choose a same-named folder or silently create a replacement when a stored root is missing. A first connection searches only app-created folders carrying the expected application properties. Multiple matches stop with an actionable error.

No media file upload, external file registration, migration job, copy, reference switch, or deletion is implemented in Phase 2.

## Google Cloud Console configuration

1. Create or select the production Google Cloud project.
2. Enable the Google Drive API.
3. Configure the OAuth consent screen with the canonical application name, support email, privacy policy, and production domain `lahatliwa.studio`.
4. Add only the four scopes listed above. If the consent screen remains in Testing, add the intended team members as test users and remember that Testing-mode refresh tokens can expire quickly.
5. Create an OAuth 2.0 Client ID of type **Web application**.
6. Add these exact authorized redirect URIs:

   - Local: `http://127.0.0.1:54321/functions/v1/google-drive-oauth-callback`
   - Production: `https://fgelzlxfqeooxvvcpndd.supabase.co/functions/v1/google-drive-oauth-callback`

The application does not use Google’s browser JavaScript SDK, so an authorized JavaScript origin is not required for this server flow. If an organization policy requires origins to be listed, use only `http://localhost:5173` for local work and `https://www.lahatliwa.studio` for production. Never add wildcard redirect URIs.

## Environment configuration

Store these as Supabase Edge Function secrets, not in Vercel, React, a tracked file, or a `VITE_*` variable:

```text
GOOGLE_DRIVE_OAUTH_ENABLED=true
GOOGLE_DRIVE_CLIENT_ID=<web client id>
GOOGLE_DRIVE_CLIENT_SECRET=<web client secret>
GOOGLE_DRIVE_REDIRECT_URI=<one exact callback URI above>
PUBLIC_SITE_URL=https://www.lahatliwa.studio
```

For local Supabase Functions, use the local callback and `PUBLIC_SITE_URL=http://localhost:5173`. The ports are derived from `supabase/config.toml` (`api.port=54321`) and Vite’s configured/default development port (`5173`).

The website has a separate, non-secret rollout gate:

```text
VITE_GOOGLE_DRIVE_CONNECTOR_ENABLED=true
```

The UI enables Connect only when both this build-time gate and the Edge Function’s server-side `GOOGLE_DRIVE_OAUTH_ENABLED`/configuration check pass. `externalUploadsEnabled` and `storageMigrationEnabled` stay false.

## Verified production rollout and recovery order

The production rollout completed the following reviewed sequence:

1. Apply the reviewed Phase 1 and Phase 2 SQL manually.
2. Configure the Google Cloud OAuth web client and the exact production redirect URI.
3. Store provider configuration in server-only Edge Function secrets.
4. Deploy the four Google Drive connection functions with JWT gateway verification disabled; each browser endpoint verifies the bearer session itself, while the callback uses the one-time state.
5. Enable the server and frontend connector gates for a controlled eligible group.
6. Verify connect, cancel, state expiry/reuse, wrong-account reconnect, connection checks, folder removal, token revocation, disconnect, mobile layout, and both themes before broader use.

Rollback is non-destructive: set the client gate false and `GOOGLE_DRIVE_OAUTH_ENABLED=false`. Existing connection rows and Drive folders remain for recovery. Do not drop Vault secrets until owners have explicitly disconnected or a separate reviewed retirement procedure is approved.

## Recovery and rotation

- **Revoked or invalid token:** status becomes `reconnect_required`; reconnect with the same Google account.
- **Missing managed root:** status records `FOLDER_MISSING`; restore the original folder if possible, then reconnect. The application will not silently duplicate it.
- **Duplicate managed roots:** stop and review the folders’ app metadata; do not let the application choose one by name.
- **OAuth client secret rotation:** create the replacement in Google Cloud, update the Supabase Edge secret, verify a connection, then revoke the old client secret. Keep the client ID stable where possible. If Google invalidates existing grants, owners must reconnect.
- **Suspected refresh-token exposure:** disable the connector, revoke the affected Google grant, disconnect/delete the corresponding Vault credential through the reviewed server operation, rotate the OAuth client secret if app-wide exposure is possible, and review safe request/error metadata. Never copy tokens into tickets or logs.

## Threat model and limitations

Controls address CSRF and callback replay (hashed one-time state), intercepted authorization codes (PKCE and exact redirect URI), client impersonation (verified Supabase user and server-derived ownership), cross-owner account reuse (database uniqueness and server checks), token leakage (Vault, no browser responses/logging), open redirects (fixed return path), overbroad Drive access (`drive.file`), and destructive disconnect ambiguity (recent session plus explicit confirmation).

Phase 2 itself does not provide media upload or public delivery. Phase 3 later added the isolated test upload, and Phase 4 added controlled project-gallery image originals with public Supabase previews. Resumable large-file upload, quota display, Shared Drive support, historical-media migration, cross-owner delegation, automatic folder repair, provider-webhook processing, and automated credential retirement remain separately reviewed Phase 5–7 work.
