import { FunctionsHttpError } from '@supabase/supabase-js';
import { ArrowRightLeft, CheckCircle2, Copy, Eye, Hand, MailCheck, RefreshCw, Trash2, UserPlus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminActionButton, AdminButton, AdminEmptyState, AdminInput, AdminNotice, AdminPageHeader, AdminStatusBadge, AdminSurface } from '../../components/admin/AdminUI';
import { useAdminAccess } from '../../lib/adminAccess';
import { copyText } from '../../lib/clipboard';
import { formatDate } from '../../lib/helpers';
import { canAcceptInquiry, canCompleteInquiry, canDeleteInquiry, inquiryMatchesView, isSuperAdmin, RESPONSE_LABELS, responseSummary, unreadForInquiry, WORKFLOW_LABELS, WORKFLOW_VIEWS } from '../../lib/teamInquiryWorkspace';
import { supabase } from '../../lib/supabaseClient';

const inquiryColumns = 'id, public_reference, name, email_or_contact, client_email, client_phone, organization, branch, service_key, project_type, budget_range, deadline, preferred_contact, preferred_schedule, service_mode, general_location, preferred_creative_id, assigned_creative_id, current_assignee_id, summary, details, message, request_metadata, source_path, status, workflow_status, archived_at, notification_status, notification_attempts, notification_state, notification_error, completed_at, completed_by, completion_note, closed_at, created_at, updated_at';
const branchLabels = { studio: 'Liwa Studio', tech: 'Liwa Tech', digital: 'Liwa Digital', social: 'Liwa Social', general: 'General' };
const lineControl = 'dark-select min-w-0 w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-2.5 text-sm text-white outline-none [color-scheme:dark] focus:border-amber-200/60';

async function functionErrorMessage(error, fallback) {
  if (error instanceof FunctionsHttpError && error.context) {
    try { const payload = await error.context.clone().json(); return payload?.message || payload?.error || fallback; } catch {
      try { return (await error.context.text()) || fallback; } catch { return fallback; }
    }
  }
  return error?.message || fallback;
}

