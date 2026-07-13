import { Archive, BellRing, Copy, Eye, MailCheck, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminActionButton, AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader, AdminStatusBadge, AdminSurface } from '../../components/admin/AdminUI';
import { canManageAllProjects, useAdminAccess } from '../../lib/adminAccess';
import { copyText } from '../../lib/clipboard';
import { formatDate } from '../../lib/helpers';
import { supabase } from '../../lib/supabaseClient';

const statuses = ['new', 'under_review', 'reviewed', 'contacted', 'scheduled', 'accepted', 'in_progress', 'completed', 'declined', 'closed'];
const statusLabels = { new: 'New', under_review: 'Under review', reviewed: 'Reviewed (legacy)', contacted: 'Contacted', scheduled: 'Scheduled', accepted: 'Accepted', in_progress: 'In progress', completed: 'Completed', declined: 'Declined', closed: 'Closed' };
const branchLabels = { studio: 'Liwa Studio', tech: 'Liwa Tech', digital: 'Liwa Digital', social: 'Liwa Social', general: 'General' };
const inquiryColumns = 'id, public_reference, name, email_or_contact, client_email, client_phone, organization, branch, service_key, project_type, budget_range, deadline, preferred_contact, preferred_schedule, service_mode, general_location, preferred_creative_id, assigned_creative_id, summary, details, message, request_metadata, source_path, status, internal_notes, archived_at, unread, notification_status, notification_attempts, notification_state, notification_error, created_at, updated_at';
const lineControl = 'dark-select w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-2.5 text-sm text-white outline-none [color-scheme:dark] focus:border-amber-200/60';

