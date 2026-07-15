import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
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
  const [topControlsVisible, setTopControlsVisible] = useState(false);
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
      const { data: links } = await supabase.from('project_creatives').select('credit_roles, contribution_role, role, projects(id, title, slug, category, cover_image, status)').eq('creative_id', data.id).order('is_primary', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false });
      if (!active) return;
      setProjects((links || []).map((link) => link.projects ? ({ ...link.projects, credit_roles: link.credit_roles, contribution_role: link.contribution_role, role: link.role }) : null).filter((project) => project?.status === 'published'));
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

  useEffect(() => {
    const revealFromTopEdge = (event) => {
      if (event.pointerType === 'mouse') setTopControlsVisible(event.clientY <= 140);
    };
    window.addEventListener('pointermove', revealFromTopEdge, { passive: true });
    return () => window.removeEventListener('pointermove', revealFromTopEdge);
  }, []);

  if (loading) return <div className="page-shell py-20"><LoadingState label="Loading creative" /></div>;
  if (error || !creative) return <div className="page-shell py-20"><p className="major-border-y py-8 text-zinc-300">{error || 'Creative profile not found.'}</p></div>;

  const goBack = () => { const action = detailBackAction(location.state, window.history.state?.idx, '/creatives'); if (action.delta) navigate(action.delta); else navigate(action.to); };
  const bio = creative.full_bio || creative.short_bio;
  const hasSkills = Array.isArray(creative.skills) && creative.skills.some(Boolean);
  return <article className="mx-auto w-[min(1360px,calc(100%-24px))] pb-12 pt-1 sm:pb-16">
    <button type="button" onClick={goBack} onFocus={() => setTopControlsVisible(true)} onBlur={() => setTopControlsVisible(false)} className={`group fixed left-3 top-[4.5rem] z-40 inline-flex min-h-11 items-center gap-2 border-b border-white/15 bg-zinc-950/75 px-3 text-xs font-medium uppercase tracking-[0.16em] text-zinc-300 backdrop-blur-sm transition hover:border-orange-300/60 hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 xl:left-[max(0.75rem,calc((100vw-1360px)/2))] xl:transition-[transform,opacity] xl:duration-300 xl:ease-out motion-reduce:transition-none ${topControlsVisible ? 'xl:translate-y-0 xl:opacity-100' : 'xl:pointer-events-none xl:-translate-y-2 xl:opacity-0'}`}><ArrowLeft size={15} className="transition-transform group-hover:-translate-x-0.5 motion-reduce:transform-none" />Back</button>
    <CreativeProfileQuickNav visible={topControlsVisible} hasBio={Boolean(bio)} hasSkills={hasSkills} onFocusChange={setTopControlsVisible} />
    <div className="relative mt-1"><CreativeProfileView creative={creative} projects={projects} /></div>
  </article>;
}

function CreativeProfileQuickNav({ visible, hasBio, hasSkills, onFocusChange }) {
  return <nav aria-label="Creative profile navigation" onFocusCapture={() => onFocusChange(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onFocusChange(false); }} className={`fixed left-1/2 top-[4.5rem] z-40 hidden min-h-11 -translate-x-1/2 items-center gap-1 rounded-full border border-white/15 bg-zinc-950/90 p-1 shadow-[0_14px_45px_rgba(0,0,0,0.45)] backdrop-blur-xl xl:flex xl:transition-[transform,opacity] xl:duration-300 xl:ease-out motion-reduce:transition-none ${visible ? 'xl:translate-y-0 xl:opacity-100' : 'xl:pointer-events-none xl:-translate-y-2 xl:opacity-0'}`}>
    <a href="#work" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-300 transition hover:bg-white/[0.08] hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">Portfolio</a>
    {hasBio && <a href="#about" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-300 transition hover:bg-white/[0.08] hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">About</a>}
    {hasSkills && <a href="#skills" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-300 transition hover:bg-white/[0.08] hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">Capabilities</a>}
    <a href="#contact" className="inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-300 transition hover:bg-white/[0.08] hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">Contact</a>
  </nav>;
}
