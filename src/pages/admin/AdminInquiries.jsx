import { Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
  AdminActionButton,
  AdminActionGroup,
  AdminEmptyState,
  AdminNotice,
  AdminPageHeader,
} from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { formatDate } from '../../lib/helpers';
import { supabase } from '../../lib/supabaseClient';
import { canManageAllProjects, useAdminAccess } from '../../lib/adminAccess';

const statuses = ['new', 'reviewed', 'contacted', 'accepted', 'declined', 'completed'];
const filters = ['all', ...statuses];
const statusLabels = {
  new: 'New',
  reviewed: 'Reviewed',
  contacted: 'Contacted',
  accepted: 'Accepted',
  declined: 'Declined',
  completed: 'Completed',
};

function preview(value = '', length = 150) {
  return value.length > length ? `${value.slice(0, length).trim()}...` : value;
}

export default function AdminInquiries() {
  const [inquiries, setInquiries] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creativeNames, setCreativeNames] = useState({});
  const { role, adminUser } = useAdminAccess();
  const canManage = canManageAllProjects(role);

  async function loadInquiries() {
    setLoading(true);
    const [{ data, error: loadError }, { data: creativeRows }] = await Promise.all([
      supabase.from('project_inquiries').select('*').order('created_at', { ascending: false }),
      supabase.from('creative_members').select('id, name').eq('is_published', true),
    ]);
    if (loadError) setError(loadError.message);
    else {
      setInquiries(data || []);
      setCreativeNames(Object.fromEntries((creativeRows || []).map((creative) => [creative.id, creative.name])));
    }
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
        <div className="grid gap-6">
          <div className="flex gap-5 overflow-x-auto border-b border-white/[0.06]">
            {filters.map((filter) => {
              const count = filter === 'all' ? inquiries.length : inquiries.filter((inquiry) => inquiry.status === filter).length;
              const isActive = activeFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`shrink-0 border-b-2 px-0 pb-3 text-sm capitalize transition ${isActive ? 'border-amber-200 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}
                >
                  {statusLabels[filter] || 'All'} <span className="ml-1 text-xs text-zinc-600">{count}</span>
                </button>
              );
            })}
          </div>

          {visibleInquiries.length ? (
            <div className="divide-y divide-white/[0.055]">
              {visibleInquiries.map((inquiry) => (
                <article key={inquiry.id} className="grid gap-4 py-5 transition-colors hover:bg-white/[0.025] md:grid-cols-[1fr_auto] md:px-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <h2 className="text-base font-medium text-white">{inquiry.name}</h2>
                      <span className="text-xs capitalize text-amber-100/80">{statusLabels[inquiry.status] || inquiry.status}</span>
                      <span className="text-xs text-zinc-600">{formatDate(inquiry.created_at)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
                      <span>{inquiry.email_or_contact}</span>
                      <span>{inquiry.organization || 'No organization'}</span>
                      <span>{inquiry.project_type}</span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-zinc-300">{preview(inquiry.message)}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                      <span>Budget: {inquiry.budget_range || 'N/A'}</span>
                      <span>Deadline: {inquiry.deadline ? formatDate(inquiry.deadline) : 'N/A'}</span>
                      {inquiry.preferred_contact && <span>Preferred: {inquiry.preferred_contact}</span>}
                      {creativeNames[inquiry.preferred_creative_id] && <span className={inquiry.preferred_creative_id === adminUser?.creative_member_id ? 'text-amber-100' : ''}>Preferred creative: {creativeNames[inquiry.preferred_creative_id]}</span>}
                    </div>
                  </div>
                  {canManage ? <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <label className="sr-only" htmlFor={`inquiry-status-${inquiry.id}`}>Status</label>
                    <select
                      id={`inquiry-status-${inquiry.id}`}
                      value={inquiry.status}
                      onChange={(event) => updateStatus(inquiry, event.target.value)}
                      className="h-9 rounded-md bg-transparent px-2 text-xs text-zinc-300 outline-none ring-1 ring-white/[0.08] transition hover:bg-white/[0.04] focus:ring-amber-200/40"
                    >
                      {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                    </select>
                    <AdminActionGroup>
                      <AdminActionButton onClick={() => deleteInquiry(inquiry)} variant="danger"><Trash2 size={14} /> Delete</AdminActionButton>
                    </AdminActionGroup>
                  </div> : <p className="text-xs text-zinc-600 md:text-right">View only</p>}
                </article>
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