export default function AdminInquiries() {
  const [params] = useSearchParams();
  const { role, adminUser } = useAdminAccess();
  const memberId = adminUser?.id || '';
  const superAdmin = isSuperAdmin(role);
  const [data, setData] = useState({ inquiries: [], team: [], responses: [], assignments: [], requests: [], receipts: [], history: [], deliveries: [], privateNotes: [] });
  const [view, setView] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [search, setSearch] = useState(() => params.get('reference') || '');
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [responseNote, setResponseNote] = useState('');
  const [actionNote, setActionNote] = useState('');
  const [targetMemberId, setTargetMemberId] = useState('');
  const [privateNote, setPrivateNote] = useState('');
  const [deleteState, setDeleteState] = useState(null);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  const realtimeTimerRef = useRef(null);

  const selected = useMemo(() => data.inquiries.find((item) => item.id === selectedId) || null, [data.inquiries, selectedId]);
  const teamMap = useMemo(() => Object.fromEntries(data.team.map((member) => [member.id, member])), [data.team]);
  const creativeOwnerMap = useMemo(() => Object.fromEntries(data.team.filter((member) => member.creative_member_id).map((member) => [member.creative_member_id, member])), [data.team]);
  const eligibleCreatives = useMemo(() => data.team.filter((member) => member.creative_member_id && member.id !== selected?.current_assignee_id), [data.team, selected?.current_assignee_id]);

  async function loadWorkspace({ quiet = false } = {}) {
    const requestId = ++requestRef.current;
    if (!quiet) setLoading(true);
    setLoadError('');
    const requests = [
      supabase.from('project_inquiries').select(inquiryColumns).order('created_at', { ascending: false }),
      supabase.rpc('list_inquiry_team_members'),
      supabase.from('inquiry_member_responses').select('*').order('updated_at', { ascending: false }),
      supabase.from('inquiry_assignments').select('*').order('created_at', { ascending: false }),
      supabase.from('inquiry_assignment_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('inquiry_read_receipts').select('*'),
      supabase.from('inquiry_status_history').select('*').order('created_at', { ascending: false }),
      ...(superAdmin ? [supabase.from('inquiry_delivery_attempts').select('*').order('created_at'), supabase.from('inquiry_private_notes').select('*')] : []),
    ];
    const results = await Promise.all(requests);
    if (!mountedRef.current || requestId !== requestRef.current) return;
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      setLoadError(failed.error.message || 'Unable to load the Team inquiry workspace.');
    } else {
      setData({
        inquiries: results[0].data || [], team: results[1].data || [], responses: results[2].data || [],
        assignments: results[3].data || [], requests: results[4].data || [], receipts: results[5].data || [],
        history: results[6].data || [], deliveries: superAdmin ? (results[7].data || []) : [], privateNotes: superAdmin ? (results[8].data || []) : [],
      });
    }
    if (!quiet) setLoading(false);
  }

  useEffect(() => { mountedRef.current = true; loadWorkspace(); return () => { mountedRef.current = false; }; }, [superAdmin]);
  useEffect(() => {
    const refresh = () => {
      window.clearTimeout(realtimeTimerRef.current);
      realtimeTimerRef.current = window.setTimeout(() => loadWorkspace({ quiet: true }), 250);
    };
    const channel = supabase.channel(`team-inquiry-workspace-${memberId || 'unknown'}`);
    ['project_inquiries', 'inquiry_member_responses', 'inquiry_assignments', 'inquiry_assignment_requests', 'inquiry_read_receipts'].forEach((table) => channel.on('postgres_changes', { event: '*', schema: 'public', table }, refresh));
    channel.subscribe();
    return () => { window.clearTimeout(realtimeTimerRef.current); supabase.removeChannel(channel); };
  }, [memberId]);
  useEffect(() => {
    if (!selected) return undefined;
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const close = (event) => { if (event.key === 'Escape' && !working) setSelectedId(''); };
    window.addEventListener('keydown', close);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', close); };
  }, [selected, working]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.inquiries
      .filter((item) => showArchived ? Boolean(item.archived_at) : !item.archived_at)
      .filter((item) => branchFilter === 'all' || item.branch === branchFilter)
      .filter((item) => inquiryMatchesView(item, view, memberId))
      .filter((item) => !query || [item.public_reference, item.name, item.client_email, item.email_or_contact, item.project_type, item.summary, creativeOwnerMap[item.preferred_creative_id]?.display_name, teamMap[item.current_assignee_id]?.display_name].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [branchFilter, creativeOwnerMap, data.inquiries, memberId, search, showArchived, teamMap, view]);

  async function performAction(action, payload = {}, options = {}) {
    if (!selected || working) return false;
    setWorking(true); setError(''); setMessage('');
    const { error: actionError } = await supabase.rpc('perform_team_inquiry_action', { p_inquiry_id: selected.id, p_action: action, p_payload: { ...payload, expected_workflow_status: selected.workflow_status } });
    if (actionError) {
      setError(actionError.message || 'The inquiry action could not be completed. Reload and try again.');
      setWorking(false); await loadWorkspace({ quiet: true }); return false;
    }
    if (options.notifyAssignment) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
        const { error: notifyError } = await supabase.functions.invoke('inquiry-workflow', { headers: { Authorization: `Bearer ${session.access_token}` }, body: { action: 'notify_assignment', inquiryId: selected.id } });
        if (notifyError) setError('The assignment was saved, but its email notification needs a Super Admin retry.');
      } catch { setError('The assignment was saved, but its email notification needs a Super Admin retry.'); }
    }
    setMessage(options.message || 'Inquiry workspace updated.');
    setActionNote(''); setResponseNote(''); setTargetMemberId('');
    await loadWorkspace({ quiet: true }); setWorking(false); return true;
  }

  async function openInquiry(inquiry) {
    setSelectedId(inquiry.id); setError(''); setMessage(''); setActionNote(''); setTargetMemberId('');
    setPrivateNote(data.privateNotes.find((note) => note.inquiry_id === inquiry.id)?.note || '');
    if (unreadForInquiry(data.receipts, inquiry.id, memberId)) {
      await supabase.rpc('perform_team_inquiry_action', { p_inquiry_id: inquiry.id, p_action: 'mark_read', p_payload: { expected_workflow_status: inquiry.workflow_status } });
      loadWorkspace({ quiet: true });
    }
  }

  async function retryNotification(assignmentOnly = false) {
    if (!selected || working) return;
    setWorking(true); setError(''); setMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
      const functionName = assignmentOnly ? 'inquiry-workflow' : 'submit-service-request';
      const body = assignmentOnly ? { action: 'retry_assignment_notification', inquiryId: selected.id } : { action: 'retry_notification', reference: selected.public_reference };
      const { data: result, error: retryError } = await supabase.functions.invoke(functionName, { headers: { Authorization: `Bearer ${session.access_token}` }, body });
      if (retryError) throw retryError;
      setMessage(`Notification retry completed: ${result?.notificationStatus || 'review delivery status'}.`);
      await loadWorkspace({ quiet: true });
    } catch (retryError) { setError(await functionErrorMessage(retryError, 'Notification retry failed.')); }
    finally { setWorking(false); }
  }

  async function permanentlyDelete() {
    if (!selected || !deleteState || working) return;
    setWorking(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
      const { data: result, error: deleteError } = await supabase.functions.invoke('inquiry-workflow', { headers: { Authorization: `Bearer ${session.access_token}` }, body: { action: 'permanent_delete', inquiryId: selected.id, pin: deleteState.pin, confirmation: deleteState.confirmation } });
      if (deleteError) throw deleteError;
      if (!result?.success) throw new Error(result?.message || 'Permanent deletion failed.');
      setDeleteState(null); setSelectedId(''); setMessage('Inquiry and dependent workflow records permanently deleted.');
      await loadWorkspace({ quiet: true });
    } catch (deleteError) { setError(await functionErrorMessage(deleteError, 'Permanent deletion failed.')); }
    finally { setWorking(false); }
  }

  const selectedResponses = selected ? data.responses.filter((item) => item.inquiry_id === selected.id) : [];
  const selectedAssignments = selected ? data.assignments.filter((item) => item.inquiry_id === selected.id) : [];
  const selectedRequests = selected ? data.requests.filter((item) => item.inquiry_id === selected.id) : [];
  const selectedHistory = selected ? data.history.filter((item) => item.inquiry_id === selected.id) : [];
  const selectedDeliveries = selected ? data.deliveries.filter((item) => item.inquiry_id === selected.id) : [];
  const responses = responseSummary(data.team, selectedResponses);
  const currentResponse = selectedResponses.find((item) => item.team_member_id === memberId);
  const canRespond = Boolean(adminUser?.creative_member_id) && selected && (!selected.preferred_creative_id || selected.workflow_status === 'open');

  return <AdminLayout><div className="w-full max-w-7xl">
    <AdminPageHeader eyebrow="Shared Team workspace" title="Project Inquiries" description="Every active Team member can review client requests, responses, assignments, transfers, and progress in one transparent workspace." />
    {error && <AdminNotice className="mb-5">{error}</AdminNotice>}{message && <AdminNotice tone="success" className="mb-5">{message}</AdminNotice>}
    <div className="public-filter-scroll flex gap-5 overflow-x-auto border-y border-white/[0.08] py-1" aria-label="Inquiry views">{WORKFLOW_VIEWS.map(([key, label]) => <button key={key} type="button" onClick={() => setView(key)} className={`min-h-12 shrink-0 border-b text-xs uppercase tracking-[0.13em] ${view === key ? 'border-amber-300 text-white' : 'border-transparent text-zinc-500 hover:text-white'}`}>{label}</button>)}</div>
    <section className="grid min-w-0 gap-4 border-b border-white/[0.08] py-5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_auto] lg:items-end"><label className="grid min-w-0 gap-1.5 text-sm text-zinc-300"><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, client, service, or assignee" className={lineControl} /></label><label className="grid min-w-0 gap-1.5 text-sm text-zinc-300"><span>Branch</span><select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className={lineControl}><option value="all">All branches</option>{Object.entries(branchLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="flex min-h-11 items-center gap-2 text-sm text-zinc-400"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="accent-amber-300" />Archived</label></section>

    {loading ? <InquirySkeleton /> : loadError ? <div className="border-b border-red-300/15 py-8"><p className="text-sm text-red-200">{loadError}</p><button type="button" onClick={() => loadWorkspace()} className="mt-3 border-b border-red-200/30 pb-1 text-sm text-red-100">Retry loading</button></div> : visible.length ? <div className="divide-y divide-white/[0.07]">{visible.map((inquiry) => {
      const unread = unreadForInquiry(data.receipts, inquiry.id, memberId);
      const availableCount = data.responses.filter((response) => response.inquiry_id === inquiry.id && response.response === 'available').length;
      return <article key={inquiry.id} className="grid min-w-0 gap-4 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2">{unread && <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,.75)]" aria-label="Unread inquiry" />}<h2 className="font-medium text-white">{inquiry.public_reference || 'Legacy inquiry'}</h2><AdminStatusBadge status={inquiry.workflow_status}>{WORKFLOW_LABELS[inquiry.workflow_status] || inquiry.workflow_status}</AdminStatusBadge><span className="text-xs text-zinc-600">{formatDate(inquiry.created_at)}</span></div><p className="mt-2 break-words text-sm text-zinc-300">{inquiry.name} <span className="text-zinc-600">·</span> {branchLabels[inquiry.branch] || 'Legacy'} <span className="text-zinc-600">·</span> {inquiry.project_type}</p><p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500">{inquiry.summary || inquiry.message}</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500"><span>Selected: {creativeOwnerMap[inquiry.preferred_creative_id]?.display_name || 'General Team'}</span><span>Assignee: {teamMap[inquiry.current_assignee_id]?.display_name || 'Open pool'}</span><span>{availableCount} available response{availableCount === 1 ? '' : 's'}</span></div></div><AdminActionButton onClick={() => openInquiry(inquiry)}><Eye size={14} />View details</AdminActionButton></article>;
    })}</div> : <AdminEmptyState title="No inquiries match" message="Adjust the view or filters, or wait for a new service request." />}

    {selected && <div className="fixed inset-0 z-50 grid place-items-center overflow-hidden bg-black/80 p-2 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="inquiry-detail-title"><AdminSurface className="grid max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-5xl gap-6 overflow-y-auto overflow-x-hidden border-amber-200/20 bg-zinc-950/98 shadow-2xl sm:max-h-[calc(100dvh-2rem)]"><div className="flex items-start justify-between gap-4 border-b border-amber-200/15 pb-4"><div className="min-w-0"><p className="break-words text-xs uppercase tracking-[0.18em] text-amber-200/70">{selected.public_reference || 'Legacy inquiry'}</p><h2 id="inquiry-detail-title" className="mt-2 break-words text-xl font-semibold text-white">{selected.name}</h2></div><button type="button" onClick={() => setSelectedId('')} aria-label="Close inquiry details" className="shrink-0 text-zinc-400 hover:text-white"><X size={20} /></button></div>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Workflow" value={WORKFLOW_LABELS[selected.workflow_status]} /><Detail label="Branch" value={branchLabels[selected.branch]} /><Detail label="Service category" value={selected.project_type} /><Detail label="Submitted" value={formatDate(selected.created_at)} /><Detail label="Email" value={selected.client_email || selected.email_or_contact} action={<button type="button" onClick={() => copyText(selected.client_email || selected.email_or_contact)} className="inline-flex items-center gap-1 text-xs text-amber-200"><Copy size={12} />Copy</button>} /><Detail label="Phone / message" value={selected.client_phone} /><Detail label="Preferred contact" value={selected.preferred_contact} /><Detail label="Schedule" value={selected.preferred_schedule} /><Detail label="Service mode" value={selected.service_mode} /><Detail label="General location" value={selected.general_location} /><Detail label="Budget" value={selected.budget_range} /><Detail label="Originally selected creative" value={creativeOwnerMap[selected.preferred_creative_id]?.display_name || (selected.preferred_creative_id ? 'Former or unavailable creative' : 'General Team')} /><Detail label="Current assignee" value={teamMap[selected.current_assignee_id]?.display_name || 'Open Team pool'} /></div>
      <section className="border-t border-white/[0.08] pt-4"><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">Complete client request</p><p className="mt-2 text-base text-white">{selected.summary || selected.project_type}</p><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300">{selected.details || selected.message}</p></section>
      {selected.request_metadata && Object.keys(selected.request_metadata).length > 0 && <div className="grid min-w-0 gap-3 border-t border-white/[0.08] pt-4 sm:grid-cols-2">{Object.entries(selected.request_metadata).map(([key, value]) => <Detail key={key} label={key.replace(/([A-Z])/g, ' $1')} value={typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)} />)}</div>}
      <section className="border-t border-white/[0.08] pt-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">Team responses</p><p className="mt-1 text-sm text-zinc-400">Responses are independent and do not change public profile availability.</p></div>{canRespond && <div className="flex flex-wrap gap-2"><AdminActionButton onClick={() => performAction('respond', { response: 'available', note: responseNote })} disabled={working}>Available to take this</AdminActionButton><AdminActionButton onClick={() => performAction('respond', { response: 'declined', note: responseNote })} disabled={working}>Decline</AdminActionButton><AdminActionButton onClick={() => performAction('respond', { response: 'unavailable', note: responseNote })} disabled={working}>Unavailable</AdminActionButton>{currentResponse && <AdminActionButton onClick={() => performAction('respond', { response: 'clear' })} disabled={working}>Clear response</AdminActionButton>}</div>}</div>{canRespond && <input value={responseNote} onChange={(event) => setResponseNote(event.target.value)} placeholder="Optional Team-visible response note" maxLength="2000" className={`${lineControl} mt-4`} />}<div className="mt-4 grid gap-2 sm:grid-cols-2">{responses.map((item) => <div key={item.memberId} className="border-t border-white/[0.07] py-3 text-sm"><span className="text-zinc-200">{item.name}</span><span className="text-zinc-600"> — </span><span className={item.response === 'available' ? 'text-emerald-300' : 'text-zinc-400'}>{RESPONSE_LABELS[item.response] || 'No response'}</span>{item.note && <p className="mt-1 text-xs leading-5 text-zinc-500">{item.note}</p>}</div>)}</div></section>
      <section className="border-t border-white/[0.08] pt-4"><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">Assignment and workflow</p><div className="mt-4 flex flex-wrap gap-2">{canAcceptInquiry(selected, memberId) && <><AdminButton onClick={() => performAction('accept', {}, { message: 'Inquiry accepted.' })} disabled={working}><CheckCircle2 size={15} />Accept</AdminButton><AdminButton variant="ghost" onClick={() => performAction('decline', { note: actionNote }, { message: 'Inquiry returned to the open Team pool.' })} disabled={working}>Decline assignment</AdminButton></>}{selected.current_assignee_id === memberId && !['completed', 'closed'].includes(selected.workflow_status) && <AdminButton variant="ghost" onClick={() => targetMemberId && performAction('transfer', { target_member_id: targetMemberId, note: actionNote }, { notifyAssignment: true, message: 'Inquiry transferred and the receiving creative notified.' })} disabled={working || !targetMemberId}><ArrowRightLeft size={15} />Pass to creative</AdminButton>}{adminUser?.creative_member_id && selected.current_assignee_id !== memberId && !['completed', 'closed'].includes(selected.workflow_status) && <AdminButton variant="ghost" onClick={() => performAction('request_assignment', { note: actionNote }, { message: 'Assignment request submitted.' })} disabled={working}><Hand size={15} />Request to take this inquiry</AdminButton>}{selected.current_assignee_id === memberId && selected.workflow_status === 'accepted' && <AdminButton variant="ghost" onClick={() => performAction('start_progress', {}, { message: 'Inquiry marked in progress.' })} disabled={working}>Start progress</AdminButton>}{canCompleteInquiry(selected, memberId, role) && <AdminButton variant="ghost" onClick={() => performAction('mark_completed', { note: actionNote }, { message: 'Inquiry marked completed.' })} disabled={working}><CheckCircle2 size={15} />Mark completed</AdminButton>}{superAdmin && !['completed', 'closed'].includes(selected.workflow_status) && <AdminButton variant="ghost" onClick={() => targetMemberId && performAction('admin_assign', { target_member_id: targetMemberId, note: actionNote }, { notifyAssignment: true, message: 'Creative assigned and notified.' })} disabled={working || !targetMemberId}><UserPlus size={15} />Assign creative</AdminButton>}{superAdmin && selected.workflow_status === 'completed' && <AdminButton variant="ghost" onClick={() => performAction('close', {}, { message: 'Inquiry closed.' })} disabled={working}>Close inquiry</AdminButton>}</div>{!['completed', 'closed'].includes(selected.workflow_status) && <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2"><label className="grid min-w-0 gap-1.5 text-sm text-zinc-300"><span>Destination creative</span><select value={targetMemberId} onChange={(event) => setTargetMemberId(event.target.value)} className={lineControl}><option value="">Choose an active creative</option>{eligibleCreatives.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></label><label className="grid min-w-0 gap-1.5 text-sm text-zinc-300"><span>Optional reason or note</span><input value={actionNote} onChange={(event) => setActionNote(event.target.value)} maxLength="2000" className={lineControl} /></label></div>}</section>
      {selectedRequests.length > 0 && <section className="border-t border-white/[0.08] pt-4"><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">Assignment requests</p><div className="mt-3 divide-y divide-white/[0.07]">{selectedRequests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="text-zinc-200">{teamMap[request.requesting_member_id]?.display_name || 'Former member'} — {request.status}</p>{request.note && <p className="mt-1 text-xs text-zinc-500">{request.note}</p>}</div>{request.status === 'pending' && (superAdmin || selected.current_assignee_id === memberId) && <div className="flex gap-2"><AdminActionButton onClick={() => performAction('approve_request', { request_id: request.id }, { notifyAssignment: true, message: 'Assignment request approved.' })} disabled={working}>Approve</AdminActionButton><AdminActionButton onClick={() => performAction('reject_request', { request_id: request.id }, { message: 'Assignment request rejected.' })} disabled={working}>Reject</AdminActionButton></div>}</div>)}</div></section>}
      <section className="grid min-w-0 gap-6 border-t border-white/[0.08] pt-4 lg:grid-cols-2"><Timeline title="Assignment and transfer history" empty="No assignment history yet." items={selectedAssignments.map((assignment) => ({ id: assignment.id, title: `${teamMap[assignment.assigned_member_id]?.display_name || 'Former member'} — ${assignment.status}`, detail: `${assignment.assignment_type.replaceAll('_', ' ')}${assignment.reason ? ` · ${assignment.reason}` : ''}`, date: assignment.created_at }))} /><Timeline title="Workflow history" empty="No workflow changes yet." items={selectedHistory.map((entry) => ({ id: entry.id, title: `${WORKFLOW_LABELS[entry.previous_status] || entry.previous_status || 'Created'} → ${WORKFLOW_LABELS[entry.next_status] || entry.next_status}`, detail: entry.note || '', date: entry.created_at }))} /></section>
      <section className="border-y border-white/[0.08] py-4"><div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400"><MailCheck size={16} className="text-amber-200" /><span>Delivery: {selected.notification_status || 'legacy'}</span>{selected.notification_attempts > 0 && <span className="text-xs text-zinc-600">{selected.notification_attempts} attempt(s)</span>}{selected.notification_state?.admin && <span className="text-xs text-zinc-500">Administrative: {selected.notification_state.admin}</span>}{selected.notification_state?.creative_recipients && <span className="text-xs text-zinc-500">Creatives: {Object.values(selected.notification_state.creative_recipients).filter((status) => status === 'sent').length}/{Object.keys(selected.notification_state.creative_recipients).length} sent</span>}{superAdmin && <><AdminActionButton onClick={() => retryNotification(false)} disabled={working}><RefreshCw size={14} />Retry request delivery</AdminActionButton>{selectedAssignments.length > 0 && <AdminActionButton onClick={() => retryNotification(true)} disabled={working}><RefreshCw size={14} />Retry assignment delivery</AdminActionButton>}</>}</div>{selected.notification_error && <p className="mt-2 text-xs text-red-200">Delivery note: {selected.notification_error}</p>}{superAdmin && selectedDeliveries.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2">{selectedDeliveries.map((delivery) => <div key={delivery.id} className="border-t border-white/[0.07] pt-2 text-xs text-zinc-500"><span className="text-zinc-300">{delivery.recipient_kind.replace('_', ' ')}</span> — {delivery.status}{delivery.recipient_member_id && ` · ${teamMap[delivery.recipient_member_id]?.display_name || 'Former member'}`}</div>)}</div>}</section>
      {superAdmin && <section className="grid gap-4 border-t border-white/[0.08] pt-4"><label className="grid gap-1.5 text-sm text-zinc-300"><span>Super Admin private note</span><textarea value={privateNote} onChange={(event) => setPrivateNote(event.target.value)} maxLength="2000" className={`${lineControl} min-h-24 resize-y`} /></label><div className="flex flex-wrap gap-3"><AdminButton variant="ghost" onClick={() => performAction('private_note', { note: privateNote }, { message: 'Private note saved.' })} disabled={working}>Save private note</AdminButton><AdminButton variant="ghost" onClick={() => performAction('archive', {}, { message: 'Inquiry archived.' })} disabled={working}>Archive</AdminButton>{canDeleteInquiry(selected, role) && <AdminButton variant="danger" onClick={() => setDeleteState({ pin: '', confirmation: '' })} disabled={working}><Trash2 size={15} />Permanent Delete</AdminButton>}</div></section>}
    </AdminSurface></div>}

    {deleteState && selected && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-inquiry-title"><AdminSurface className="grid w-full max-w-lg gap-5 border-red-300/20 bg-zinc-950"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.18em] text-red-300/70">Irreversible action</p><h2 id="delete-inquiry-title" className="mt-2 text-xl font-semibold text-white">Permanently delete inquiry</h2></div><button type="button" onClick={() => !working && setDeleteState(null)} aria-label="Close permanent deletion dialog"><X size={20} /></button></div><p className="text-sm leading-6 text-zinc-300">This permanently removes the completed inquiry, responses, receipts, assignment requests, transfer history, notifications, delivery attempts, notes, and status history.</p><AdminInput label="Super Admin security PIN" type="password" value={deleteState.pin} onChange={(value) => setDeleteState((current) => ({ ...current, pin: value }))} /><AdminInput label="Type DELETE to confirm" value={deleteState.confirmation} onChange={(value) => setDeleteState((current) => ({ ...current, confirmation: value }))} /><div className="flex flex-wrap gap-3"><AdminButton variant="danger" onClick={permanentlyDelete} disabled={working || !deleteState.pin || deleteState.confirmation !== 'DELETE'}>Delete permanently</AdminButton><AdminButton variant="ghost" onClick={() => setDeleteState(null)} disabled={working}>Cancel</AdminButton></div></AdminSurface></div>}
  </div></AdminLayout>;
}

