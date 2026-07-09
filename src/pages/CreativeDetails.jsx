import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import ProjectGrid from '../components/ProjectGrid';
import { usePublicContent } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';

export default function CreativeDetails() {
  const { slug } = useParams();
  const [creative, setCreative] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { content } = usePublicContent([]);

  useEffect(() => {
    async function loadCreative() {
      const { data, error: creativeError } = await supabase
        .from('creative_members')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single();

      if (creativeError) {
        setError('Creative profile not found or not published yet.');
        setLoading(false);
        return;
      }

      setCreative(data);
      const { data: links } = await supabase
        .from('project_creatives')
        .select('projects(*)')
        .eq('creative_id', data.id)
        .order('display_order', { ascending: true, nullsFirst: false });

      setProjects((links || []).map((link) => link.projects).filter((project) => project?.status === 'published'));
      setLoading(false);
    }
    loadCreative();
  }, [slug]);

  if (loading) return <div className="page-shell py-20"><LoadingState label="Loading creative" /></div>;
  if (error) return <div className="page-shell py-20"><p className="major-border-y py-8 text-zinc-300">{error}</p></div>;

  const skills = Array.isArray(creative.skills) ? creative.skills : [];
  const socialLinks = Array.isArray(creative.social_links) ? creative.social_links : [];

  return (
    <article className="page-shell py-20">
      <Link to="/creatives" className="fine-link site-hover-accent text-sm text-zinc-400">Back to creatives</Link>
      <div className="mt-10 grid gap-10 lg:grid-cols-[0.72fr_1fr]">
        <div>
          {creative.profile_image_url ? (
            <img src={creative.profile_image_url} alt={creative.name} decoding="async" fetchPriority="high" width="800" height="1000" className="aspect-[4/5] w-full rounded-lg bg-zinc-900 object-cover" />
          ) : (
            <div className="grid aspect-[4/5] place-items-center rounded-lg bg-zinc-900 text-5xl font-semibold text-zinc-600">{creative.name?.slice(0, 1)}</div>
          )}
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.22em]" style={{ color: content.accentColor }}>{creative.role}</p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: content.primaryTextColor }}>{creative.name}</h1>
          {creative.availability_status && <p className="mt-4 text-sm text-zinc-400">{creative.availability_status}</p>}
          <p className="mt-6 text-lg leading-8" style={{ color: content.secondaryTextColor }}>{creative.full_bio || creative.short_bio}</p>
          {skills.length > 0 && (
            <div className="major-border-y mt-8 flex flex-wrap gap-2 py-5">
              {skills.map((skill) => <span key={skill} className="rounded-full border border-white/10 px-3 py-1 text-sm text-zinc-300">{skill}</span>)}
            </div>
          )}
          {socialLinks.length > 0 && (
            <div className="mt-7 flex flex-wrap gap-3">
              {socialLinks.map((link) => (
                <a key={`${link.label}-${link.href}`} href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 border border-white/10 px-4 py-3 text-sm text-zinc-200 transition hover:border-[var(--site-accent)] hover:text-[var(--site-accent)]">
                  {link.label || 'Link'} <ExternalLink size={15} />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      <section className="major-border-top mt-16 pt-10">
        <h2 className="text-2xl font-medium" style={{ color: content.primaryTextColor }}>Related projects</h2>
        <div className="mt-8">
          {projects.length ? <ProjectGrid projects={projects} /> : <EmptyState title="No related projects yet" message="Assigned published projects will appear here." />}
        </div>
      </section>
    </article>
  );
}
