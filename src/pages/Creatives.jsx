import { useEffect, useState } from 'react';
import CreativeCard from '../components/CreativeCard';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import { usePublicContent } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';

export default function Creatives() {
  const [creatives, setCreatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { content } = usePublicContent([]);

  useEffect(() => {
    let active = true;
    async function loadCreatives() {
      const { data, error: creativeError } = await supabase
        .from('creative_members')
        .select('id, name, slug, role, short_bio, profile_image_url, skills, is_featured, display_order, created_at')
        .eq('is_published', true)
        .order('is_featured', { ascending: false })
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false });

      if (!active) return;
      if (creativeError) setError(creativeError.message);
      else setCreatives(data || []);
      setLoading(false);
    }
    loadCreatives();
    return () => { active = false; };
  }, []);

  return (
    <div className="page-shell py-20">
      <div className="mb-12 max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.28em]" style={{ color: content.accentColor }}>Creatives</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: content.primaryTextColor }}>The people shaping Lahat Liwa Collectives.</h1>
        <p className="mt-5 max-w-2xl leading-7" style={{ color: content.secondaryTextColor }}>A growing circle of creatives working across visuals, social content, websites, editing, and digital support.</p>
      </div>
      {loading && <LoadingState label="Loading creatives" />}
      {error && <div className="rounded-md border border-red-400/30 bg-red-500/10 p-4 text-red-100">{error}</div>}
      {!loading && !error && (
        creatives.length ? (
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {creatives.map((creative) => <CreativeCard key={creative.id} creative={creative} />)}
          </div>
        ) : <EmptyState title="No creatives yet" message="Published creative profiles will appear here." />
      )}
    </div>
  );
}
