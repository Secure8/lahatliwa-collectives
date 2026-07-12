import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import CreativeProfileView from '../components/CreativeProfileView';
import LoadingState from '../components/LoadingState';
import { supabase } from '../lib/supabaseClient';
import { detailBackAction } from '../lib/navigationHistory';

export default function CreativeDetails() {
  const location = useLocation(); const navigate = useNavigate();
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

  const goBack = () => { const action = detailBackAction(location.state, window.history.state?.idx, '/creatives'); if (action.delta) navigate(action.delta); else navigate(action.to); };
  return <article className="page-shell py-14 sm:py-20"><button type="button" onClick={goBack} className="fine-link site-hover-accent text-sm text-zinc-400">Back</button><div className="mt-10"><CreativeProfileView creative={creative} projects={projects} /></div></article>;
}
