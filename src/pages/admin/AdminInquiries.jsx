import { FunctionsHttpError } from '@supabase/supabase-js';
import { ArrowRightLeft, CheckCircle2, ChevronDown, Copy, Eye, Hand, MailCheck, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminActionButton, AdminButton, AdminEmptyState, AdminInput, AdminNotice, AdminPageHeader, AdminStatusBadge, AdminSurface } from '../../components/admin/AdminUI';
import AdminDialog from '../../components/admin/AdminDialog';
import { useAdminAccess } from '../../lib/adminAccess';
import { copyText } from '../../lib/clipboard';
import { formatDate } from '../../lib/helpers';
import { canAcceptInquiry, canCompleteInquiry, canDeleteInquiry, inquiryMatchesView, isSuperAdmin, RESPONSE_LABELS, responseSummary, unreadForInquiry, WORKFLOW_LABELS, WORKFLOW_VIEWS } from '../../lib/teamInquiryWorkspace';
import { supabase } from '../../lib/supabaseClient';

const inquiryColumns = 'id, public_reference, name, email_or_contact, client_email, client_phone, organization, branch, service_key, project_type, budget_range, deadline, preferred_contact, preferred_schedule, service_mode, general_location, preferred_creative_id, assigned_creative_id, current_assignee_id, summary, details, message, request_metadata, source_path, status, workflow_status, archived_at, notification_status, notification_attempts, notification_state, notification_error, completed_at, completed_by, completion_note, closed_at, created_at, updated_at';
const branchLabels = { studio: 'Liwa Studio', tech: 'Liwa Explore', digital: 'Liwa Digital', social: 'Liwa Social', general: 'General' };
const lineControl = 'dark-select min-w-0 w-full rounded-md border border-white/[0.14] bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none [color-scheme:dark] hover:border-white/[0.22] focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/15';

async function functionErrorMessage(error, fallback) {
  if (error instanceof FunctionsHttpError && error.context) {
    try { const payload = await error.context.clone().json(); return payload?.message || payload?.error || fallback; } catch {
      try { return (await error.context.text()) || fallback; } catch { return fallback; }
    }
  }
  return error?.message || fallback;
}

async function invokeInquiryWorkflow(body) {
  const { data, error } = await supabase.functions.invoke('inquiry-workflow', { body });
  if (error) return { data: null, error };
  if (!data?.success) return { data: null, error: new Error(data?.message || 'The inquiry request failed.') };
  return { data, error: null };
}

