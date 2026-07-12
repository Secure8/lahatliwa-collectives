import { supabase } from './supabaseClient';

const projectFields = 'id, title, slug, category, description, cover_image, gallery_images, gallery_items, featured, display_order, project_date, created_at';
const CACHE_TTL = 60 * 1000;
let cachedProjects = null;
let cachedAt = 0;

export function readCachedPublicProjectSummaries() { return cachedProjects; }

function mapCredits(rows) {
  const byProject = new Map();
  (rows || []).forEach((row) => {
    if (!row.creative_members) return;
    const credit = {
      id: row.creative_members.id,
      name: row.creative_members.name,
      slug: row.creative_members.slug,
      profileRole: row.creative_members.role,
      roles: row.credit_roles?.length ? row.credit_roles : [row.role || row.contribution_role || row.creative_members.role].filter(Boolean),
      isPrimary: row.is_primary === true,
      displayOrder: row.display_order,
      isPublished: true,
    };
    if (!byProject.has(row.project_id)) byProject.set(row.project_id, []);
    byProject.get(row.project_id).push(credit);
  });
  return byProject;
}

export async function fetchPublicProjectSummaries() {
  if (cachedProjects && Date.now() - cachedAt < CACHE_TTL) return cachedProjects;
  const { data: projects, error: projectError } = await supabase.from('projects').select(projectFields).eq('status', 'published').order('featured', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false }).order('project_date', { ascending: false, nullsFirst: false });
  if (projectError) throw projectError;
  if (!projects?.length) { cachedProjects = []; cachedAt = Date.now(); return cachedProjects; }

  let { data: links, error: linksError } = await supabase.from('project_creatives').select('project_id, role, contribution_role, credit_roles, is_primary, display_order, creative_members!project_creatives_creative_member_id_fkey(id, name, slug, role)').in('project_id', projects.map((project) => project.id)).order('is_primary', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false });
  if (linksError && /credit_roles/i.test(`${linksError.message || ''} ${linksError.details || ''}`)) {
    ({ data: links, error: linksError } = await supabase.from('project_creatives').select('project_id, role, contribution_role, is_primary, display_order, creative_members!project_creatives_creative_member_id_fkey(id, name, slug, role)').in('project_id', projects.map((project) => project.id)).order('is_primary', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false }));
  }
  if (linksError) throw linksError;
  const credits = mapCredits(links);
  cachedProjects = projects.map((project) => ({ ...project, credits: credits.get(project.id) || [] }));
  cachedAt = Date.now();
  return cachedProjects;
}
