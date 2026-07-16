import { ExternalLink, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminEmptyState, AdminPageHeader } from '../../components/admin/AdminUI';
import { supabase } from '../../lib/supabaseClient';

export default function CreativeDirectory() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);
  const requestRef = useRef(0);

  async function loadDirectory() {
    const requestId = ++requestRef.current;
    setLoading(true); setError('');
    const { data, error: loadError } = await supabase.from('creative_members').select('id, name, slug, role, short_bio, profile_image_url, skills, availability_status').eq('is_published', true).order('display_order', { ascending: true, nullsFirst: false });
    if (!mountedRef.current || requestId !== requestRef.current) return;
    if (loadError) setError(loadError.message || 'Unable to load the creative directory.');
    else setRows(data || []);
    setLoading(false);
  }

  useEffect(() => { mountedRef.current = true; loadDirectory(); return () => { mountedRef.current = false; }; }, []);

  const availabilityOptions = useMemo(() => [...new Set(rows.map((row) => row.availability_status).filter(Boolean))].sort(), [rows]);
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((creative) => (availability === 'all' || creative.availability_status === availability) && (!query || [creative.name, creative.role, creative.short_bio, ...(creative.skills || [])].some((value) => String(value || '').toLowerCase().includes(query))));
  }, [availability, rows, search]);

  return <AdminLayout><div className="w-full max-w-6xl">
    <AdminPageHeader eyebrow="Published profiles" title="Creative Directory" description="Browse published creative profiles available to your current platform role." />
    <div className="mb-5 py-3 text-xs uppercase tracking-[0.16em] text-zinc-600">{visibleRows.length} visible {visibleRows.length === 1 ? 'creative' : 'creatives'}</div>
    <section className="grid gap-4 border-b border-white/[0.08] pb-6 sm:grid-cols-[minmax(0,1fr)_14rem]">
      <label className="grid gap-1.5 text-sm text-zinc-300"><span>Search directory</span><span data-search-shell className="flex items-center gap-2 border-b border-white/[0.12]"><Search size={15} className="text-zinc-600" aria-hidden="true" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, role, bio, or skill" className="w-full bg-transparent px-0 py-2.5 text-white outline-none placeholder:text-zinc-700" /></span></label>
      <label className="grid gap-1.5 text-sm text-zinc-300"><span>Availability</span><select value={availability} onChange={(event) => setAvailability(event.target.value)} className="w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-2.5 text-white outline-none [color-scheme:dark] focus:border-amber-200/60"><option value="all">All availability</option>{availabilityOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </section>
    {loading ? <DirectorySkeleton /> : error ? <div className="border-b border-red-300/15 py-8"><p className="text-sm text-red-200">{error}</p><button type="button" onClick={loadDirectory} className="mt-3 border-b border-red-200/30 pb-1 text-sm text-red-100">Retry</button></div> : visibleRows.length ? <div className="divide-y divide-white/[0.08]">{visibleRows.map((creative) => <article key={creative.id} className="grid gap-4 py-5 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:items-center"><div className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-white/[0.04] text-zinc-500">{creative.profile_image_url ? <img src={creative.profile_image_url} alt={`${creative.name} profile`} loading="lazy" decoding="async" className="h-full w-full object-cover" /> : creative.name?.slice(0, 1)}</div><div className="min-w-0"><h2 className="truncate font-medium text-white">{creative.name}</h2><p className="mt-1 text-sm text-zinc-400">{creative.role}</p>{creative.availability_status && <p className="mt-1 text-xs text-zinc-600">{creative.availability_status}</p>}{creative.short_bio && <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-zinc-500">{creative.short_bio}</p>}</div><AdminButton to={`/creatives/${creative.slug}`} variant="ghost" className="w-fit" aria-label={`View ${creative.name}`}><ExternalLink size={15} /> View</AdminButton></article>)}</div> : <AdminEmptyState title={rows.length ? 'No creatives match these filters' : 'No published creatives yet'} message={rows.length ? 'Adjust the search or availability filter.' : 'Published creative profiles will appear here.'} />}
  </div></AdminLayout>;
}

function DirectorySkeleton() { return <div aria-label="Loading creative directory">{[0, 1, 2, 3].map((item) => <div key={item} className="grid grid-cols-[3.5rem_1fr] gap-4 border-b border-white/[0.08] py-5"><div className="h-14 w-14 animate-pulse rounded-full bg-white/[0.05]" /><div className="grid content-center gap-3"><div className="h-3 w-40 animate-pulse bg-white/[0.05]" /><div className="h-2 w-24 animate-pulse bg-white/[0.04]" /></div></div>)}</div>; }
