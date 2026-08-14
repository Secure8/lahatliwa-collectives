import { supabase } from './supabaseClient';

const projectFields = 'id, title, slug, category, description, cover_image, gallery_images, gallery_items, featured, display_order, project_date, created_at, work_status, progress_updates';
const CACHE_TTL = 60 * 1000;
const cache = new Map();

const cacheKey = (workStatus = '') => workStatus || 'all';
export function readCachedPublicProjectSummaries(workStatus = '') { return cache.get(cacheKey(workStatus))?.projects || null; }

function mapCredits(rows) {
  const byProject = new Map();
  (rows || []).forEach((row) => {
    if (!row.creative_members) return;
    const credit = {
      id: row.creative_members.id,
      name: row.creative_members.name,
      slug: row.creative_members.slug,
      profileImageUrl: row.creative_members.profile_image_url,
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

export async function fetchPublicProjectSummaries({ workStatus = '' } = {}) {
  const key = cacheKey(workStatus);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.projects;
  let query = supabase.from('projects').select(projectFields).eq('status', 'published');
  if (workStatus) query = query.eq('work_status', workStatus);
  const { data: projects, error: projectError } = await query.order('featured', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false }).order('project_date', { ascending: false, nullsFirst: false });
  if (projectError) throw projectError;
  if (!projects?.length) { cache.set(key, { projects: [], at: Date.now() }); return []; }

  let { data: links, error: linksError } = await supabase.from('project_creatives').select('project_id, role, contribution_role, credit_roles, is_primary, display_order, creative_members!project_creatives_creative_member_id_fkey(id, name, slug, role, profile_image_url)').in('project_id', projects.map((project) => project.id)).order('is_primary', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false });
  if (linksError && /credit_roles/i.test(`${linksError.message || ''} ${linksError.details || ''}`)) {
    ({ data: links, error: linksError } = await supabase.from('project_creatives').select('project_id, role, contribution_role, is_primary, display_order, creative_members!project_creatives_creative_member_id_fkey(id, name, slug, role, profile_image_url)').in('project_id', projects.map((project) => project.id)).order('is_primary', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false }));
  }
  if (linksError) throw linksError;
  const credits = mapCredits(links);
  const result = projects.map((project) => ({ ...project, credits: credits.get(project.id) || [] }));
  cache.set(key, { projects: result, at: Date.now() });
  return result;
}

export async function moderatePublicProject(projectId, reason) {
  const { data, error } = await supabase.rpc('moderate_public_project', { p_project_id: projectId, p_reason: reason });
  if (error) throw error;
  cache.clear();
  return data;
}
