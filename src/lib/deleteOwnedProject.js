import { deleteGoogleDriveMedia, prepareGoogleDriveProjectDeletion } from './googleDriveStorage';
import { collectProjectExternalMediaObjectIds, collectProjectExternalPreviewPaths, collectProjectMediaPaths } from './projectMediaCleanup';
import { finalizeManagedProjectDeletion, prepareManagedProjectDeletion } from './r2Media';
import { deleteImages } from './storage';
import { supabase } from './supabaseClient';

export async function deleteOwnedProject(projectId) {
  const { data: project, error: loadError } = await supabase.from('projects').select('*').eq('id', projectId).single();
  if (loadError) throw loadError;
  const externalMediaIds = collectProjectExternalMediaObjectIds(project);
  const previewPaths = new Set(collectProjectExternalPreviewPaths(project));
  const mediaPaths = collectProjectMediaPaths(project).filter((path) => !previewPaths.has(path));
  if (externalMediaIds.length) await prepareGoogleDriveProjectDeletion(project.id, externalMediaIds);
  const prepared = await prepareManagedProjectDeletion(project.id);
  const { error: queueError } = await supabase.rpc('enqueue_project_media_cleanup', { p_project_id: project.id, p_paths: mediaPaths, p_reason: 'project_deleted' });
  if (queueError) throw queueError;
  const { error: deleteError } = await supabase.from('projects').delete().eq('id', project.id);
  if (deleteError) throw deleteError;
  await Promise.allSettled([
    ...(mediaPaths.length ? [(async () => { await deleteImages(mediaPaths); await supabase.rpc('complete_project_cleanup_paths', { p_project_id: project.id, p_paths: mediaPaths }); })()] : []),
    ...externalMediaIds.map((mediaId) => deleteGoogleDriveMedia(mediaId, { projectId: project.id })),
    ...(prepared.authorization ? [finalizeManagedProjectDeletion(project.id, prepared.authorization)] : []),
  ]);
  return project;
}
