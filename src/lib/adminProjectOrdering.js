export function moveProjectByOffset(items, projectId, offset) {
  const fromIndex = items.findIndex((project) => project.id === projectId);
  const toIndex = fromIndex + offset;
  if (fromIndex < 0 || toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function moveProjectBefore(items, activeId, targetId) {
  const fromIndex = items.findIndex((project) => project.id === activeId);
  const toIndex = items.findIndex((project) => project.id === targetId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}
