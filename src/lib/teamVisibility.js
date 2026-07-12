export function isVisibleTeamMember(member) {
  return Boolean(member) && member.status !== 'deleted';
}

export function filterVisibleTeamMembers(rows, excludedIds = new Set()) {
  return (rows || []).filter((member) => isVisibleTeamMember(member) && !excludedIds.has(member.id));
}

export function removeDeletedTeamMember(rows, deletedMemberId) {
  return (rows || []).filter((member) => member.id !== deletedMemberId);
}
