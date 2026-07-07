import { ArrowRight, Camera, Code2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import ProjectGrid from '../components/ProjectGrid';
import { siteContent } from '../data/siteContent';
import { supabase } from '../lib/supabaseClient';

const services = [
  ['Photography & Editing', Camera],
  ['Design & Content', Sparkles],
  ['Websites & Apps', Code2],
];

export default function Home() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFeatured() {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('status', 'published')
        .eq('featured', true)
        .order('project_date', { ascending: false, nullsFirst: false })
        .limit(3);

      if (!error) setProjects(data || []);
      setLoading(false);
    }
    loadFeatured();
  }, []);

  return (
    <div>
      <section className="page-shell grid min-h-[calc(100vh-4rem)] items-center gap-10 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-amber-200/80">{siteContent.hero.eyebrow}</p>
          <h1 className="mt-5 text-4xl font-semibold leading-[0.95] text-white sm:text-5xl lg:text-7xl">{siteContent.hero.title}</h1>
          <p className="mt-7 text-lg leading-8 text-zinc-300">{siteContent.hero.description}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/projects" className="inline-flex items-center gap-2 rounded-full bg-amber-200 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-100">
              {siteContent.hero.primaryCta} <ArrowRight size={18} />
            </Link>
            <Link to="/contact" className="fine-link rounded-full px-1 py-3 text-sm font-semibold text-white">
              {siteContent.hero.secondaryCta}
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            {['Photography', 'Digital builds', 'Personal branding'].map((item) => (
              <span key={item} className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] bg-zinc-900/70 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.25)] sm:p-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.2),transparent_42%)]" />
          <div className="relative overflow-hidden rounded-[1.5rem] border border-white/[0.06] bg-zinc-950/70">
            <img
              src="/images/profile.jpg"
              alt="Jevin Coching"
              className="aspect-[4/5] w-full object-cover"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
                event.currentTarget.parentElement?.querySelector('[data-fallback]')?.classList.remove('hidden');
              }}
            />
            <div data-fallback className="hidden flex aspect-[4/5] items-center justify-center bg-zinc-900 p-6 text-center text-sm leading-7 text-zinc-300">
              Add your personal photo as <span className="ml-1 font-semibold text-white">/public/images/profile.jpg</span>
            </div>
          </div>
        </div>
      </section>

      <section className="page-shell border-t border-white/[0.07] py-16">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-amber-200/80">Featured work</p>
            <h2 className="mt-3 text-3xl font-semibold text-white">Selected Projects</h2>
          </div>
          <Link to="/projects" className="fine-link hidden text-sm text-zinc-300 hover:text-amber-200 sm:inline">View all</Link>
        </div>
        {loading ? <LoadingState label="Loading featured projects" /> : projects.length ? <ProjectGrid projects={projects} /> : <EmptyState title="No featured projects yet" message="Publish and feature projects from the admin dashboard." />}
      </section>

      <section className="page-shell border-t border-white/[0.07] py-16">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.22em] text-amber-200/80">Services preview</p>
          <h2 className="mt-3 text-3xl font-semibold text-white">Creative and digital support</h2>
          <p className="mt-4 leading-7 text-zinc-400">{siteContent.servicesIntro}</p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {services.map(([label, Icon]) => (
            <div key={label} className="border-t border-white/[0.09] pt-5">
              <Icon className="text-amber-200" size={26} />
              <h3 className="mt-5 text-lg font-medium">{label}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">Clean, useful work for school, brands, creators, events, and small teams.</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
