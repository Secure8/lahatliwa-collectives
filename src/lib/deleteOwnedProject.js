import { supabase } from './supabaseClient';

export async function deleteOwnedProject(projectId, reason = 'Project deleted by owner') {
  const { data, error } = await supabase.rpc('delete_project_with_cleanup', {
    p_project_id: projectId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message || 'The project could not be deleted.');
  return data;
}
