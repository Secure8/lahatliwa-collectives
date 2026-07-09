import { Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import EmptyState from '../../components/EmptyState';
import LoadingState from '../../components/LoadingState';
import { formatDate } from '../../lib/helpers';
import { supabase } from '../../lib/supabaseClient';

const statuses = ['new', 'reviewed', 'contacted', 'accepted', 'declined', 'completed'];

export default function AdminInquiries() {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadInquiries() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('project_inquiries')
      .select('*')
      .order('created_at', { ascending: false });
    if (loadError) setError(loadError.message);
    else setInquiries(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadInquiries();
  }, []);

  async function updateStatus(inquiry, status) {
    const { error: statusError } = await supabase.from('project_inquiries').update({ status }).eq('id', inquiry.id);
    if (statusError) setError(statusError.message);
    else setInquiries((current) => current.map((item) => item.id === inquiry.id ? { ...item, status } : item));
  }

  async function deleteInquiry(inquiry) {
    if (!window.confirm(`Delete inquiry from "${inquiry.name}"?`)) return;
    const { error: deleteError } = await supabase.from('project_inquiries').delete().eq('id', inquiry.id);
    if (deleteError) setError(deleteError.message);
    else setInquiries((current) => current.filter((item) => item.id !== inquiry.id));
  }

  return (
    <AdminLayout>
      <div className="mb-8">
        <p className="text-sm text-amber-200">Client pipeline</p>
        <h1 className="mt-2 text-3xl font-bold">Project Inquiries</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Review public Start a Project submissions and update their status.</p>
      </div>
      {error && <div className="mb-5 rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-red-100">{error}</div>}
      {loading && <LoadingState label="Loading inquiries" />}
      {!loading && (inquiries.length ? (
        <div className="grid gap-4">
          {inquiries.map((inquiry) => (
            <article key={inquiry.id} className="grid gap-4 rounded-lg border border-white/10 bg-zinc-900/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-white">{inquiry.name}</h2>
                    <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-300">{inquiry.project_type}</span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">{inquiry.email_or_contact}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select value={inquiry.status} onChange={(event) => updateStatus(inquiry, event.target.value)} className="rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white outline-none">
                    {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <button onClick={() => deleteInquiry(inquiry)} className="inline-flex items-center gap-2 rounded-md border border-red-400/20 px-3 py-2 text-sm text-red-200 hover:bg-red-500/10"><Trash2 size={16} /> Delete</button>
                </div>
              </div>
              <div className="grid gap-2 text-sm text-zinc-400 md:grid-cols-3">
                <p>Organization: {inquiry.organization || 'N/A'}</p>
                <p>Budget: {inquiry.budget_range || 'N/A'}</p>
                <p>Deadline: {inquiry.deadline ? formatDate(inquiry.deadline) : 'N/A'}</p>
              </div>
              <p className="text-sm leading-6 text-zinc-300">{inquiry.message}</p>
            </article>
          ))}
        </div>
      ) : <EmptyState title="No inquiries yet" message="New public inquiries will appear here." />)}
    </AdminLayout>
  );
}
