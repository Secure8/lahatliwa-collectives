# Google Drive BYOS Phase 3A: isolated test upload

Status: implemented locally. This slice does not change project, profile, CMS, media-library, public-delivery, or cleanup destinations. Supabase remains the only operational/default website storage provider.

## Scope

- Authenticated active Super Admins managing their own account and active creatives linked to a published profile.
- One genuine JPEG, PNG, WebP, or PDF per request.
- Maximum file size: 2 MB.
- Controlled purpose: `admin_test_upload` only.
- Server-selected destination: the connection owner’s managed `Lahat Liwa/Originals` folder.
- Private Drive file and one server-managed `external_media_objects` record.
- No public URL, website attachment, migration, automatic reference change, or browser-selected Drive folder.

The endpoint is `google-drive-upload`. It accepts `multipart/form-data` with exactly:

```text
file=<one file>
purpose=admin_test_upload
```

Unknown fields, duplicate fields, missing request length, oversized bodies, and unknown purposes fail closed.

## Validation and security boundary

The function reuses the Phase 2 origin, session, Team eligibility, connection, and Vault credential helpers. It derives `owner_user_id` from the verified Supabase session and never accepts an owner, connection, Google account, root folder, or parent folder ID from the browser.

The server refreshes the Google access token, verifies the required scopes and stable Google account identity, checks the managed root, and independently verifies that the destination folder:

- has the Google folder MIME type;
- is not trashed;
- has `lahatLiwaRole=originals` and `lahatLiwaSchema=v1` app properties; and
- is a child of the stored managed root.

File MIME type is detected from its binary signature. The browser-supplied multipart MIME header is accepted only when it agrees with the detected type. Filenames are Unicode-normalized, stripped of path/control/reserved characters, length-limited, and assigned the detected canonical extension.

The browser receives only the Lahat Liwa media record ID, safe filename, verified MIME type, size, status, and friendly folder label. It does not receive OAuth credentials, Vault references, provider account IDs, Drive file/folder IDs, checksums, or provider metadata.

Apply [the Phase 3 SQL](../supabase/external_storage_phase3_google_drive_upload.sql) before enabling uploads. It changes authenticated read grants from full-table selection to safe column lists for `storage_connections` and `external_media_objects`; existing owner RLS remains in force. Service-role writes from the authenticated Edge Function remain server-only and are appropriate here because the owner and every provider identifier are resolved by trusted server code.

## Upload and failure lifecycle

1. Validate the request, purpose, file signature, size, and safe filename.
2. Resolve the active owner connection and server-mapped `Originals` folder.
3. Insert an `external_media_objects` row with `uploading` status.
4. Refresh and verify Google authorization and managed folders.
5. Use Google Drive’s multipart upload endpoint with private app metadata.
6. Verify the returned parent, MIME type, and byte size.
7. Finalize the metadata row as `available`, including Drive ID, parent ID, and MD5 checksum where Google supplies it.

Any pre-finalization failure marks the row `error` with a bounded internal error code. If Drive accepted the file but metadata finalization fails, the function immediately attempts to delete the provider file. A failed cleanup stores the Drive file ID only in the server-side column and marks `manual_cleanup_required`; the browser cannot select that column.

Multipart is intentionally limited to this small test slice. A later phase can add a resumable transport behind the same validation, purpose mapping, metadata lifecycle, and provider-result verification without changing normal website uploads.

## Feature gates and rollout order

Required website build gates:

```text
VITE_GOOGLE_DRIVE_CONNECTOR_ENABLED=true
VITE_GOOGLE_DRIVE_TEST_UPLOAD_ENABLED=true
```

Required Edge Function gate:

```text
GOOGLE_DRIVE_UPLOAD_ENABLED=true
```

The Storage page also reads the server capability from `google-drive-connection-check`; the control appears only when the build and server gates are both enabled and the owner connection is healthy.

Safe production order:

1. Review and manually apply `supabase/external_storage_phase3_google_drive_upload.sql`.
2. Deploy the changed `google-drive-connection-check` and new `google-drive-upload` functions with `--no-verify-jwt` because they verify the session themselves.
3. Keep `GOOGLE_DRIVE_UPLOAD_ENABLED=false` and the website test flag false during deployment.
4. Enable the server gate for a controlled test account, then build the website with the test flag.
5. Upload one disposable file from Admin → Storage.
6. Confirm the Drive file exists in `Lahat Liwa/Originals` and the matching metadata row is `available`.
7. Confirm project, profile, CMS, and media-library uploads still use Supabase.
8. Disable both test gates after verification if the test control should not remain visible.

Do not enable normal external uploads, public delivery, migrations, or Google Drive as the default provider in Phase 3A.
