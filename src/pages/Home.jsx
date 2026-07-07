import { ArrowRight, Camera, Code2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import ProjectGrid from '../components/ProjectGrid';
import { usePublicContent } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';

const services = [
  ['Photography & Editing', Camera],
  ['Design & Content', Sparkles],
  ['Websites & Apps', Code2],
];

export default function Home() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const { content } = usePublicContent(['home']);
  const homeBg = content.home.heroBackgroundImageUrl || content.defaultBackgroundImageUrl;
  const overlayOpacity = content.home.heroBackgroundOverlayOpacity ?? content.defaultBackgroundOverlayOpacity ?? 0.55;
  const bgStyle = content.home.heroBackgroundStyle || 'none';

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
      <section className="relative overflow-hidden">
        {homeBg && (
          <>
            <div
              className={`absolute inset-0 bg-cover bg-no-repeat ${bgStyle === 'ambient-blur' ? 'scale-105' : ''}`}
              style={{
                backgroundImage: `url(${homeBg})`,
                backgroundPosition: content.home.heroBackgroundPosition || 'center',
                filter: bgStyle === 'ambient-blur' ? `blur(${content.home.heroBackgroundBlur || 14}px)` : undefined,
              }}
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-zinc-950" style={{ opacity: overlayOpacity }} aria-hidden="true" />
          </>
        )}
        {!homeBg && <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(120,113,108,0.12),transparent_45%),linear-gradient(180deg,#101012,#09090b)]" aria-hidden="true" />}
      <div className={`page-shell relative grid min-h-[calc(100vh-4rem)] items-center gap-10 py-16 ${bgStyle === 'split-image' ? 'lg:grid-cols-[0.95fr_1.05fr]' : 'lg:grid-cols-[1.05fr_0.95fr]'} lg:gap-14 lg:py-20`}>
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.28em]" style={{ color: content.home.accentTextColor || content.accentColor }}>{content.hero.eyebrow}</p>
          <h1 className="mt-5 text-4xl font-semibold leading-[0.95] sm:text-5xl lg:text-7xl" style={{ color: content.home.heroTitleColor || content.primaryTextColor }}>{content.home.heroTitle}</h1>
          <p className="mt-7 text-lg leading-8" style={{ color: content.home.heroDescriptionColor || content.secondaryTextColor }}>{content.home.heroDescription}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/projects" className="inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:opacity-90" style={{ backgroundColor: content.accentColor }}>
              {content.home.primaryCta} <ArrowRight size={18} />
            </Link>
            <Link to="/contact" className="fine-link rounded-full px-1 py-3 text-sm font-semibold" style={{ color: content.primaryTextColor }}>
              {content.home.secondaryCta}
            </Link>
          </div>
          <p className="mt-8 max-w-xl text-sm leading-6" style={{ color: content.mutedTextColor }}>{content.tagline}</p>
        </div>
        {content.heroImageUrl && (
          <div className="relative overflow-hidden rounded-[1.5rem] bg-zinc-900/70 shadow-[0_30px_80px_rgba(0,0,0,0.22)]">
            <img src={content.heroImageUrl} alt={content.heroImageAlt} className="aspect-[4/5] w-full object-cover" />
          </div>
        )}
      </div>
      </section>

      <section className="page-shell border-t border-white/[0.07] py-16">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em]" style={{ color: content.home.accentTextColor || content.accentColor }}>Featured work</p>
            <h2 className="mt-3 text-3xl font-semibold" style={{ color: content.home.sectionHeadingColor || content.primaryTextColor }}>{content.home.featuredHeading}</h2>
          </div>
          <Link to="/projects" className="fine-link hidden text-sm text-zinc-300 hover:text-amber-200 sm:inline">View all</Link>
        </div>
        {loading ? <LoadingState label="Loading featured projects" /> : projects.length ? <ProjectGrid projects={projects} /> : <EmptyState title="No featured projects yet" message="Publish and feature projects from the admin dashboard." />}
      </section>

      <section className="page-shell border-t border-white/[0.07] py-16">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.22em]" style={{ color: content.home.accentTextColor || content.accentColor }}>Services preview</p>
          <h2 className="mt-3 text-3xl font-semibold" style={{ color: content.home.sectionHeadingColor || content.primaryTextColor }}>{content.home.servicesHeading}</h2>
          <p className="mt-4 leading-7" style={{ color: content.secondaryTextColor }}>{content.home.servicesIntro}</p>
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
