import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
  AdminButton,
  AdminEmptyState,
  AdminNotice,
  AdminPageHeader,
  AdminSelect,
  AdminSoftPanel,
  AdminStatusBadge,
  AdminSurface,
} from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { formatDate } from '../../lib/helpers';
import { supabase } from '../../lib/supabaseClient';

const statuses = ['new', 'reviewed', 'contacted', 'accepted', 'declined', 'completed'];
const filters = ['all', ...statuses];

export default function AdminInquiries() {
  const [inquiries, setInquiries] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
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

  const visibleInquiries = useMemo(() => (
    activeFilter === 'all' ? inquiries : inquiries.filter((inquiry) => inquiry.status === activeFilter)
  ), [activeFilter, inquiries]);

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
      <AdminPageHeader
        eyebrow="Client pipeline"
        title="Project Inquiries"
        description="Review public Start a Project submissions, triage their status, and keep the conversation moving."
      />
      {error && <AdminNotice className="mb-5">{error}</AdminNotice>}
      {loading && <LoadingState label="Loading inquiries" />}
      {!loading && (
        <div className="grid gap-5">
          <AdminSurface className="flex gap-2 overflow-x-auto p-3">
            {filters.map((filter) => {
              const count = filter === 'all' ? inquiries.length : inquiries.filter((inquiry) => inquiry.status === filter).length;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm capitalize transition ${activeFilter === filter ? 'bg-amber-300 text-zinc-950' : 'bg-white/[0.045] text-zinc-300 ring-1 ring-white/[0.06] hover:bg-white/[0.075]'}`}
                >
                  {filter} <span className="ml-1 opacity-70">{count}</span>
                </button>
              );
            })}
          </AdminSurface>

          {visibleInquiries.length ? (
            <div className="grid gap-4">
              {visibleInquiries.map((inquiry) => (
                <AdminSurface key={inquiry.id} as="article" className={inquiry.status === 'new' ? 'ring-amber-200/18' : ''}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-white">{inquiry.name}</h2>
                        <AdminStatusBadge status={inquiry.status} />
                        <AdminStatusBadge>{inquiry.project_type}</AdminStatusBadge>
                      </div>
                      <p className="mt-2 text-sm text-zinc-500">{inquiry.email_or_contact}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <AdminSelect label="Status" value={inquiry.status} options={statuses} onChange={(value) => updateStatus(inquiry, value)} className="min-w-40" />
                      <AdminButton onClick={() => deleteInquiry(inquiry)} variant="danger" className="self-end"><Trash2 size={16} /> Delete</AdminButton>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 md:grid-cols-3">
                    <AdminSoftPanel>
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">Organization</p>
                      <p className="mt-2 text-sm text-zinc-300">{inquiry.organization || 'N/A'}</p>
                    </AdminSoftPanel>
                    <AdminSoftPanel>
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">Budget</p>
                      <p className="mt-2 text-sm text-zinc-300">{inquiry.budget_range || 'N/A'}</p>
                    </AdminSoftPanel>
                    <AdminSoftPanel>
                      <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">Deadline</p>
                      <p className="mt-2 text-sm text-zinc-300">{inquiry.deadline ? formatDate(inquiry.deadline) : 'N/A'}</p>
                    </AdminSoftPanel>
                  </div>
                  <p className="mt-5 text-sm leading-6 text-zinc-300">{inquiry.message}</p>
                  {inquiry.preferred_contact && <p className="mt-4 text-xs text-zinc-500">Preferred contact: {inquiry.preferred_contact}</p>}
                </AdminSurface>
              ))}
            </div>
          ) : (
            <AdminEmptyState title="No inquiries yet" message="New public inquiries will appear here." />
          )}
        </div>
      )}
    </AdminLayout>
  );
}
