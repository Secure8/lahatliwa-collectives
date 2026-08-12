export const PROJECT_WORK_STATUSES = Object.freeze(['active', 'completed']);
export const PROJECT_UPDATE_TYPES = Object.freeze([
  ['progress', 'Progress'],
  ['content', 'Content published'],
  ['event', 'Event coverage'],
  ['milestone', 'Milestone'],
]);

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max);

export function normalizeProjectUpdate(update = {}, index = 0) {
  const type = PROJECT_UPDATE_TYPES.some(([key]) => key === update.type) ? update.type : 'progress';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(update.date || '')) ? update.date : '';
  const linkUrl = clean(update.linkUrl, 2048);
  return {
    id: clean(update.id, 80) || `update-${index + 1}`,
    type,
    date,
    title: clean(update.title, 160),
    body: clean(update.body, 3000),
    linkUrl: /^https:\/\//i.test(linkUrl) ? linkUrl : '',
    linkLabel: clean(update.linkLabel, 80),
  };
}

export function normalizeProjectUpdates(updates = []) {
  if (!Array.isArray(updates)) return [];
  return updates.slice(0, 100).map(normalizeProjectUpdate).filter((update) => update.title && update.body)
    .sort((left, right) => String(right.date).localeCompare(String(left.date)));
}

export function projectWorkStatus(value = '') {
  return PROJECT_WORK_STATUSES.includes(value) ? value : 'completed';
}

export function latestProjectUpdate(project = {}) {
  return normalizeProjectUpdates(project.progress_updates)[0] || null;
}
