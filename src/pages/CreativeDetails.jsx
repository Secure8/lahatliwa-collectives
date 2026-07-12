import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import CreativeProfileView from '../components/CreativeProfileView';
import LoadingState from '../components/LoadingState';
import { supabase } from '../lib/supabaseClient';
import { detailBackAction } from '../lib/navigationHistory';
import { applyPublicMetadata } from '../lib/publicMetadata';
import { getPublicImageUrl } from '../lib/storage';

export default function CreativeDetails() {
  const location = useLocation(); const navigate = useNavigate();
  const { slug } = useParams();
  const [creative, setCreative] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadCreative() {
      setLoading(true);
      setError('');
      setCreative(null);
      setProjects([]);
      const { data, error: creativeError } = await supabase.from('creative_members').select('id, name, slug, role, short_bio, full_bio, profile_image_url, cover_image, skills, social_links, availability_status').eq('slug', slug).eq('is_published', true).single();
      if (!active) return;
      if (creativeError) {
        setError('Creative profile not found or not published yet.');
        setLoading(false);
        return;
      }
      setCreative(data);
      const { data: links } = await supabase.from('project_creatives').select('projects(id, title, slug, category, cover_image, status)').eq('creative_id', data.id).order('is_primary', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false });
      if (!active) return;
      setProjects((links || []).map((link) => link.projects).filter((project) => project?.status === 'published'));
      setLoading(false);
    }
    loadCreative();
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!creative) return;
    applyPublicMetadata({
      title: `${creative.name} | Lahat Liwa Collectives`,
      description: String(creative.short_bio || creative.full_bio || 'View a published creative profile from Lahat Liwa Collectives.').slice(0, 160),
      pathname: `/creatives/${creative.slug}`,
      type: 'profile',
      image: getPublicImageUrl(creative.cover_image || creative.profile_image_url),
    });
  }, [creative]);

  if (loading) return <div className="page-shell py-20"><LoadingState label="Loading creative" /></div>;
  if (error || !creative) return <div className="page-shell py-20"><p className="major-border-y py-8 text-zinc-300">{error || 'Creative profile not found.'}</p></div>;

  const goBack = () => { const action = detailBackAction(location.state, window.history.state?.idx, '/creatives'); if (action.delta) navigate(action.delta); else navigate(action.to); };
  return <article className="page-shell py-14 sm:py-20"><button type="button" onClick={goBack} className="fine-link site-hover-accent text-sm text-zinc-400">Back</button><div className="mt-10"><CreativeProfileView creative={creative} projects={projects} /></div></article>;
}
