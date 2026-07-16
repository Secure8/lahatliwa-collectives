import { Copy, Edit, ExternalLink, Eye, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import CreativeProfileView from '../../components/CreativeProfileView';
import { AdminActionButton, AdminActionGroup, AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader, AdminStatusBadge } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { isPrivilegedRole, useAdminAccess } from '../../lib/adminAccess';
import { copyText } from '../../lib/clipboard';
import { supabase } from '../../lib/supabaseClient';
import AdminPeopleNav from '../../components/admin/AdminPeopleNav';

export default function AdminCreatives() {
  const { role } = useAdminAccess();
  const navigate = useNavigate();
  const [creatives, setCreatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [previewProjects, setPreviewProjects] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const previewId = searchParams.get('preview');
  const previewCreative = creatives.find((creative) => creative.id === previewId) || null;
  const visibleCreatives = useMemo(() => {
    const query = search.trim().toLowerCase();
    return creatives.filter((creative) => (
      (visibility === 'all' || (visibility === 'published' ? creative.is_published : !creative.is_published))
      && (!query || [creative.name, creative.role, creative.slug].some((value) => String(value || '').toLowerCase().includes(query)))
    ));
  }, [creatives, search, visibility]);

  useEffect(() => {
    supabase.from('creative_members').select('*').order('display_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) setError(loadError.message);
        else setCreatives(data || []);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!previewCreative) { setPreviewProjects([]); return; }
    setPreviewLoading(true);
    supabase.from('project_creatives').select('projects(*)').eq('creative_id', previewCreative.id)
      .order('is_primary', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false })
      .then(({ data, error: previewError }) => {
        if (previewError) setError(previewError.message);
        else setPreviewProjects((data || []).map((link) => link.projects).filter(Boolean));
        setPreviewLoading(false);
      });
  }, [previewCreative?.id]);

  async function copyProfileLink(creative) {
    try { await copyText(`${window.location.origin}/creatives/${creative.slug}`); setNotice('Profile link copied.'); }
    catch (copyError) { setError(copyError.message || 'Profile link could not be copied.'); }
  }

  if (!isPrivilegedRole(role)) return <Navigate to={role === 'creative' || role === 'editor' ? '/admin/my-profile' : '/admin/dashboard'} replace />;

  if (previewId) return (
    <AdminLayout>
      <AdminPageHeader eyebrow="People" title={previewCreative?.name || 'Profile preview'} description="Preview the public profile appearance." action={<AdminButton onClick={() => setSearchParams({})} variant="ghost">Back</AdminButton>} />
      <AdminPeopleNav />
      {error && <AdminNotice className="mb-5">{error}</AdminNotice>}
      {notice && <AdminNotice tone="success" className="mb-5">{notice}</AdminNotice>}
      {loading ? <LoadingState label="Loading profile preview" /> : previewCreative ? (
        <section className="py-7">
          <div className="mb-7 flex flex-wrap justify-end gap-2">
            <AdminButton onClick={() => copyProfileLink(previewCreative)}><Copy size={15} /> Copy link</AdminButton>
            {previewCreative.is_published && <AdminButton to={`/creatives/${previewCreative.slug}`}><ExternalLink size={15} /> Open public</AdminButton>}
          </div>
          {previewLoading ? <LoadingState label="Loading profile preview" /> : <CreativeProfileView creative={previewCreative} projects={previewProjects} adminPreview />}
        </section>
      ) : <AdminEmptyState title="Creative profile not found" action={<AdminButton onClick={() => setSearchParams({})}>Back</AdminButton>} />}
    </AdminLayout>
  );

  return (
    <AdminLayout>
      <AdminPageHeader eyebrow="People" title="Creative Profiles" description="Manage the public-facing identity, portfolio visibility, and profile media for each creative." action={<AdminButton variant="primary" to="/admin/creatives/new"><Plus size={17} /> Add Creative</AdminButton>} />
      <AdminPeopleNav />
      {error && <AdminNotice className="mb-5">{error}</AdminNotice>}
      {notice && <AdminNotice tone="success" className="mb-5">{notice}</AdminNotice>}
      {loading ? <LoadingState label="Loading creatives" /> : creatives.length ? (
        <section className="overflow-hidden rounded-lg border border-white/[0.1] bg-zinc-900">
          <div className="grid gap-3 border-b border-white/[0.1] p-4 sm:grid-cols-[minmax(14rem,1fr)_auto] sm:items-center">
            <label className="flex h-10 items-center gap-2 rounded-md border border-white/[0.12] bg-zinc-950 px-3"><Search size={15} className="text-zinc-600" /><span className="sr-only">Search creative profiles</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, role, or slug" className="min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600" /></label>
            <div className="flex gap-1 overflow-x-auto" aria-label="Filter creative profile visibility">{[['all','All'],['published','Published'],['draft','Drafts']].map(([key,label]) => <button key={key} type="button" aria-pressed={visibility === key} onClick={() => setVisibility(key)} className={`interactive-tab h-10 shrink-0 px-3 text-xs ${visibility === key ? 'text-white' : 'text-zinc-500 hover:text-white'}`}>{label}</button>)}</div>
          </div>
          {visibleCreatives.map((creative) => (
            <article key={creative.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-4 border-b border-white/[0.06] px-1 py-5 last:border-b-0 sm:px-2 lg:grid-cols-[3.5rem_minmax(0,1.15fr)_minmax(10rem,0.8fr)_minmax(9rem,0.55fr)_auto] lg:gap-x-6">
              {creative.profile_image_url ? <img src={creative.profile_image_url} alt="" loading="lazy" width="56" height="56" className="h-14 w-14 rounded-full object-cover" /> : <div className="grid h-14 w-14 place-items-center rounded-full bg-white/[0.055] text-lg font-semibold text-zinc-500">{creative.name?.slice(0, 1) || 'L'}</div>}
              <div className="min-w-0"><h3 className="truncate font-semibold text-white">{creative.name}</h3><p className="mt-1 truncate text-xs text-zinc-600">/{creative.slug}</p></div>
              <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2 lg:col-start-auto"><p className="text-[11px] uppercase tracking-[0.16em] text-zinc-600">Role / title</p><p className="mt-1 line-clamp-2 text-sm text-zinc-300">{creative.role}</p></div>
              <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:col-start-2 lg:col-start-auto">{creative.is_featured && <AdminStatusBadge status="featured">Featured</AdminStatusBadge>}<AdminStatusBadge status={creative.is_published ? 'published' : 'draft'}>{creative.is_published ? 'Published' : 'Draft'}</AdminStatusBadge></div>
              <div className="col-span-2 border-t border-white/[0.05] pt-3 sm:col-span-1 sm:col-start-2 lg:col-start-auto lg:border-0 lg:pt-0"><AdminActionGroup className="admin-record-actions lg:justify-end">
                <AdminActionButton variant="primary" onClick={() => navigate(`/admin/creatives/${creative.id}/edit`)}><Edit size={14} /> Edit</AdminActionButton>
                <AdminActionButton onClick={() => setSearchParams({ preview: creative.id })}><Eye size={14} /> Preview</AdminActionButton>
                <AdminActionButton onClick={() => copyProfileLink(creative)}><Copy size={14} /> Copy link</AdminActionButton>
                {creative.is_published && <AdminActionButton to={`/creatives/${creative.slug}`}><ExternalLink size={14} /> Open public</AdminActionButton>}
              </AdminActionGroup></div>
            </article>
          ))}
          {!visibleCreatives.length && <p className="px-5 py-12 text-center text-sm text-zinc-500">No creative profiles match this view.</p>}
        </section>
      ) : <AdminEmptyState title="No creatives yet." action={<AdminButton variant="primary" to="/admin/creatives/new"><Plus size={17} /> Add Creative</AdminButton>} />}
    </AdminLayout>
  );
}
