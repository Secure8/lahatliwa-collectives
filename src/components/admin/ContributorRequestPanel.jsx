import { Check, Send, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AdminActionButton, AdminNotice, AdminStatusBadge } from './AdminUI';
import { contributorCreditRoles, normalizeContributorCreditDetails, PROJECT_CREDIT_ROLE_PRESETS, toggleContributorPresetRole } from '../../lib/projectCredits';
import { supabase } from '../../lib/supabaseClient';

export default function ContributorRequestPanel({ project, creativeId, canReview = false }) {
  const [details, setDetails] = useState(() => normalizeContributorCreditDetails({}));
  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  async function load() {
    const { data } = await supabase.from('contributor_requests').select('*, creative_members(name, profile_image_url)').eq('project_id', project.id).order('created_at', { ascending: false });
    setRequests(data || []);
  }
  useEffect(() => { load(); }, [project.id]);
  const roles = contributorCreditRoles(details);

  async function submit(event) {
    event.preventDefault(); setSaving(true); setNotice('');
    const { error } = await supabase.rpc('submit_contributor_request', { p_project_id: project.id, p_roles: roles, p_message: message });
    if (error) setNotice(error.message); else { setDetails(normalizeContributorCreditDetails({})); setMessage(''); setNotice('Request sent for review.'); await load(); }
    setSaving(false);
  }
  async function review(id, decision) {
    setSaving(true); setNotice('');
    const { error } = await supabase.rpc('review_contributor_request', { p_request_id: id, p_decision: decision, p_roles: null });
    if (error) setNotice(error.message); else { setNotice(`Request ${decision}.`); await load(); }
    setSaving(false);
  }
  async function cancel(id) {
    setSaving(true); const { error } = await supabase.rpc('cancel_contributor_request', { p_request_id: id });
    setNotice(error?.message || 'Request cancelled.'); await load(); setSaving(false);
  }

  return <section className="grid gap-4 rounded-md bg-zinc-950/45 p-4 ring-1 ring-white/[0.06]">
    <div><p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Contributor credits</p><h2 className="mt-2 text-lg font-semibold text-white">{canReview ? 'Contributor requests' : 'Request contributor credit'}</h2></div>
    {!canReview && creativeId && <form onSubmit={submit} className="grid gap-3">
      <fieldset className="grid gap-2"><legend className="text-sm text-zinc-300">Requested roles</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{PROJECT_CREDIT_ROLE_PRESETS.map((role) => { const selected = details.roles.includes(role); return <label key={role} className={`flex cursor-pointer items-start gap-2 rounded-md px-2.5 py-2 text-xs ring-1 ${selected ? 'bg-amber-300/12 text-amber-100 ring-amber-300/30' : 'bg-white/[0.025] text-zinc-400 ring-white/[0.06]'}`}><input type="checkbox" checked={selected} onChange={() => setDetails((current) => toggleContributorPresetRole(current, role))} className="mt-0.5 accent-amber-300" />{role}</label>; })}</div></fieldset>
      <label className="grid gap-2 text-sm text-zinc-300">Other roles, separated by commas<input value={details.customRoles} onChange={(e) => setDetails((current) => ({ ...current, customRoles: e.target.value }))} onBlur={() => setDetails((current) => normalizeContributorCreditDetails(current))} className="rounded-md bg-zinc-950/55 px-3 py-3 text-white ring-1 ring-white/[0.08]" placeholder="Art Direction, Captions" /></label>
      <label className="grid gap-2 text-sm text-zinc-300">Optional note<textarea value={message} maxLength="1000" onChange={(e) => setMessage(e.target.value)} className="min-h-20 rounded-md bg-zinc-950/55 px-3 py-3 text-white ring-1 ring-white/[0.08]" /></label>
      <AdminActionButton type="submit" disabled={saving || !roles.length} variant="primary" className="w-fit"><Send size={14} /> Request credit</AdminActionButton>
    </form>}
    {notice && <AdminNotice tone={notice.includes('sent') || notice.includes('approved') || notice.includes('cancelled') ? 'success' : 'error'}>{notice}</AdminNotice>}
    <div className="grid gap-2">{requests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white/[0.035] p-3 text-sm"><div className="min-w-0"><p className="font-medium text-white">{request.creative_members?.name || 'Creative'}</p><p className="mt-1 text-zinc-400">{request.requested_roles.join(', ')}</p>{request.message && <p className="mt-1 text-zinc-500">{request.message}</p>}</div><div className="flex items-center gap-2"><AdminStatusBadge status={request.status} />{canReview && request.status === 'pending' && <><AdminActionButton disabled={saving} onClick={() => review(request.id, 'approved')} variant="primary"><Check size={14} /> Approve</AdminActionButton><AdminActionButton disabled={saving} onClick={() => review(request.id, 'rejected')} variant="danger"><X size={14} /> Reject</AdminActionButton></>}{!canReview && request.status === 'pending' && <AdminActionButton disabled={saving} onClick={() => cancel(request.id)} variant="danger">Cancel</AdminActionButton>}</div></div>)}{!requests.length && <p className="text-sm text-zinc-500">No contributor requests yet.</p>}</div>
  </section>;
}
