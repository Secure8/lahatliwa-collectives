import { Check, ExternalLink, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import LoadingState from '../../components/LoadingState';
import { supabase } from '../../lib/supabaseClient';

export default function CreativeJoinRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('creative_join_requests').select('*').order('created_at', { ascending: false });
    if (loadError) setError(loadError.message); else setRequests(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function review(request, decision) {
    setBusy(request.id); setError('');
    const { data, error: invokeError } = await supabase.functions.invoke('invite-team-member', { body: { action: decision === 'approved' ? 'approve_request' : 'reject_request', requestId: request.id } });
    if (invokeError || !data?.success) setError(data?.message || invokeError?.message || 'The request could not be reviewed.');
    else await load();
    setBusy('');
  }

  return <AdminLayout>
    <header className="ll-operations-intro"><p className="ll-kicker">Creative access</p><h2>Join requests</h2><p>People request access publicly. Approving creates a private Creative profile and emails the applicant an account invitation.</p></header>
    {error && <p className="ll-form-error" role="alert">{error}</p>}
    {loading ? <LoadingState label="Loading join requests"/> : <div className="ll-request-list">
      {requests.map((request) => <article key={request.id} className="ll-request-card">
        <div><h3>{request.name}</h3><p>{request.email}</p>{request.message && <p>{request.message}</p>}{request.portfolio_url && <a href={request.portfolio_url} target="_blank" rel="noreferrer">View portfolio <ExternalLink size={14}/></a>}</div>
        <div className="ll-request-card__status"><span data-status={request.status}>{request.status}</span>{request.status === 'pending' && <div><button disabled={busy===request.id} onClick={()=>review(request,'approved')}><Check size={15}/> Approve</button><button disabled={busy===request.id} onClick={()=>review(request,'rejected')}><X size={15}/> Decline</button></div>}</div>
      </article>)}
      {!requests.length && <p className="ll-operations-empty">No join requests yet.</p>}
    </div>}
  </AdminLayout>;
}