export default function AdminInquiries() {
  const [params] = useSearchParams();
  const [inquiries, setInquiries] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [search, setSearch] = useState(() => params.get('reference') || '');
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [updatingId, setUpdatingId] = useState('');
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  const { role } = useAdminAccess();
  const canManage = canManageAllProjects(role);
  const creativeMap = useMemo(() => Object.fromEntries(creatives.map((creative) => [creative.id, creative.name])), [creatives]);
  const serviceOptions = useMemo(() => [...new Set(inquiries.map((item) => item.project_type).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [inquiries]);

  async function loadInquiries() {
    const requestId = ++requestRef.current;
    setLoading(true); setLoadError('');
    const [inquiryResult, creativeResult] = await Promise.all([
      supabase.from('project_inquiries').select(inquiryColumns).order('created_at', { ascending: false }),
      supabase.rpc('list_eligible_inquiry_creatives'),
    ]);
    if (!mountedRef.current || requestId !== requestRef.current) return;
    if (inquiryResult.error) setLoadError(inquiryResult.error.message || 'Unable to load inquiries.');
    else setInquiries(inquiryResult.data || []);
    setCreatives(creativeResult.data || []);
    setLoading(false);
  }

  useEffect(() => { mountedRef.current = true; loadInquiries(); return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    if (!selected) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const close = (event) => { if (event.key === 'Escape' && !updatingId) setSelected(null); };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); };
  }, [selected, updatingId]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inquiries.filter((item) => showArchived ? Boolean(item.archived_at) : !item.archived_at)
      .filter((item) => statusFilter === 'all' || item.status === statusFilter)
      .filter((item) => branchFilter === 'all' || item.branch === branchFilter)
      .filter((item) => serviceFilter === 'all' || item.project_type === serviceFilter)
      .filter((item) => !query || [item.public_reference, item.name, item.client_email, item.email_or_contact, item.project_type, item.summary, creativeMap[item.preferred_creative_id], creativeMap[item.assigned_creative_id]].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [branchFilter, creativeMap, inquiries, search, serviceFilter, showArchived, statusFilter]);

  function openInquiry(inquiry) {
    setSelected(inquiry);
    setDraft({ status: inquiry.status, assigned_creative_id: inquiry.assigned_creative_id || '', internal_notes: inquiry.internal_notes || '' });
    if (canManage && inquiry.unread) updateInquiry(inquiry, { unread: false }, { quiet: true });
  }

  async function updateInquiry(inquiry, patch, options = {}) {
    if (updatingId) return false;
    setUpdatingId(inquiry.id); setError(''); if (!options.quiet) setMessage('');
    const { data, error: updateError } = await supabase.from('project_inquiries').update(patch).eq('id', inquiry.id).select(inquiryColumns).single();
    if (updateError) { setError(updateError.message || 'Unable to update the inquiry.'); setUpdatingId(''); return false; }
    setInquiries((current) => current.map((item) => item.id === inquiry.id ? data : item));
    setSelected((current) => current?.id === inquiry.id ? data : current);
    if (!options.quiet) setMessage(options.message || 'Inquiry updated.');
    setUpdatingId('');
    return true;
  }

  async function saveManagement() {
    if (!selected) return;
    const assignmentChanged = (draft.assigned_creative_id || null) !== (selected.assigned_creative_id || null);
    const notificationState = assignmentChanged ? { ...(selected.notification_state || {}), creative: 'pending' } : selected.notification_state;
    await updateInquiry(selected, { status: draft.status, assigned_creative_id: draft.assigned_creative_id || null, internal_notes: draft.internal_notes.trim() || null, unread: false, ...(assignmentChanged ? { notification_state: notificationState, notification_status: 'partially_sent' } : {}) }, { message: 'Inquiry assignment and status saved.' });
  }

  async function archiveInquiry() {
    if (!selected || !window.confirm(`Archive ${selected.public_reference}? It will remain in history.`)) return;
    const archived = await updateInquiry(selected, { archived_at: new Date().toISOString(), unread: false }, { message: 'Inquiry archived.' });
    if (archived) setSelected(null);
  }

  async function retryNotifications() {
    if (!selected || updatingId) return;
    setUpdatingId(selected.id); setError(''); setMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
      const { data, error: functionError } = await supabase.functions.invoke('submit-service-request', { headers: { Authorization: `Bearer ${session.access_token}` }, body: { action: 'retry_notification', reference: selected.public_reference } });
      if (functionError) throw functionError;
      if (!data?.success) throw new Error(data?.message || 'Notification retry failed.');
      setMessage(`Notification retry completed: ${data.notificationStatus}.`);
      await loadInquiries();
    } catch (retryError) { setError(retryError.message || 'Notification retry failed.'); }
    finally { setUpdatingId(''); }
  }

  async function copyContact(value) {
    try { await copyText(value); setMessage('Contact information copied.'); } catch { setError('Contact information could not be copied.'); }
  }

  return <AdminLayout><div className="w-full max-w-6xl">
    <AdminPageHeader eyebrow="Client pipeline" title="Project Inquiries" description="Review requests, assign the right creative, and keep every client conversation traceable." />
    {error && <AdminNotice className="mb-5">{error}</AdminNotice>}{message && <AdminNotice tone="success" className="mb-5">{message}</AdminNotice>}
    <section className="grid gap-4 border-y border-white/[0.08] py-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_10rem_12rem_10rem_auto] xl:items-end">
      <label className="grid gap-1.5 text-sm text-zinc-300"><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, client, service, or creative" className={lineControl} /></label>
      <label className="grid gap-1.5 text-sm text-zinc-300"><span>Branch</span><select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className={lineControl}><option value="all">All branches</option>{Object.entries(branchLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm text-zinc-300"><span>Service</span><select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)} className={lineControl}><option value="all">All services</option>{serviceOptions.map((service) => <option key={service} value={service}>{service}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm text-zinc-300"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={lineControl}><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
      <label className="flex min-h-11 items-center gap-2 text-sm text-zinc-400"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="accent-amber-300" />Archived</label>
    </section>

    {loading ? <InquirySkeleton /> : loadError ? <div className="border-b border-red-300/15 py-8"><p className="text-sm text-red-200">{loadError}</p><button type="button" onClick={loadInquiries} className="mt-3 border-b border-red-200/30 pb-1 text-sm text-red-100">Retry loading</button></div> : visible.length ? <div className="divide-y divide-white/[0.07]">{visible.map((inquiry) => <article key={inquiry.id} className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2">{inquiry.unread && <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,.75)]" aria-label="Unread inquiry" />}<h2 className="font-medium text-white">{inquiry.public_reference || 'Legacy inquiry'}</h2><AdminStatusBadge status={inquiry.status}>{statusLabels[inquiry.status] || inquiry.status}</AdminStatusBadge><span className="text-xs text-zinc-600">{formatDate(inquiry.created_at)}</span></div><p className="mt-2 text-sm text-zinc-300">{inquiry.name} <span className="text-zinc-600">·</span> {branchLabels[inquiry.branch] || 'Legacy'} <span className="text-zinc-600">·</span> {inquiry.project_type}</p><p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500">{inquiry.summary || inquiry.message}</p>{(inquiry.assigned_creative_id || inquiry.preferred_creative_id) && <p className="mt-2 text-xs text-amber-100/70">Creative: {creativeMap[inquiry.assigned_creative_id] || creativeMap[inquiry.preferred_creative_id] || 'Unavailable profile'}</p>}</div><AdminActionButton onClick={() => openInquiry(inquiry)}><Eye size={14} /> View details</AdminActionButton></article>)}</div> : <AdminEmptyState title="No inquiries match" message="Adjust the filters, or wait for a new service request." />}

    {selected && <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="inquiry-detail-title"><AdminSurface className="grid max-h-[calc(100vh-1.5rem)] w-full max-w-3xl gap-5 overflow-y-auto border-amber-200/20 bg-zinc-950/98 shadow-2xl"><div className="flex items-start justify-between gap-4 border-b border-amber-200/15 pb-4"><div><p className="text-xs uppercase tracking-[0.18em] text-amber-200/70">{selected.public_reference || 'Legacy inquiry'}</p><h2 id="inquiry-detail-title" className="mt-2 text-xl font-semibold text-white">{selected.name}</h2></div><button type="button" onClick={() => setSelected(null)} aria-label="Close inquiry details" className="text-zinc-400 hover:text-white"><X size={20} /></button></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Branch" value={branchLabels[selected.branch]} /><Detail label="Service" value={selected.project_type} /><Detail label="Submitted" value={formatDate(selected.created_at)} /><Detail label="Email" value={selected.client_email || selected.email_or_contact} action={<button type="button" onClick={() => copyContact(selected.client_email || selected.email_or_contact)} className="inline-flex items-center gap-1 text-xs text-amber-200"><Copy size={12} />Copy</button>} /><Detail label="Phone / message" value={selected.client_phone} /><Detail label="Preferred contact" value={selected.preferred_contact} /><Detail label="Schedule" value={selected.preferred_schedule} /><Detail label="Service mode" value={selected.service_mode} /><Detail label="General location" value={selected.general_location} /><Detail label="Budget" value={selected.budget_range} /><Detail label="Preferred creative" value={creativeMap[selected.preferred_creative_id]} /><Detail label="Assigned creative" value={creativeMap[selected.assigned_creative_id]} /></div>
      <div className="border-t border-white/[0.08] pt-4"><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">Summary</p><p className="mt-2 text-base text-white">{selected.summary || selected.project_type}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-300">{selected.details || selected.message}</p></div>
      {selected.request_metadata && Object.keys(selected.request_metadata).length > 0 && <div className="grid gap-3 border-t border-white/[0.08] pt-4 sm:grid-cols-2">{Object.entries(selected.request_metadata).map(([key, value]) => <Detail key={key} label={key.replace(/([A-Z])/g, ' $1')} value={typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)} />)}</div>}
      <div className="flex flex-wrap items-center gap-3 border-y border-white/[0.08] py-4 text-sm text-zinc-400"><MailCheck size={16} className="text-amber-200" /><span>Notification: {selected.notification_status || 'legacy'}</span>{selected.notification_attempts > 0 && <span className="text-xs text-zinc-600">{selected.notification_attempts} attempt(s)</span>}{selected.notification_error && <span className="w-full text-xs text-red-200">Delivery note: {selected.notification_error}</span>}</div>
      {canManage ? <div className="grid gap-5"><div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-1.5 text-sm text-zinc-300"><span>Status</span><select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))} className={lineControl}>{statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label><label className="grid gap-1.5 text-sm text-zinc-300"><span>Assign creative</span><select value={draft.assigned_creative_id} onChange={(event) => setDraft((current) => ({ ...current, assigned_creative_id: event.target.value }))} className={lineControl}><option value="">Unassigned</option>{creatives.map((creative) => <option key={creative.id} value={creative.id}>{creative.name}</option>)}</select></label></div><label className="grid gap-1.5 text-sm text-zinc-300"><span>Private internal notes</span><textarea value={draft.internal_notes} onChange={(event) => setDraft((current) => ({ ...current, internal_notes: event.target.value }))} maxLength="5000" className={`${lineControl} min-h-28 resize-y`} /></label><div className="flex flex-wrap gap-3"><AdminButton onClick={saveManagement} disabled={updatingId === selected.id}>Save management</AdminButton>{selected.notification_status !== 'sent' && <AdminButton variant="ghost" onClick={retryNotifications} disabled={updatingId === selected.id}><RefreshCw size={15} />Retry notification</AdminButton>}<AdminButton variant="ghost" onClick={archiveInquiry} disabled={updatingId === selected.id}><Archive size={15} />Archive</AdminButton></div></div> : <div className="flex items-center gap-2 text-xs text-zinc-500"><BellRing size={14} />You can view inquiries assigned to your profile. Management remains restricted.</div>}
    </AdminSurface></div>}
  </div></AdminLayout>;
}

function Detail({ label, value, action }) { if (value === null || value === undefined || value === '') return null; return <div className="border-t border-white/[0.08] pt-3"><div className="flex items-center justify-between gap-3"><p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">{label}</p>{action}</div><p className="mt-2 break-words text-sm text-zinc-300">{value}</p></div>; }
function InquirySkeleton() { return <div aria-label="Loading inquiries">{[0, 1, 2, 3].map((item) => <div key={item} className="grid gap-3 border-b border-white/[0.08] py-5"><div className="h-3 w-48 animate-pulse bg-white/[0.05]" /><div className="h-2 w-64 max-w-full animate-pulse bg-white/[0.04]" /><div className="h-2 w-full animate-pulse bg-white/[0.035]" /></div>)}</div>; }
