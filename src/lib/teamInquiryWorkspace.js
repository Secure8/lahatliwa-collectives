export const WORKFLOW_VIEWS = [
  ['all', 'All Inquiries'],
  ['general', 'General'],
  ['mine', 'Assigned to Me'],
  ['open', 'Open'],
  ['awaiting_response', 'Awaiting Response'],
  ['accepted', 'Accepted'],
  ['in_progress', 'In Progress'],
  ['completed', 'Completed'],
  ['closed', 'Closed'],
];

export const WORKFLOW_LABELS = {
  new: 'New', open: 'Open', awaiting_response: 'Awaiting response', assigned: 'Assigned',
  accepted: 'Accepted', in_progress: 'In progress', completed: 'Completed', closed: 'Closed',
};

export const RESPONSE_LABELS = {
  available: 'Available', declined: 'Declined', unavailable: 'Unavailable for this request',
};

export function isSuperAdmin(role = '') {
  return ['super_admin', 'owner'].includes(role);
}

export function isTerminalInquiry(inquiry = {}) {
  return ['completed', 'closed'].includes(inquiry.workflow_status);
}

export function inquiryMatchesView(inquiry, view, memberId) {
  if (view === 'all') return true;
  if (view === 'general') return !inquiry.preferred_creative_id;
  if (view === 'mine') return inquiry.current_assignee_id === memberId;
  return inquiry.workflow_status === view;
}

export function canAcceptInquiry(inquiry, memberId) {
  return inquiry.current_assignee_id === memberId && ['awaiting_response', 'assigned'].includes(inquiry.workflow_status);
}

export function canCompleteInquiry(inquiry, memberId, role) {
  if (isSuperAdmin(role)) return !isTerminalInquiry(inquiry);
  return inquiry.current_assignee_id === memberId && ['accepted', 'in_progress'].includes(inquiry.workflow_status);
}

export function canDeleteInquiry(inquiry, role) {
  return isSuperAdmin(role) && isTerminalInquiry(inquiry);
}

export function responseSummary(teamMembers = [], responses = []) {
  const byMember = new Map(responses.map((response) => [response.team_member_id, response]));
  return teamMembers.filter((member) => member.creative_member_id).map((member) => ({
    memberId: member.id,
    name: member.display_name,
    response: byMember.get(member.id)?.response || 'no_response',
    note: byMember.get(member.id)?.response_note || '',
  }));
}

export function unreadForInquiry(receipts = [], inquiryId, memberId) {
  return receipts.some((receipt) => receipt.inquiry_id === inquiryId && receipt.team_member_id === memberId && receipt.is_unread);
}
