export const TERMINAL_WORKFLOW_STATUSES = new Set(['completed', 'closed']);

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
