export const TERMINAL_WORKFLOW_STATUSES = new Set(['completed', 'closed']);
export const TEAM_INQUIRY_ACTIONS = new Set([
  'mark_read', 'respond', 'accept', 'decline', 'transfer', 'admin_assign',
  'request_assignment', 'approve_request', 'reject_request', 'start_progress',
  'mark_completed', 'close', 'private_note', 'archive',
]);
export const TEAM_INQUIRY_PAYLOAD_LIMITS = {
  expected_workflow_status: 40,
  response: 20,
  note: 2000,
  target_member_id: 80,
  request_id: 80,
};

export function canPermanentlyDeleteInquiry(role, workflowStatus, confirmation) {
  return ['super_admin', 'owner'].includes(role) && TERMINAL_WORKFLOW_STATUSES.has(workflowStatus) && confirmation === 'DELETE';
}

export function assignmentDeliveryStatus(direct, fallback) {
  if (direct === 'sent') return 'sent';
  if (fallback === 'sent') return 'partially_sent';
  return 'failed';
}

export function constantTimeTextMatch(value = '', expected = '') {
  const encoder = new TextEncoder();
  const left = encoder.encode(String(value));
  const right = encoder.encode(String(expected));
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) difference |= (left[index] || 0) ^ (right[index] || 0);
  return difference === 0;
}

export function safeTeamInquiryPayload(value) {
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([key]) => !Object.hasOwn(TEAM_INQUIRY_PAYLOAD_LIMITS, key))) return null;
  return Object.fromEntries(entries.map(([key, item]) => [
    key,
    String(item ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, TEAM_INQUIRY_PAYLOAD_LIMITS[key]),
  ]));
}