async function loadInquiryTeamMembers() {
  const result = await invokeInquiryWorkflow({ action: 'list_team_members' });
  return { data: result.data?.team || null, error: result.error };
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
  const [feedbackScope, setFeedbackScope] = useState('');
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
      loadInquiryTeamMembers(),
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
    const actionScope = options.scope || (action === 'respond' ? 'responses' : ['approve_request', 'reject_request'].includes(action) ? 'requests' : 'workflow');
    setWorking(true); setError(''); setMessage(''); setFeedbackScope(actionScope);
    const { error: actionError } = await invokeInquiryWorkflow({ action: 'team_action', inquiryId: selected.id, teamAction: action, payload: { ...payload, expected_workflow_status: selected.workflow_status } });
    if (actionError) {
      setError(await functionErrorMessage(actionError, 'The inquiry action could not be completed. Reload and try again.'));
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
    setSelectedId(inquiry.id); setError(''); setMessage(''); setFeedbackScope(''); setActionNote(''); setTargetMemberId('');
    setPrivateNote(data.privateNotes.find((note) => note.inquiry_id === inquiry.id)?.note || '');
    if (unreadForInquiry(data.receipts, inquiry.id, memberId)) {
      await invokeInquiryWorkflow({ action: 'team_action', inquiryId: inquiry.id, teamAction: 'mark_read', payload: { expected_workflow_status: inquiry.workflow_status } });
      loadWorkspace({ quiet: true });
    }
  }

  async function retryNotification(assignmentOnly = false) {
    if (!selected || working) return;
    setWorking(true); setError(''); setMessage(''); setFeedbackScope('delivery');
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
    setWorking(true); setError(''); setMessage(''); setFeedbackScope('delete');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
      const { data: result, error: deleteError } = await supabase.functions.invoke('inquiry-workflow', { headers: { Authorization: `Bearer ${session.access_token}` }, body: { action: 'permanent_delete', inquiryId: selected.id, pin: deleteState.pin, confirmation: deleteState.confirmation } });
      if (deleteError) throw deleteError;
      if (!result?.success) throw new Error(result?.message || 'Permanent deletion failed.');
      setDeleteState(null); setSelectedId(''); setFeedbackScope('page'); setMessage('Inquiry and dependent workflow records permanently deleted.');
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
  const canStartProgress = selected?.current_assignee_id === memberId && selected?.workflow_status === 'accepted';
  const canFinish = selected && canCompleteInquiry(selected, memberId, role) && selected.workflow_status === 'in_progress';
  const canClose = superAdmin && selected?.workflow_status === 'completed';
  const showAssignmentTools = selected && !['completed', 'closed'].includes(selected.workflow_status)
    && (selected.current_assignee_id === memberId || superAdmin || (adminUser?.creative_member_id && selected.current_assignee_id !== memberId));

  return <AdminLayout><div className="w-full max-w-7xl overflow-x-hidden">
    <AdminPageHeader eyebrow="Shared inquiry workspace" title="Project Inquiries" description="Authorized platform users can review client requests, responses, assignments, transfers, and progress in one transparent workspace." />
    {feedbackScope === 'page' && error && <AdminNotice className="mb-5">{error}</AdminNotice>}{feedbackScope === 'page' && message && <AdminNotice tone="success" className="mb-5">{message}</AdminNotice>}
    <AdminSurface data-inquiry-filter-panel className="mb-2 grid min-w-0 gap-4 p-4">
      <nav className="grid min-w-0 grid-cols-3 gap-2 xl:grid-cols-9" aria-label="Inquiry views">{WORKFLOW_VIEWS.map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`h-12 w-full rounded-md border px-2 text-xs font-semibold leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50 ${view === key ? 'border-amber-200/55 bg-amber-300/12 text-amber-100' : 'border-white/[0.09] bg-zinc-950/55 text-zinc-400 hover:border-white/[0.18] hover:text-white'}`}>{label}</button>)}</nav>
      <section className="grid min-w-0 gap-3 border-t border-white/[0.08] pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_8rem] lg:items-end"><label className="grid min-w-0 gap-1.5 text-sm text-zinc-300"><span>Search</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Reference, client, service, or assignee" className={lineControl} /></label><label className="grid min-w-0 gap-1.5 text-sm text-zinc-300"><span>Branch</span><select value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)} className={lineControl}><option value="all">All branches</option>{Object.entries(branchLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><button type="button" aria-pressed={showArchived} onClick={() => setShowArchived((current) => !current)} className={`min-h-10 w-full rounded-md border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50 ${showArchived ? 'border-amber-200/55 bg-amber-300/12 text-amber-100' : 'border-white/[0.14] bg-zinc-950 text-zinc-400 hover:border-white/[0.24] hover:text-white'}`}>Archived</button></section>
    </AdminSurface>

    {loading ? <InquirySkeleton /> : loadError ? <div className="border-b border-red-300/15 py-8"><p className="text-sm text-red-200">{loadError}</p><button type="button" onClick={() => loadWorkspace()} className="mt-3 border-b border-red-200/30 pb-1 text-sm text-red-100">Retry</button></div> : visible.length ? <div className="divide-y divide-white/[0.07]">{visible.map((inquiry) => {
      const unread = unreadForInquiry(data.receipts, inquiry.id, memberId);
      const availableCount = data.responses.filter((response) => response.inquiry_id === inquiry.id && response.response === 'available').length;
      return <article key={inquiry.id} className="grid min-w-0 gap-4 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2">{unread && <span className="h-2 w-2 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,.75)]" aria-label="Unread inquiry" />}<h2 className="font-medium text-white">{inquiry.public_reference || 'Legacy inquiry'}</h2><AdminStatusBadge status={inquiry.workflow_status}>{WORKFLOW_LABELS[inquiry.workflow_status] || inquiry.workflow_status}</AdminStatusBadge><span className="text-xs text-zinc-600">{formatDate(inquiry.created_at)}</span></div><p className="mt-2 break-words text-sm text-zinc-300">{inquiry.name} <span className="text-zinc-600">·</span> {branchLabels[inquiry.branch] || 'Legacy'} <span className="text-zinc-600">·</span> {inquiry.project_type}</p><p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500">{inquiry.summary || inquiry.message}</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-zinc-500"><span>Selected: {creativeOwnerMap[inquiry.preferred_creative_id]?.display_name || 'General Team'}</span><span>Assignee: {teamMap[inquiry.current_assignee_id]?.display_name || 'Open pool'}</span><span>{availableCount} available response{availableCount === 1 ? '' : 's'}</span></div></div><AdminActionButton className="admin-mobile-primary-action" aria-label={`View ${inquiry.public_reference || 'inquiry'}`} onClick={() => openInquiry(inquiry)}><Eye size={14} />View</AdminActionButton></article>;
    })}</div> : <AdminEmptyState title="No inquiries match" message="Adjust the view or filters, or wait for a new service request." />}

    {selected && <AdminDialog open={!deleteState} onClose={() => setSelectedId('')} title={selected.name} eyebrow={selected.public_reference || 'Legacy inquiry'} presentation="fullscreen" panelClassName="max-w-5xl" contentClassName="admin-inquiry-scroll bg-zinc-950" simpleBackdrop>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Workflow" value={WORKFLOW_LABELS[selected.workflow_status]} /><Detail label="Service" value={`${branchLabels[selected.branch] || 'Legacy'} · ${selected.project_type || 'Not specified'}`} /><Detail label="Current assignee" value={teamMap[selected.current_assignee_id]?.display_name || 'Open Team pool'} /><Detail label="Submitted" value={formatDate(selected.created_at)} /><Detail label="Email" value={selected.client_email || selected.email_or_contact} action={<button type="button" onClick={() => copyText(selected.client_email || selected.email_or_contact)} className="inline-flex items-center gap-1 text-xs text-amber-200"><Copy size={12} />Copy</button>} /></div>
      <section className="border-t border-white/[0.08] pt-4"><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">Client request</p><p className="mt-2 text-base text-white">{selected.summary || selected.project_type}</p><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300">{selected.details || selected.message}</p></section>
      <section className="rounded-md border border-amber-200/20 bg-amber-300/[0.045] p-4">
        <p className="text-[10px] uppercase tracking-[0.16em] text-amber-200/70">Recommended next action</p>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-zinc-300">{canAcceptInquiry(selected, memberId) ? 'Review the request, then accept it if you can take responsibility for the client follow-up.' : canStartProgress ? 'Start progress when work or active client coordination has begun.' : canFinish ? 'Mark this inquiry completed when the agreed work and follow-up are finished.' : canClose ? 'Close this completed inquiry when no further team follow-up is expected.' : canRespond && !currentResponse ? 'Share your availability so the team can choose the best creative.' : selected.workflow_status === 'closed' ? 'This inquiry is closed. No workflow action is needed.' : selected.current_assignee_id ? 'Continue the current workflow or use More workflow options when a handoff is needed.' : 'Review the request. Eligible creatives can share availability, and a Super Admin can assign it.'}</p>
          <div className="shrink-0">{canAcceptInquiry(selected, memberId) ? <AdminButton onClick={() => performAction('accept', {}, { message: 'Inquiry accepted.', scope: 'recommended' })} disabled={working}><CheckCircle2 size={15} />Accept</AdminButton> : canStartProgress ? <AdminButton onClick={() => performAction('start_progress', {}, { message: 'Inquiry marked in progress.', scope: 'recommended' })} disabled={working}>Start</AdminButton> : canFinish ? <AdminButton onClick={() => performAction('mark_completed', { note: actionNote }, { message: 'Inquiry marked completed.', scope: 'recommended' })} disabled={working}><CheckCircle2 size={15} />Complete</AdminButton> : canClose ? <AdminButton onClick={() => performAction('close', {}, { message: 'Inquiry closed.', scope: 'recommended' })} disabled={working}>Close</AdminButton> : canRespond && !currentResponse ? <AdminButton onClick={() => performAction('respond', { response: 'available', note: responseNote }, { message: 'Your availability was shared.', scope: 'recommended' })} disabled={working}>Available</AdminButton> : null}</div>
        </div>
        <ScopedFeedback scope="recommended" activeScope={feedbackScope} error={error} message={message} />
        {working && feedbackScope === 'recommended' && <p className="mt-3 text-xs text-zinc-500" role="status">Updating the inquiry…</p>}
      </section>
      <ExpandableSection title="Client details" description="Contact preferences, timing, budget, and request metadata."><div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3"><Detail label="Phone / message" value={selected.client_phone} /><Detail label="Preferred contact" value={selected.preferred_contact} /><Detail label="Schedule" value={selected.preferred_schedule} /><Detail label="Service mode" value={selected.service_mode} /><Detail label="General location" value={selected.general_location} /><Detail label="Budget" value={selected.budget_range} /><Detail label="Originally selected creative" value={creativeOwnerMap[selected.preferred_creative_id]?.display_name || (selected.preferred_creative_id ? 'Former or unavailable creative' : 'General Team')} /></div>{selected.request_metadata && Object.keys(selected.request_metadata).length > 0 && <div className="mt-4 grid min-w-0 gap-3 border-t border-white/[0.08] pt-4 sm:grid-cols-2">{Object.entries(selected.request_metadata).map(([key, value]) => <Detail key={key} label={key.replace(/([A-Z])/g, ' $1')} value={typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)} />)}</div>}</ExpandableSection>
      <ExpandableSection title="Team availability" description="Current responses and optional availability notes"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-zinc-400">Responses are independent and do not change public profile availability.</p>{canRespond && <div className="flex flex-wrap gap-2"><AdminActionButton onClick={() => performAction('respond', { response: 'available', note: responseNote })} disabled={working}>Available</AdminActionButton><AdminActionButton onClick={() => performAction('respond', { response: 'declined', note: responseNote })} disabled={working}>Decline</AdminActionButton><AdminActionButton onClick={() => performAction('respond', { response: 'unavailable', note: responseNote })} disabled={working}>Unavailable</AdminActionButton>{currentResponse && <AdminActionButton onClick={() => performAction('respond', { response: 'clear' })} disabled={working}>Clear</AdminActionButton>}</div>}</div>{canRespond && <input value={responseNote} onChange={(event) => { setResponseNote(event.target.value); if (feedbackScope === 'responses') { setError(''); setMessage(''); } }} placeholder="Optional Team-visible response note" maxLength="2000" className={`${lineControl} mt-4`} />}<div className="mt-4 grid gap-2 sm:grid-cols-2">{responses.map((item) => <div key={item.memberId} className="border-t border-white/[0.07] py-3 text-sm"><span className="text-zinc-200">{item.name}</span><span className="text-zinc-600"> — </span><span className={item.response === 'available' ? 'text-emerald-300' : 'text-zinc-400'}>{RESPONSE_LABELS[item.response] || 'No response'}</span>{item.note && <p className="mt-1 text-xs leading-5 text-zinc-500">{item.note}</p>}</div>)}</div><ScopedFeedback scope="responses" activeScope={feedbackScope} error={error} message={message} /></ExpandableSection>
      {showAssignmentTools && <ExpandableSection title="More workflow options" description="Transfers, assignment requests, and administrative assignment"><div className="grid min-w-0 gap-4 sm:grid-cols-2"><label className="grid min-w-0 gap-1.5 text-sm text-zinc-300"><span>Destination creative</span><select value={targetMemberId} onChange={(event) => { setTargetMemberId(event.target.value); if (feedbackScope === 'workflow') { setError(''); setMessage(''); } }} className={lineControl}><option value="">Choose an active creative</option>{eligibleCreatives.map((member) => <option key={member.id} value={member.id}>{member.display_name}</option>)}</select></label><label className="grid min-w-0 gap-1.5 text-sm text-zinc-300"><span>Optional reason or note</span><input value={actionNote} onChange={(event) => setActionNote(event.target.value)} maxLength="2000" className={lineControl} /></label></div><div className="mt-4 flex flex-wrap gap-2">{canAcceptInquiry(selected, memberId) && <AdminButton variant="ghost" onClick={() => performAction('decline', { note: actionNote }, { message: 'Inquiry returned to the open Team pool.', scope: 'workflow' })} disabled={working}>Decline</AdminButton>}{selected.current_assignee_id === memberId && targetMemberId && <AdminButton variant="ghost" onClick={() => performAction('transfer', { target_member_id: targetMemberId, note: actionNote }, { notifyAssignment: true, message: 'Inquiry transferred and the receiving creative notified.', scope: 'workflow' })} disabled={working}><ArrowRightLeft size={15} />Transfer</AdminButton>}{adminUser?.creative_member_id && selected.current_assignee_id !== memberId && <AdminButton variant="ghost" onClick={() => performAction('request_assignment', { note: actionNote }, { message: 'Assignment request submitted.', scope: 'workflow' })} disabled={working}><Hand size={15} />Request</AdminButton>}{superAdmin && targetMemberId && <AdminButton variant="ghost" onClick={() => performAction('admin_assign', { target_member_id: targetMemberId, note: actionNote }, { notifyAssignment: true, message: 'Creative assigned and notified.', scope: 'workflow' })} disabled={working}><UserPlus size={15} />Assign</AdminButton>}</div>{!targetMemberId && (selected.current_assignee_id === memberId || superAdmin) && <p className="mt-3 text-xs text-zinc-500">Choose a destination creative to reveal transfer or assignment actions.</p>}<ScopedFeedback scope="workflow" activeScope={feedbackScope} error={error} message={message} /></ExpandableSection>}
      {selectedRequests.length > 0 && <ExpandableSection title="Assignment requests" description={`${selectedRequests.filter((request) => request.status === 'pending').length} pending request(s)`}><div className="divide-y divide-white/[0.07]">{selectedRequests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><div><p className="text-zinc-200">{teamMap[request.requesting_member_id]?.display_name || 'Former member'} — {request.status}</p>{request.note && <p className="mt-1 text-xs text-zinc-500">{request.note}</p>}</div>{request.status === 'pending' && (superAdmin || selected.current_assignee_id === memberId) && <div className="flex gap-2"><AdminActionButton onClick={() => performAction('approve_request', { request_id: request.id }, { notifyAssignment: true, message: 'Assignment request approved.', scope: 'requests' })} disabled={working}>Approve</AdminActionButton><AdminActionButton onClick={() => performAction('reject_request', { request_id: request.id }, { message: 'Assignment request rejected.', scope: 'requests' })} disabled={working}>Reject</AdminActionButton></div>}</div>)}</div><ScopedFeedback scope="requests" activeScope={feedbackScope} error={error} message={message} /></ExpandableSection>}
      <ExpandableSection title="History" description="Assignment transfers and workflow changes"><div className="grid min-w-0 gap-6 lg:grid-cols-2"><Timeline title="Assignment and transfer history" empty="No assignment history yet." items={selectedAssignments.map((assignment) => ({ id: assignment.id, title: `${teamMap[assignment.assigned_member_id]?.display_name || 'Former member'} — ${assignment.status}`, detail: `${assignment.assignment_type.replaceAll('_', ' ')}${assignment.reason ? ` · ${assignment.reason}` : ''}`, date: assignment.created_at }))} /><Timeline title="Workflow history" empty="No workflow changes yet." items={selectedHistory.map((entry) => ({ id: entry.id, title: `${WORKFLOW_LABELS[entry.previous_status] || entry.previous_status || 'Created'} → ${WORKFLOW_LABELS[entry.next_status] || entry.next_status}`, detail: entry.note || '', date: entry.created_at }))} /></div></ExpandableSection>
      <ExpandableSection title="Notification delivery" description={`Current delivery state: ${selected.notification_status || 'legacy'}`}><div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400"><MailCheck size={16} className="text-amber-200" /><span>Delivery: {selected.notification_status || 'legacy'}</span>{selected.notification_attempts > 0 && <span className="text-xs text-zinc-600">{selected.notification_attempts} attempt(s)</span>}{selected.notification_state?.admin && <span className="text-xs text-zinc-500">Administrative: {selected.notification_state.admin}</span>}{selected.notification_state?.creative_recipients && <span className="text-xs text-zinc-500">Creatives: {Object.values(selected.notification_state.creative_recipients).filter((status) => status === 'sent').length}/{Object.keys(selected.notification_state.creative_recipients).length} sent</span>}{superAdmin && <><AdminActionButton aria-label="Retry request delivery" onClick={() => retryNotification(false)} disabled={working}><RefreshCw size={14} />Retry</AdminActionButton>{selectedAssignments.length > 0 && <AdminActionButton aria-label="Retry assignment delivery" onClick={() => retryNotification(true)} disabled={working}><RefreshCw size={14} />Retry assignment</AdminActionButton>}</>}</div>{selected.notification_error && <p className="mt-2 text-xs text-red-200">Delivery note: {selected.notification_error}</p>}{superAdmin && selectedDeliveries.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2">{selectedDeliveries.map((delivery) => <div key={delivery.id} className="border-t border-white/[0.07] pt-2 text-xs text-zinc-500"><span className="text-zinc-300">{delivery.recipient_kind.replace('_', ' ')}</span> — {delivery.status}{delivery.recipient_member_id && ` · ${teamMap[delivery.recipient_member_id]?.display_name || 'Former member'}`}</div>)}</div>}<ScopedFeedback scope="delivery" activeScope={feedbackScope} error={error} message={message} /></ExpandableSection>
      {superAdmin && <ExpandableSection title="Advanced Super Admin tools" description="Private notes, archiving, and restricted maintenance"><label className="grid gap-1.5 text-sm text-zinc-300"><span>Private note</span><textarea value={privateNote} onChange={(event) => { setPrivateNote(event.target.value); if (feedbackScope === 'advanced') { setError(''); setMessage(''); } }} maxLength="2000" className={`${lineControl} min-h-24 resize-y`} /></label><div className="mt-4 flex flex-wrap gap-3"><AdminButton variant="ghost" onClick={() => performAction('private_note', { note: privateNote }, { message: 'Private note saved.', scope: 'advanced' })} disabled={working}>Save note</AdminButton><AdminButton variant="ghost" onClick={() => performAction('archive', {}, { message: 'Inquiry archived.', scope: 'advanced' })} disabled={working}>Archive</AdminButton></div><ScopedFeedback scope="advanced" activeScope={feedbackScope} error={error} message={message} />{canDeleteInquiry(selected, role) && <div className="mt-6 border-t border-red-300/20 pt-5"><p className="text-xs font-medium uppercase tracking-[0.14em] text-red-200">Destructive action</p><p className="mt-2 text-xs leading-5 text-zinc-500">Permanent deletion is available only for completed or closed inquiries and cannot be undone.</p><AdminButton className="mt-4" variant="danger" onClick={() => { setError(''); setMessage(''); setFeedbackScope('delete'); setDeleteState({ pin: '', confirmation: '' }); }} disabled={working}><Trash2 size={15} />Delete</AdminButton></div>}</ExpandableSection>}
    </AdminDialog>}

    {deleteState && selected && <AdminDialog open onClose={() => !working && setDeleteState(null)} title="Permanently delete inquiry" eyebrow="Irreversible action" description="This permanently removes the completed inquiry, responses, receipts, assignment requests, transfer history, notifications, delivery attempts, notes, and status history." presentation="sheet" destructive busy={working}>
      <div className="grid gap-5">
        <AdminInput label="Super Admin security PIN" type="password" value={deleteState.pin} onChange={(value) => { setDeleteState((current) => ({ ...current, pin: value })); setError(''); }} />
        <AdminInput label="Type DELETE to confirm" value={deleteState.confirmation} onChange={(value) => { setDeleteState((current) => ({ ...current, confirmation: value })); setError(''); }} />
        <ScopedFeedback scope="delete" activeScope={feedbackScope} error={error} message={message} />
        <div className="grid grid-cols-2 gap-3">{deleteState.pin && deleteState.confirmation === 'DELETE' && <AdminButton variant="danger" onClick={permanentlyDelete} disabled={working}>Delete</AdminButton>}<AdminButton onClick={() => setDeleteState(null)} disabled={working}>Cancel</AdminButton></div>
        {(!deleteState.pin || deleteState.confirmation !== 'DELETE') && <p className="text-xs text-zinc-500">Enter the security PIN and type DELETE to reveal the permanent delete action.</p>}
      </div>
    </AdminDialog>}
  </div></AdminLayout>;
}

