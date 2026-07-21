import { CheckCircle2, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout.jsx';
import { AdminButton, AdminPageHeader, AdminSurface } from '../../components/admin/AdminUI.jsx';
import { supabase } from '../../lib/supabaseClient.js';

const checks = [
  ['Website content', () => supabase.from('site_settings').select('id', { count: 'exact', head: true })],
  ['Explore Aklan', () => supabase.from('editorial_feature_flags').select('singleton', { count: 'exact', head: true })],
  ['Inquiries', () => supabase.from('project_inquiries').select('id', { count: 'exact', head: true })],
];

export default function AdminSystemStatus() {
  const [state, setState] = useState({ loading: true, rows: [] });

  async function load() {
    setState((current) => ({ ...current, loading: true }));
    const results = await Promise.allSettled(checks.map(([, run]) => run()));
    setState({ loading: false, rows: checks.map(([label], index) => ({ label, available: results[index].status === 'fulfilled' && !results[index].value?.error })) });
  }

  useEffect(() => { load(); }, []);

  return <AdminLayout>
    <AdminPageHeader eyebrow="Advanced" title="System status" description="Check whether the main website workspaces can be reached." action={<AdminButton onClick={load} disabled={state.loading}><RefreshCw size={15} />{state.loading ? 'Checking…' : 'Check again'}</AdminButton>} />
    <AdminSurface><div className="divide-y divide-white/[0.08]">{state.rows.map((row) => <div key={row.label} className="flex items-center justify-between gap-4 py-4"><span className="font-medium text-zinc-100">{row.label}</span><span className={`inline-flex items-center gap-2 text-sm ${row.available ? 'text-emerald-200' : 'text-red-200'}`}>{row.available ? <CheckCircle2 size={16} /> : <TriangleAlert size={16} />}{row.available ? 'Available' : 'Unavailable'}</span></div>)}</div></AdminSurface>
  </AdminLayout>;
}
