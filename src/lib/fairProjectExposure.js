function numberOrInfinity(value) {
  return Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : Number.POSITIVE_INFINITY;
}

export function compareEditorialPriority(a, b) {
  if (Boolean(a.featured) !== Boolean(b.featured)) return a.featured ? -1 : 1;
  const orderDifference = numberOrInfinity(a.display_order) - numberOrInfinity(b.display_order);
  if (orderDifference) return orderDifference;
  const dateDifference = String(b.project_date || b.created_at || '').localeCompare(String(a.project_date || a.created_at || ''));
  return dateDifference || String(a.id || '').localeCompare(String(b.id || ''));
}

export function eligibleProjectCredits(project) {
  return (project.credits || [])
    .filter((credit) => credit?.id && credit.isPublished !== false)
    .sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary))
      || numberOrInfinity(a.displayOrder) - numberOrInfinity(b.displayOrder)
      || String(a.id).localeCompare(String(b.id)));
}

export function fairProjectExposure(projects, limit = Number.POSITIVE_INFINITY) {
  const editorial = [...(projects || [])].sort(compareEditorialPriority);
  const assignedCounts = new Map();
  const groups = new Map();
  const uncredited = [];

  editorial.forEach((project) => {
    const credits = eligibleProjectCredits(project);
    if (!credits.length) { uncredited.push(project); return; }
    const primary = credits.find((credit) => credit.isPrimary);
    const owner = primary || credits.reduce((best, credit) => {
      if (!best) return credit;
      return (assignedCounts.get(credit.id) || 0) < (assignedCounts.get(best.id) || 0) ? credit : best;
    }, null);
    assignedCounts.set(owner.id, (assignedCounts.get(owner.id) || 0) + 1);
    if (!groups.has(owner.id)) groups.set(owner.id, []);
    groups.get(owner.id).push(project);
  });

  const queues = [...groups.entries()]
    .map(([id, items]) => ({ id, items: items.sort(compareEditorialPriority) }))
    .sort((a, b) => compareEditorialPriority(a.items[0], b.items[0]) || a.id.localeCompare(b.id));
  const result = [];
  while (queues.some((queue) => queue.items.length) && result.length < limit) {
    queues.forEach((queue) => {
      if (queue.items.length && result.length < limit) result.push(queue.items.shift());
    });
  }
  for (const project of uncredited.sort(compareEditorialPriority)) {
    if (result.length >= limit) break;
    result.push(project);
  }
  return result;
}

export function projectCreditSummary(project, visibleNames = 2) {
  const credits = eligibleProjectCredits(project);
  if (!credits.length) return null;
  const names = credits.slice(0, visibleNames).map((credit) => credit.name);
  const remaining = credits.length - names.length;
  const fullNames = credits.map((credit) => credit.name).join(', ');
  const roles = [...new Set(credits.flatMap((credit) => credit.roles || []).filter(Boolean))];
  return { names: `${names.join(', ')}${remaining > 0 ? ` +${remaining}` : ''}`, fullNames, roles: roles.slice(0, 2).join(' · ') };
}
