import { Edit, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminActionButton, AdminActionGroup, AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader, AdminStatusBadge } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { isPrivilegedRole, useAdminAccess } from '../../lib/adminAccess';
import { resolvePublicAssetUrl } from '../../lib/contentApi';
import { branchKeyFromRecord, serviceCategoriesForBranch } from '../../lib/serviceRequest';
import { supabase } from '../../lib/supabaseClient';
import { useAdminConfirmation } from '../../components/admin/AdminDialog';

export default function AdminServiceBranches() {
  const { role } = useAdminAccess(); const navigate = useNavigate();
  const [branches,setBranches]=useState([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const { requestConfirmation, confirmationDialog } = useAdminConfirmation();
  useEffect(()=>{supabase.from('service_branches').select('*').order('display_order',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false}).then(({data,error:loadError})=>{if(loadError)setError(loadError.message);else setBranches(data||[]);setLoading(false);});},[]);
  function deleteBranch(branch){requestConfirmation({title:`Delete “${branch.name}”?`,description:'This service branch will be removed from the public service structure. This cannot be undone.',confirmLabel:'Delete branch',destructive:true,onConfirm:()=>performDeleteBranch(branch)});}
  async function performDeleteBranch(branch){const{error:deleteError}=await supabase.from('service_branches').delete().eq('id',branch.id);if(deleteError)setError(deleteError.message);else setBranches((current)=>current.filter((item)=>item.id!==branch.id));}
  if(!isPrivilegedRole(role))return <Navigate to="/admin/dashboard" replace/>;
  return <AdminLayout>
    <AdminPageHeader eyebrow="Service structure" title="Service Branches" description="Manage the branch content shown on the public Services page. Public branches describe service paths, not staffed departments." action={<AdminButton to="/admin/service-branches/new" variant="primary"><Plus size={17}/> Add Branch</AdminButton>}/>
    {error&&<AdminNotice className="mb-5">{error}</AdminNotice>}
    {loading?<LoadingState label="Loading service branches"/>:branches.length?(
      <section className="overflow-hidden border-y border-white/[0.07]">
        {branches.map((branch)=><article key={branch.id} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-4 gap-y-4 border-b border-white/[0.06] px-1 py-5 last:border-b-0 sm:px-2 lg:grid-cols-[3rem_minmax(0,0.8fr)_minmax(0,1.25fr)_minmax(8rem,0.45fr)_auto] lg:gap-x-6">
          <div className="grid h-12 w-12 place-items-center">{branch.icon_url?<img src={resolvePublicAssetUrl(branch.icon_url)} alt="" loading="lazy" width="48" height="48" className="max-h-12 max-w-12 object-contain"/>:<span className="text-lg font-semibold text-zinc-600">{branch.name?.slice(0,1)||'L'}</span>}</div>
          <div className="min-w-0"><h3 className="truncate font-semibold text-white">{branch.name}</h3><p className="mt-1 truncate text-xs text-zinc-600">/{branch.slug}</p></div>
          <p className="col-span-2 line-clamp-2 text-sm leading-6 text-zinc-400 sm:col-span-1 sm:col-start-2 lg:col-start-auto">{branch.description||'No description yet.'}</p>
          <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1 sm:col-start-2 lg:col-start-auto"><AdminStatusBadge status={branch.is_published?'published':'draft'}>{branch.is_published?'Published':'Draft'}</AdminStatusBadge><span className="text-xs text-zinc-500">{serviceCategoriesForBranch(branchKeyFromRecord(branch)).length || 0} categories</span><span className="text-xs text-zinc-500">Order {branch.display_order??'—'}</span></div>
          <div className="col-span-2 border-t border-white/[0.05] pt-3 sm:col-span-1 sm:col-start-2 lg:col-start-auto lg:border-0 lg:pt-0"><AdminActionGroup className="lg:justify-end"><AdminActionButton variant="primary" onClick={()=>navigate(`/admin/service-branches/${branch.id}/edit`)}><Edit size={14}/> Edit</AdminActionButton><AdminActionButton to="/services"><ExternalLink size={14}/> Public</AdminActionButton><AdminActionButton onClick={()=>deleteBranch(branch)} variant="danger"><Trash2 size={14}/> Delete</AdminActionButton></AdminActionGroup></div>
        </article>)}
      </section>
    ) : (
      <AdminEmptyState
        title="No service branches yet"
        message="Add branches such as Studio, Social, Digital, and Tech."
        action={<AdminButton to="/admin/service-branches/new" variant="primary"><Plus size={17}/> Add Branch</AdminButton>}
      />
    )}
    {confirmationDialog}
  </AdminLayout>;
}
