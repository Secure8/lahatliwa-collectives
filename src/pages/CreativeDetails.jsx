import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CreativeProfileView from '../components/CreativeProfileView';
import LoadingState from '../components/LoadingState';
import { supabase } from '../lib/supabaseClient';

export default function CreativeDetails() {
  const { slug } = useParams();
  const [creative, setCreative] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadCreative() {
      setLoading(true);
      const { data, error: creativeError } = await supabase.from('creative_members').select('*').eq('slug', slug).eq('is_published', true).single();
      if (creativeError) {
        setError('Creative profile not found or not published yet.');
        setLoading(false);
        return;
      }
      setCreative(data);
      const { data: links } = await supabase.from('project_creatives').select('projects(*)').eq('creative_id', data.id).order('is_primary', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false });
      setProjects((links || []).map((link) => link.projects).filter((project) => project?.status === 'published'));
      setLoading(false);
    }
    loadCreative();
  }, [slug]);

  if (loading) return <div className="page-shell py-20"><LoadingState label="Loading creative" /></div>;
  if (error || !creative) return <div className="page-shell py-20"><p className="major-border-y py-8 text-zinc-300">{error || 'Creative profile not found.'}</p></div>;

  return <article className="page-shell py-14 sm:py-20"><Link to="/creatives" className="fine-link site-hover-accent text-sm text-zinc-400">Back to creatives</Link><div className="mt-10"><CreativeProfileView creative={creative} projects={projects} /></div></article>;
}
