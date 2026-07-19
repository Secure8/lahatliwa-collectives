const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const EDITORIAL_EDGE_ACTIONS = new Set([
  'save_revision', 'submit', 'start_revision', 'request_changes', 'approve',
  'schedule', 'publish', 'archive', 'restore_revision', 'restore_archived',
]);

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);
const objectValue = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : null;

export function safeEditorialWorkflowRequest(value) {
  const body = objectValue(value);
  if (!body) return null;
  const action = clean(body.action, 40);
  const postId = clean(body.postId, 80);
  if (!EDITORIAL_EDGE_ACTIONS.has(action) || !UUID_PATTERN.test(postId)) return null;

  const payload = { postId };
  if (['request_changes', 'approve', 'archive'].includes(action)) payload.note = clean(body.note, 500);
  if (action === 'schedule') {
    const scheduledFor = clean(body.scheduledFor, 80);
    if (!scheduledFor || !Number.isFinite(Date.parse(scheduledFor))) return null;
    payload.scheduledFor = new Date(scheduledFor).toISOString();
  }
  if (action === 'restore_revision') {
    const revisionId = clean(body.revisionId, 80);
    if (!UUID_PATTERN.test(revisionId)) return null;
    payload.revisionId = revisionId;
  }
  if (action === 'save_revision') {
    const document = objectValue(body.document);
    const metadata = objectValue(body.metadata);
    const expectedCurrentRevisionId = clean(body.expectedCurrentRevisionId, 80);
    if (!document || !metadata || JSON.stringify(document).length > 1_000_000 || JSON.stringify(metadata).length > 30_000) return null;
    if (expectedCurrentRevisionId && !UUID_PATTERN.test(expectedCurrentRevisionId)) return null;
    Object.assign(payload, {
      document,
      metadata,
      seoTitle: clean(body.seoTitle, 180),
      seoDescription: clean(body.seoDescription, 320),
      editorNote: clean(body.editorNote, 1000),
      expectedCurrentRevisionId: expectedCurrentRevisionId || null,
    });
  }
  return { action, payload };
}

export function editorialWorkflowError(error) {
  const raw = `${error?.code || ''} ${error?.message || ''}`;
  if (raw.includes('EDITORIAL_REVISION_CONFLICT')) return { code: 'EDITORIAL_REVISION_CONFLICT', message: 'A newer revision was saved. Reload and compare before saving again.', status: 409 };
  if (raw.includes('EDITORIAL_NOT_AUTHORIZED') || error?.code === '42501') return { code: 'EDITORIAL_NOT_AUTHORIZED', message: 'Your Editorial role does not allow this action.', status: 403 };
  if (raw.includes('EDITORIAL_POST_NOT_FOUND')) return { code: 'EDITORIAL_POST_NOT_FOUND', message: 'The Editorial post could not be found.', status: 404 };
  if (/EDITORIAL_(?:TRANSITION|RESTORE)_NOT_ALLOWED|EDITORIAL_REVISION_REQUIRED/.test(raw)) return { code: 'EDITORIAL_ACTION_NOT_ALLOWED', message: 'This action is not available for the current Editorial status.', status: 409 };
  if (/EDITORIAL_(?:DOCUMENT|METADATA|POST_ID|PAYLOAD|ACTION)_INVALID/.test(raw) || error?.code === '22023') return { code: 'EDITORIAL_INPUT_INVALID', message: 'The Editorial request contains invalid or incomplete information.', status: 400 };
  return { code: 'EDITORIAL_WORKFLOW_FAILED', message: 'The Editorial action could not be completed.', status: 500 };
}