function Detail({ label, value, action }) { if (value === null || value === undefined || value === '') return null; return <div className="min-w-0 border-t border-white/[0.08] pt-3"><div className="flex items-center justify-between gap-3"><p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">{label}</p>{action}</div><p className="mt-2 break-words text-sm text-zinc-300">{value}</p></div>; }
function ExpandableSection({ title, description, children }) { return <details className="group border-t border-white/[0.08] pt-3"><summary className="flex min-h-12 list-none items-center justify-between gap-4 rounded-sm px-2 text-left transition hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50"><span><span className="block text-sm font-medium text-zinc-200">{title}</span>{description && <span className="mt-1 block text-xs leading-5 text-zinc-500">{description}</span>}</span><ChevronDown size={18} aria-hidden="true" className="shrink-0 text-zinc-500 transition group-open:rotate-180 group-open:text-amber-200 motion-reduce:transition-none" /></summary><div className="mt-5">{children}</div></details>; }
function ScopedFeedback({ scope, activeScope, error, message }) { if (scope !== activeScope || (!error && !message)) return null; return <AdminNotice tone={error ? 'error' : 'success'} className="mt-4" role={error ? 'alert' : 'status'}>{error || message}</AdminNotice>; }
function Timeline({ title, empty, items }) { return <div className="min-w-0"><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">{title}</p>{items.length ? <div className="mt-3 divide-y divide-white/[0.07]">{items.map((item) => <div key={item.id} className="py-3"><p className="break-words text-sm text-zinc-300">{item.title}</p>{item.detail && <p className="mt-1 break-words text-xs leading-5 text-zinc-500">{item.detail}</p>}<p className="mt-1 text-[10px] text-zinc-700">{formatDate(item.date)}</p></div>)}</div> : <p className="mt-3 text-sm text-zinc-600">{empty}</p>}</div>; }
function InquirySkeleton() { return <div role="status" aria-live="polite" aria-label="Loading inquiries">{[0, 1, 2, 3].map((item) => <div key={item} className="grid gap-3 border-b border-white/[0.08] py-5"><div className="h-3 w-48 animate-pulse bg-white/[0.05]" /><div className="h-2 w-64 max-w-full animate-pulse bg-white/[0.04]" /><div className="h-2 w-full animate-pulse bg-white/[0.035]" /></div>)}</div>; }
