import { ArrowUpRight, Calendar, FileText, Github, Play, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import LoadingState from '../components/LoadingState';
import { formatDate } from '../lib/helpers';
import { usePublicContent } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';
import { getPublicImageUrl, isPdfFile } from '../lib/storage';

export default function ProjectDetails() {
  const { slug } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { content } = usePublicContent([]);

  useEffect(() => {
    async function loadProject() {
      const { data, error: projectError } = await supabase.from('projects').select('*').eq('slug', slug).eq('status', 'published').single();
      if (projectError) setError('Project not found or not published yet.');
      else setProject(data);
      setLoading(false);
    }
    loadProject();
  }, [slug]);

  if (loading) return <div className="page-shell py-20"><LoadingState label="Loading project" /></div>;
  if (error) return <div className="page-shell py-20"><p className="major-border-y py-8 text-zinc-300">{error}</p></div>;

  const cover = getPublicImageUrl(project.cover_image);
  const gallery = (project.gallery_images || []).map((path) => ({ path, url: getPublicImageUrl(path) })).filter((item) => item.url);

  return (
    <article className="page-shell py-20">
      <Link to="/projects" className="fine-link site-hover-accent text-sm text-zinc-400">Back to projects</Link>
      <div className={`mt-10 grid gap-10 ${cover ? 'lg:grid-cols-[0.92fr_1.08fr]' : 'lg:grid-cols-1'}`}>
        {cover && (
          <div className="overflow-hidden rounded-[1.5rem] bg-zinc-900">
            <img className="aspect-[4/3] h-full w-full object-cover" src={cover} alt={project.title} />
          </div>
        )}
        <div>
          <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.18em] text-zinc-500">
            <span>{project.category}</span>
            {project.featured && <span style={{ color: content.accentColor }}>Selected</span>}
          </div>
          <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: content.primaryTextColor }}>{project.title}</h1>
          <p className="mt-5 text-lg leading-8" style={{ color: content.secondaryTextColor }}>{project.description}</p>
          <p className="mt-5 inline-flex items-center gap-2 text-sm" style={{ color: content.mutedTextColor }}><Calendar size={16} /> {formatDate(project.project_date)}</p>
          {project.tools?.length > 0 && (
            <div className="major-border-y mt-7 flex flex-wrap gap-x-4 gap-y-2 py-5">
              {project.tools.map((tool) => <span key={tool} className="text-sm" style={{ color: content.secondaryTextColor }}>{tool}</span>)}
            </div>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <Action href={project.video_url} icon={Play} label="Watch Video" accentColor={content.accentColor} />
            <Action href={project.social_post_url} icon={Share2} label="View Post" accentColor={content.accentColor} />
            <Action href={project.live_url} icon={ArrowUpRight} label="Live Project" accentColor={content.accentColor} />
            <Action href={project.github_url} icon={Github} label="GitHub" accentColor={content.accentColor} />
          </div>
        </div>
      </div>

      {gallery.length > 0 && (
        <section className="major-border-top mt-16 pt-10">
          <h2 className="text-2xl font-medium" style={{ color: content.primaryTextColor }}>Gallery</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((item) => (
              isPdfFile(item.path)
                ? (
                  <a key={item.path} href={item.url} target="_blank" rel="noreferrer" className="flex aspect-[4/3] items-center justify-center gap-3 border border-white/10 bg-zinc-900/70 text-zinc-200 transition hover:border-[var(--site-accent)] hover:text-[var(--site-accent)]">
                    <FileText size={22} /> Open PDF
                  </a>
                )
                : <img key={item.path} className="aspect-[4/3] object-cover" src={item.url} alt={`${project.title} gallery`} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function Action({ href, icon: Icon, label, accentColor }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border px-4 py-3 text-sm text-zinc-200 transition hover:opacity-80" style={{ borderColor: `${accentColor}55`, color: accentColor }}>
      <Icon size={17} /> {label}
    </a>
  );
}