function Detail({ label, value, action }) { if (value === null || value === undefined || value === '') return null; return <div className="min-w-0 border-t border-white/[0.08] pt-3"><div className="flex items-center justify-between gap-3"><p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">{label}</p>{action}</div><p className="mt-2 break-words text-sm text-zinc-300">{value}</p></div>; }
function Timeline({ title, empty, items }) { return <div className="min-w-0"><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">{title}</p>{items.length ? <div className="mt-3 divide-y divide-white/[0.07]">{items.map((item) => <div key={item.id} className="py-3"><p className="break-words text-sm text-zinc-300">{item.title}</p>{item.detail && <p className="mt-1 break-words text-xs leading-5 text-zinc-500">{item.detail}</p>}<p className="mt-1 text-[10px] text-zinc-700">{formatDate(item.date)}</p></div>)}</div> : <p className="mt-3 text-sm text-zinc-600">{empty}</p>}</div>; }
function InquirySkeleton() { return <div aria-label="Loading inquiries">{[0, 1, 2, 3].map((item) => <div key={item} className="grid gap-3 border-b border-white/[0.08] py-5"><div className="h-3 w-48 animate-pulse bg-white/[0.05]" /><div className="h-2 w-64 max-w-full animate-pulse bg-white/[0.04]" /><div className="h-2 w-full animate-pulse bg-white/[0.035]" /></div>)}</div>; }
