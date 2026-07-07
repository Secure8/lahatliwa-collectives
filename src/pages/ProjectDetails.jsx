import { ArrowUpRight, Calendar, Github, Play, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import LoadingState from '../components/LoadingState';
import { formatDate } from '../lib/helpers';
import { supabase } from '../lib/supabaseClient';
import { getPublicImageUrl } from '../lib/storage';

export default function ProjectDetails() {
  const { slug } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
  if (error) return <div className="page-shell py-20"><p className="border-y border-white/[0.07] py-8 text-zinc-300">{error}</p></div>;

  const cover = getPublicImageUrl(project.cover_image);
  const gallery = (project.gallery_images || []).map(getPublicImageUrl).filter(Boolean);

  return (
    <article className="page-shell py-20">
      <Link to="/projects" className="fine-link text-sm text-zinc-400 hover:text-amber-200">Back to projects</Link>
      <div className="mt-10 grid gap-10 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-zinc-900">
          {cover ? <img className="aspect-[4/3] h-full w-full object-cover" src={cover} alt={project.title} /> : <div className="editorial-image aspect-[4/3] w-full" aria-hidden="true" />}
        </div>
        <div>
          <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.18em] text-zinc-500">
            <span>{project.category}</span>
            {project.featured && <span className="text-amber-200/80">Selected</span>}
          </div>
          <h1 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">{project.title}</h1>
          <p className="mt-5 text-lg leading-8 text-zinc-300">{project.description}</p>
          <p className="mt-5 inline-flex items-center gap-2 text-sm text-zinc-400"><Calendar size={16} /> {formatDate(project.project_date)}</p>
          {project.tools?.length > 0 && (
            <div className="mt-7 flex flex-wrap gap-x-4 gap-y-2 border-y border-white/[0.07] py-5">
              {project.tools.map((tool) => <span key={tool} className="text-sm text-zinc-300">{tool}</span>)}
            </div>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <Action href={project.video_url} icon={Play} label="Watch Video" />
            <Action href={project.social_post_url} icon={Share2} label="View Post" />
            <Action href={project.live_url} icon={ArrowUpRight} label="Live Project" />
            <Action href={project.github_url} icon={Github} label="GitHub" />
          </div>
        </div>
      </div>

      {gallery.length > 0 && (
        <section className="mt-16 border-t border-white/[0.07] pt-10">
          <h2 className="text-2xl font-medium">Gallery</h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((image) => <img key={image} className="aspect-[4/3] object-cover" src={image} alt={`${project.title} gallery`} />)}
          </div>
        </section>
      )}
    </article>
  );
}

function Action({ href, icon: Icon, label }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 border border-white/10 px-4 py-3 text-sm text-zinc-200 transition hover:border-amber-300/60 hover:text-amber-200">
      <Icon size={17} /> {label}
    </a>
  );
}
