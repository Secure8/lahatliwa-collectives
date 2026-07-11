import { Copy, Eye, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminActionButton, AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader, AdminStatusBadge, AdminSurface } from '../../components/admin/AdminUI';
import { canManageAllProjects, useAdminAccess } from '../../lib/adminAccess';
import { copyText } from '../../lib/clipboard';
import { formatDate } from '../../lib/helpers';
import { supabase } from '../../lib/supabaseClient';

const statuses = ['new', 'reviewed', 'contacted', 'accepted', 'declined', 'completed'];
const filters = ['all', ...statuses];
const statusLabels = { new: 'New', reviewed: 'Reviewed', contacted: 'Contacted', accepted: 'Accepted', declined: 'Declined', completed: 'Completed' };
const inquiryColumns = 'id, name, email_or_contact, organization, project_type, budget_range, deadline, preferred_contact, preferred_creative_id, message, status, created_at, updated_at';
const lineControl = 'w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-2.5 text-sm text-white outline-none [color-scheme:dark] focus:border-amber-200/60';

export default function AdminInquiries() {
  const [inquiries, setInquiries] = useState([]);
  const [creativeNames, setCreativeNames] = useState({});
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  const { role, adminUser } = useAdminAccess();
  const canManage = canManageAllProjects(role);

  async function loadInquiries() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError('');
    const [{ data, error: inquiryError }, { data: creativeRows }] = await Promise.all([
      supabase.from('project_inquiries').select(inquiryColumns).order('created_at', { ascending: false }),
      supabase.from('creative_members').select('id, name').eq('is_published', true),
    ]);
    if (!mountedRef.current || requestId !== requestRef.current) return;
    if (inquiryError) setLoadError(inquiryError.message || 'Unable to load inquiries.');
    else {
      setInquiries(data || []);
      setCreativeNames(Object.fromEntries((creativeRows || []).map((creative) => [creative.id, creative.name])));
    }
    setLoading(false);
  }

  useEffect(() => {
    mountedRef.current = true;
    loadInquiries();
    return () => { mountedRef.current = false; };
  }, []);

  const counts = useMemo(() => Object.fromEntries(filters.map((filter) => [filter, filter === 'all' ? inquiries.length : inquiries.filter((item) => item.status === filter).length])), [inquiries]);
  const visibleInquiries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inquiries
      .filter((item) => activeFilter === 'all' || item.status === activeFilter)
      .filter((item) => !query || [item.name, item.email_or_contact, item.project_type, item.message, creativeNames[item.preferred_creative_id]].some((value) => String(value || '').toLowerCase().includes(query)))
      .sort((a, b) => sort === 'oldest' ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.created_at) - new Date(a.created_at));
  }, [activeFilter, creativeNames, inquiries, search, sort]);

  async function updateStatus(inquiry, status) {
    if (updatingId) return;
    setUpdatingId(inquiry.id); setError(''); setMessage('');
    const { data, error: statusError } = await supabase.from('project_inquiries').update({ status }).eq('id', inquiry.id).select(inquiryColumns).single();
    if (statusError) setError(statusError.message || 'Unable to update inquiry status.');
    else {
      setInquiries((current) => current.map((item) => item.id === inquiry.id ? data : item));
      setSelected((current) => current?.id === inquiry.id ? data : current);
      setMessage(`Inquiry from ${inquiry.name} marked ${statusLabels[status] || status}.`);
    }
    setUpdatingId('');
  }

  async function deleteInquiry(inquiry) {
    if (updatingId || !window.confirm(`Delete inquiry from “${inquiry.name}”? This cannot be undone.`)) return;
    setUpdatingId(inquiry.id); setError(''); setMessage('');
    const { error: deleteError } = await supabase.from('project_inquiries').delete().eq('id', inquiry.id);
    if (deleteError) setError(deleteError.message || 'Unable to delete this inquiry.');
    else {
      setInquiries((current) => current.filter((item) => item.id !== inquiry.id));
      setSelected(null);
      setMessage(`Inquiry from ${inquiry.name} deleted.`);
    }
    setUpdatingId('');
  }

  async function copyContact(value) {
    try { await copyText(value); setMessage('Contact information copied.'); }
    catch (copyError) { setError(copyError.message || 'Contact information could not be copied.'); }
  }

  return <AdminLayout><div className="w-full max-w-6xl">
    <AdminPageHeader eyebrow="Client pipeline" title="Project Inquiries" description="Review public project requests and keep each conversation’s status clear." />
    {error && <AdminNotice className="mb-5">{error}</AdminNotice>}
    {message && <AdminNotice tone="success" className="mb-5">{message}</AdminNotice>}

    <section className="border-b border-white/[0.08] pb-5">
      <div className="flex gap-5 overflow-x-auto">
        {filters.map((filter) => <button key={filter} type="button" onClick={() => setActiveFilter(filter)} className={`shrink-0 border-b pb-3 text-sm transition ${activeFilter === filter ? 'border-amber-200 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}>{statusLabels[filter] || 'All'} <span className="ml-1 text-xs text-zinc-600">{counts[filter]}</span></button>)}
      </div>
    </section>

    <section className="grid gap-4 border-b border-white/[0.08] py-6 sm:grid-cols-[minmax(0,1fr)_12rem]">
      <label className="grid gap-1.5 text-sm text-zinc-300"><span>Search inquiries</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, contact, project type, message, or creative" className={lineControl} /></label>
      <label className="grid gap-1.5 text-sm text-zinc-300"><span>Sort order</span><select value={sort} onChange={(event) => setSort(event.target.value)} className={lineControl}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
    </section>

    {loading ? <InquirySkeleton /> : loadError ? <div className="border-b border-red-300/15 py-8"><p className="text-sm text-red-200">{loadError}</p><button type="button" onClick={loadInquiries} className="mt-3 border-b border-red-200/30 pb-1 text-sm text-red-100">Retry loading inquiries</button></div> : visibleInquiries.length ? <div className="divide-y divide-white/[0.07]">
      {visibleInquiries.map((inquiry) => <article key={inquiry.id} className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-medium text-white">{inquiry.name}</h2><AdminStatusBadge status={inquiry.status}>{statusLabels[inquiry.status] || inquiry.status}</AdminStatusBadge><span className="text-xs text-zinc-600">{formatDate(inquiry.created_at)}</span></div><p className="mt-2 text-sm text-zinc-500">{inquiry.project_type} · {inquiry.email_or_contact}</p><p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">{inquiry.message}</p>{creativeNames[inquiry.preferred_creative_id] && <p className={`mt-2 text-xs ${inquiry.preferred_creative_id === adminUser?.creative_member_id ? 'text-amber-100' : 'text-zinc-600'}`}>Preferred creative: {creativeNames[inquiry.preferred_creative_id]}</p>}</div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end"><AdminActionButton onClick={() => setSelected(inquiry)}><Eye size={14} /> View Details</AdminActionButton>{canManage ? <><label className="sr-only" htmlFor={`status-${inquiry.id}`}>Status for {inquiry.name}</label><select id={`status-${inquiry.id}`} value={inquiry.status} disabled={updatingId === inquiry.id} onChange={(event) => updateStatus(inquiry, event.target.value)} className="h-9 border-0 border-b border-white/[0.12] bg-transparent px-1 text-xs text-zinc-300 outline-none [color-scheme:dark] focus:border-amber-200/60">{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select><AdminActionButton disabled={updatingId === inquiry.id} onClick={() => deleteInquiry(inquiry)} variant="danger"><Trash2 size={14} /> {updatingId === inquiry.id ? 'Working...' : 'Delete'}</AdminActionButton></> : <span className="text-xs text-zinc-600">View only</span>}</div>
      </article>)}
    </div> : <AdminEmptyState title={inquiries.length ? 'No inquiries match these filters' : 'No inquiries yet'} message={inquiries.length ? 'Adjust the search or status filter.' : 'New public inquiries will appear here.'} />}

    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="inquiry-detail-title"><AdminSurface className="grid max-h-[calc(100vh-2rem)] w-full max-w-2xl gap-5 overflow-y-auto"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Inquiry details</p><h2 id="inquiry-detail-title" className="mt-2 text-xl font-semibold text-white">{selected.name}</h2></div><button type="button" onClick={() => setSelected(null)} aria-label="Close inquiry details" className="text-zinc-400 hover:text-white"><X size={20} /></button></div><div className="grid gap-4 sm:grid-cols-2"><Detail label="Contact" value={selected.email_or_contact} action={<button type="button" onClick={() => copyContact(selected.email_or_contact)} className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"><Copy size={13} /> Copy</button>} /><Detail label="Organization" value={selected.organization} /><Detail label="Project type" value={selected.project_type} /><Detail label="Budget" value={selected.budget_range} /><Detail label="Deadline" value={selected.deadline ? formatDate(selected.deadline) : ''} /><Detail label="Preferred contact" value={selected.preferred_contact} /><Detail label="Preferred creative" value={creativeNames[selected.preferred_creative_id]} /><Detail label="Submitted" value={formatDate(selected.created_at)} /></div><div className="border-t border-white/[0.08] pt-4"><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">Message</p><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-300">{selected.message}</p></div><div className="flex justify-end"><AdminButton onClick={() => setSelected(null)} variant="ghost">Close</AdminButton></div></AdminSurface></div>}
  </div></AdminLayout>;
}

function Detail({ label, value, action }) { if (!value) return null; return <div className="border-t border-white/[0.08] pt-3"><div className="flex items-center justify-between gap-3"><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">{label}</p>{action}</div><p className="mt-2 break-words text-sm text-zinc-300">{value}</p></div>; }
function InquirySkeleton() { return <div aria-label="Loading inquiries">{[0, 1, 2, 3].map((item) => <div key={item} className="grid gap-3 border-b border-white/[0.08] py-5"><div className="h-3 w-48 animate-pulse bg-white/[0.05]" /><div className="h-2 w-64 max-w-full animate-pulse bg-white/[0.04]" /><div className="h-2 w-full animate-pulse bg-white/[0.035]" /></div>)}</div>; }
