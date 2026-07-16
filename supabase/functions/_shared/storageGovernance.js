export function budgetStatus(percent, policy = {}) {
  const value = Number(percent || 0);
  if (value >= Number(policy.blockPercent ?? 100)) return 'blocked';
  if (value >= Number(policy.pauseNonAdminPercent ?? 95)) return 'paused';
  if (value >= Number(policy.restrictLargePercent ?? 90)) return 'restricted';
  if (value >= Number(policy.strongWarningPercent ?? 85)) return 'strong_warning';
  if (value >= Number(policy.warningPercent ?? 75)) return 'warning';
  if (value >= Number(policy.infoPercent ?? 60)) return 'information';
  return 'normal';
}

export function evaluateStorageBudget({ activeBytes = 0, reservedBytes = 0, proposedBytes = 0, reserveBytes = 0, budgetBytes, role = '', override = false, overrideReason = '', largeUploadThresholdBytes = 3 * 1024 * 1024, policy = {} } = {}) {
  const budget = Math.max(1, Number(budgetBytes || 0));
  const projected = Math.max(0, Number(activeBytes)) + Math.max(0, Number(reservedBytes)) + Math.max(0, Number(proposedBytes)) + Math.max(0, Number(reserveBytes));
  const percentAfter = projected / budget * 100;
  const status = budgetStatus(percentAfter, policy);
  const superAdmin = ['owner', 'super_admin'].includes(role);
  const explicitOverride = superAdmin && override === true && String(overrideReason || '').trim().length >= 8;
  let allowed = true;
  let code = '';
  if (percentAfter >= Number(policy.blockPercent ?? 100) && !explicitOverride) { allowed = false; code = 'STORAGE_BUDGET_EXHAUSTED'; }
  else if (percentAfter >= Number(policy.pauseNonAdminPercent ?? 95) && !superAdmin) { allowed = false; code = 'STORAGE_UPLOADS_PAUSED'; }
  else if (percentAfter >= Number(policy.restrictLargePercent ?? 90) && Number(proposedBytes) >= largeUploadThresholdBytes && !superAdmin) { allowed = false; code = 'STORAGE_LARGE_UPLOAD_RESTRICTED'; }
  else if (override && !explicitOverride) { allowed = false; code = 'STORAGE_OVERRIDE_NOT_AUTHORIZED'; }
  return { allowed, code, status, percentAfter, overrideAccepted: allowed && explicitOverride };
}
