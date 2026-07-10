import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader, AdminSurface } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { supabase } from '../../lib/supabaseClient';

export default function CreativeDirectory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDirectory() {
      const { data, error: loadError } = await supabase
        .from('creative_members')
        .select('id, name, slug, role, short_bio, profile_image_url, skills, availability_status')
        .eq('is_published', true)
        .order('display_order', { ascending: true, nullsFirst: false });
      setRows(data || []);
      setError(loadError?.message || '');
      setLoading(false);
    }
    loadDirectory();
  }, []);

  return (
    <AdminLayout>
      <AdminPageHeader eyebrow="Collective" title="Creative Directory" description="Browse approved creative profiles and their published work." />
      {error && <AdminNotice className="mb-5">{error}</AdminNotice>}
      {loading ? <LoadingState label="Loading creatives" /> : rows.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((creative) => (
            <AdminSurface key={creative.id} as="article" className="flex min-w-0 flex-col gap-4">
              <div className="flex items-start gap-3">
                {creative.profile_image_url ? (
                  <img src={creative.profile_image_url} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/[0.06] text-zinc-500">{creative.name?.slice(0, 1)}</div>
                )}
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-white">{creative.name}</h2>
                  <p className="mt-1 text-sm text-zinc-400">{creative.role}</p>
                  {creative.availability_status && <p className="mt-1 text-xs text-zinc-500">{creative.availability_status}</p>}
                </div>
              </div>
              {creative.short_bio && <p className="text-sm leading-6 text-zinc-400">{creative.short_bio}</p>}
              <AdminButton to={`/creatives/${creative.slug}`} className="mt-auto w-fit"><ExternalLink size={15} /> View profile</AdminButton>
            </AdminSurface>
          ))}
        </div>
      ) : <AdminEmptyState title="No approved creatives yet" message="Approved creative profiles will appear here." />}
    </AdminLayout>
  );
}
