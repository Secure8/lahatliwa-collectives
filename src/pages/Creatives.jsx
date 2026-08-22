import { useEffect, useState } from 'react';
import CreativeCard from '../components/CreativeCard';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import { usePublicContent } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';
import PublicPageHeader from '../components/PublicPageHeader';

export default function Creatives() {
  const [creatives, setCreatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { content } = usePublicContent(['home']);
  const page = content.websitePages?.creatives || {};

  useEffect(() => {
    let active = true;
    async function loadCreatives() {
      const { data, error: creativeError } = await supabase
        .from('creative_members')
        .select('id, name, slug, role, short_bio, profile_image_url, skills, availability_status, is_featured, display_order, created_at')
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
    <div className="page-shell">
      <PublicPageHeader eyebrow={page.directoryEyebrow || 'Aklan Creatives'} title={page.directoryTitle || 'Meet the people behind the work.'} description={page.directoryDescription || `Browse distinct portfolios, disciplines, availability, and direct inquiry paths across ${content.displayName}.`} backgroundImage={page.heroBackgroundImageUrl} backgroundPosition={page.heroBackgroundPosition || 'center'} edit={{ section: 'page.creatives', eyebrowField: 'directoryEyebrow', titleField: 'directoryTitle', descriptionField: 'directoryDescription', backgroundField: 'heroBackgroundImageUrl' }} />
      <div className="pt-12">
      {loading && <LoadingState label="Loading creatives" />}
      {error && <div className="border-y border-red-400/30 py-5 text-red-100">{error}</div>}
      {!loading && !error && (
        creatives.length ? (
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {creatives.map((creative) => <CreativeCard key={creative.id} creative={creative} headingLevel="h2" />)}
          </div>
        ) : <EmptyState title="No published profiles yet" message="Published creative profiles will appear here." />
      )}
      </div>
    </div>
  );
}
