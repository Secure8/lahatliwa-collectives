import { Check, ExternalLink, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import LoadingState from '../../components/LoadingState';
import IconLabelAction from '../../components/IconLabelAction';
import { supabase } from '../../lib/supabaseClient';

export default function CreativeJoinRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError('');
    const { data, error: loadError } = await supabase.from('creative_join_requests')
      .select('id,name,email,portfolio_url,message,status,created_at,updated_at')
      .order('created_at', { ascending: false });
    if (loadError) setError(loadError.message); else setRequests(data || []);
    setLoading(false); setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') load({ quiet: true }); };
    const refreshOnFocus = () => load({ quiet: true });
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('focus', refreshOnFocus);
    const channel = supabase.channel('creative-join-requests-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'creative_join_requests' }, () => load({ quiet: true }))
      .subscribe();
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('focus', refreshOnFocus);
      supabase.removeChannel(channel);
    };
  }, [load]);

  async function review(request, decision) {
    setBusy(request.id); setError('');
    const { data, error: invokeError } = await supabase.functions.invoke('invite-team-member', { body: { action: decision === 'approved' ? 'approve_request' : 'reject_request', requestId: request.id } });
    if (invokeError || !data?.success) setError(data?.message || invokeError?.message || 'The request could not be reviewed.');
    else await load();
    setBusy('');
  }

  return <AdminLayout>
    <header className="ll-operations-intro ll-operations-intro--action"><div><p className="ll-kicker">Creative access</p><h2>Join requests</h2><p>People request access publicly. Approving creates a private Creative profile and emails the applicant an account invitation.</p></div><IconLabelAction icon={<RefreshCw size={16} className={refreshing ? 'animate-spin' : ''}/>} label={refreshing ? 'Refreshing…' : 'Refresh'} onClick={() => load({ quiet: true })} disabled={refreshing}/></header>
    {error && <p className="ll-form-error" role="alert">{error}</p>}
    {loading ? <LoadingState label="Loading join requests"/> : <div className="ll-request-list">
      {requests.map((request) => <article key={request.id} className="ll-request-card">
        <div><h3>{request.name}</h3><p>{request.email}</p>{request.message && <p>{request.message}</p>}{request.portfolio_url && <a href={request.portfolio_url} target="_blank" rel="noreferrer">View portfolio <ExternalLink size={14}/></a>}</div>
        <div className="ll-request-card__status"><span data-status={request.status}>{request.status}</span>{request.status === 'pending' && <div><IconLabelAction disabled={busy===request.id} icon={<Check size={15}/>} label="Approve" tone="primary" onClick={()=>review(request,'approved')}/><IconLabelAction disabled={busy===request.id} icon={<X size={15}/>} label="Decline" tone="danger" onClick={()=>review(request,'rejected')}/></div>}</div>
      </article>)}
      {!requests.length && <p className="ll-operations-empty">No join requests yet.</p>}
    </div>}
  </AdminLayout>;
}
