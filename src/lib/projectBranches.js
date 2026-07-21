export const PROJECT_BRANCHES = [
  { key: 'studio', label: 'Liwa Studio', description: 'Photo, video, and visual production' },
  { key: 'digital', label: 'Liwa Digital', description: 'Websites, applications, and digital systems' },
  { key: 'tech', label: 'Liwa Explore', description: 'Tourism stories, information, and visitor support' },
  { key: 'social', label: 'Liwa Social', description: 'Social media, campaigns, and content' },
];

const categoryAliases = new Map([
  ['liwa studio', 'studio'], ['photography', 'studio'], ['videography', 'studio'], ['photo editing', 'studio'], ['video editing', 'studio'], ['event coverage', 'studio'], ['visual production', 'studio'],
  ['liwa digital', 'digital'], ['website development', 'digital'], ['app development', 'digital'], ['ui design', 'digital'], ['digital systems', 'digital'], ['software projects', 'digital'],
  ['liwa tech', 'tech'], ['liwa explore', 'tech'], ['tourism', 'tech'], ['destination storytelling', 'tech'], ['it support', 'tech'], ['computer services', 'tech'], ['device setup', 'tech'], ['technical assistance', 'tech'], ['software installation', 'tech'], ['system maintenance', 'tech'],
  ['liwa social', 'social'], ['social media management', 'social'], ['digital marketing', 'social'], ['content planning', 'social'], ['campaigns', 'social'], ['social graphics', 'social'], ['page management', 'social'], ['promotional content', 'social'],
]);

export function projectBranchKey(category) {
  return categoryAliases.get(String(category || '').trim().toLowerCase()) || null;
}

export function normalizeBranchQuery(value, fallback = null) {
  return PROJECT_BRANCHES.some((branch) => branch.key === value) ? value : fallback;
}

export function branchForKey(key) {
  return PROJECT_BRANCHES.find((branch) => branch.key === key) || null;
}

export function projectsForBranch(projects, branchKey) {
  const validKey = normalizeBranchQuery(branchKey);
  return validKey ? (projects || []).filter((project) => projectBranchKey(project.category) === validKey) : [...(projects || [])];
}

export function branchProjectsUrl(branchKey) {
  const validKey = normalizeBranchQuery(branchKey);
  return validKey ? `/projects?branch=${validKey}` : '/projects';
}
