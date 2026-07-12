import { ArrowRight, Camera, Circle, Code2, Sparkles, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import CreativeCard from '../components/CreativeCard';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import ProjectGrid from '../components/ProjectGrid';
import { resolvePublicAssetUrl, usePublicContent } from '../lib/contentApi';
import { createHeroBackgroundRender } from '../lib/heroBackground';
import { supabase } from '../lib/supabaseClient';
import { branchForKey, branchProjectsUrl, PROJECT_BRANCHES, projectBranchKey, projectsForBranch } from '../lib/projectBranches';
import { fairProjectExposure } from '../lib/fairProjectExposure';
import { fetchPublicProjectSummaries } from '../lib/publicProjectData';

const iconMap = { Camera, Circle, Code2, Sparkles, Wrench };

export default function Home() {
  const [projects, setProjects] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('studio');
  const [projectError, setProjectError] = useState('');
  const [creatives, setCreatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const { content } = usePublicContent(['home', 'services']);
  const homeBg = content.home.heroBackgroundImageUrl || content.defaultBackgroundImageUrl;
  const heroBackground = createHeroBackgroundRender({
    imageUrl: homeBg,
    position: content.home.heroBackgroundPosition || 'center',
    overlayOpacity: content.home.heroBackgroundOverlayOpacity ?? content.defaultBackgroundOverlayOpacity ?? 0.55,
    blur: content.home.heroBackgroundBlur || 14,
    mode: content.home.heroBackgroundStyle || 'none',
  });
  const showHeroPortrait = content.showHeroPortrait === true || content.show_hero_portrait === true;
  const hasPortrait = Boolean(content.heroImageUrl && showHeroPortrait);
  const servicePreview = (content.servicesPage?.groups || []).slice(0, 3);
  const projectLimit = 6;
  const selectedBranchInfo = branchForKey(selectedBranch) || PROJECT_BRANCHES[0];
  const visibleProjects = useMemo(() => fairProjectExposure(projectsForBranch(projects, selectedBranch), projectLimit), [projectLimit, projects, selectedBranch]);

  useEffect(() => {
    async function loadFeatured() {
      const [projectResult, { data: creativeRows }] = await Promise.allSettled([
        fetchPublicProjectSummaries(),
        supabase
          .from('creative_members')
          .select('id, name, slug, role, short_bio, profile_image_url, skills, is_featured')
          .eq('is_published', true)
          .eq('is_featured', true)
          .order('display_order', { ascending: true, nullsFirst: false })
          .limit(3),
      ]).then((results) => [results[0], results[1].status === 'fulfilled' ? results[1].value : { data: [] }]);

      if (projectResult.status === 'fulfilled') {
        const rows = projectResult.value || [];
        setProjects(rows);
        if (!rows.some((project) => projectBranchKey(project.category) === 'studio')) {
          const firstAvailable = PROJECT_BRANCHES.find((branch) => rows.some((project) => projectBranchKey(project.category) === branch.key));
          if (firstAvailable) setSelectedBranch(firstAvailable.key);
        }
      } else setProjectError('Projects could not be loaded right now.');
      setCreatives(creativeRows || []);
      setLoading(false);
    }
    loadFeatured();
  }, []);

  return (
    <div>
      <section className="relative overflow-hidden">
        {homeBg && (
          <>
            <div className={`absolute inset-0 ${heroBackground.mode === 'ambient-blur' ? 'scale-105' : ''}`} style={heroBackground.style} aria-hidden="true" />
            <div className="absolute inset-0 bg-zinc-950" style={{ opacity: heroBackground.overlayOpacity }} aria-hidden="true" />
          </>
        )}
        {!homeBg && <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(120,113,108,0.12),transparent_45%),linear-gradient(180deg,#101012,#09090b)]" aria-hidden="true" />}
      <div className={`page-shell relative grid min-h-[calc(100vh-4rem)] items-center gap-10 py-16 ${hasPortrait ? (heroBackground.mode === 'split-image' ? 'lg:grid-cols-[0.95fr_1.05fr]' : 'lg:grid-cols-[1.1fr_0.7fr]') : 'lg:grid-cols-1'} lg:gap-14 lg:py-20`}>
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.28em]" style={{ color: content.home.accentTextColor || content.accentColor }}>{content.home.heroEyebrow || content.hero.eyebrow}</p>
          <h1 className="mt-5 text-4xl font-semibold leading-[0.95] sm:text-5xl lg:text-7xl" style={{ color: content.home.heroTitleColor || content.primaryTextColor }}>{content.home.heroTitle}</h1>
          <p className="mt-7 text-lg leading-8" style={{ color: content.home.heroDescriptionColor || content.secondaryTextColor }}>{content.home.heroDescription || 'A creative digital collective building visuals, stories, and digital experiences across photography, editing, social media, content, and web projects.'}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/start-a-project" className="inline-flex items-center gap-2 rounded-md px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:opacity-90" style={{ backgroundColor: content.accentColor }}>
              Start a Project <ArrowRight size={18} />
            </Link>
            <Link to="/projects" className="fine-link px-1 py-3 text-sm font-semibold" style={{ color: content.primaryTextColor }}>
              Explore Works
            </Link>
          </div>
          <p className="mt-8 max-w-xl text-sm leading-6" style={{ color: content.mutedTextColor }}>{content.tagline}</p>
        </div>
        {hasPortrait && (
          <div className="relative mx-auto w-full max-w-sm overflow-hidden bg-zinc-900/70 shadow-[0_24px_60px_rgba(0,0,0,0.2)] lg:ml-auto">
            <img src={content.heroImageUrl} alt={content.heroImageAlt} decoding="async" fetchpriority="high" width="800" height="1000" className="aspect-[4/5] w-full object-cover" />
          </div>
        )}
      </div>
      </section>

      <section className="page-shell major-border-top py-16" aria-labelledby="selected-work-heading">
        <div className="mb-8 max-w-2xl">
          <div>
            <p className="text-xs uppercase tracking-[0.22em]" style={{ color: content.home.accentTextColor || content.accentColor }}>Selected work</p>
            <h2 id="selected-work-heading" className="mt-3 text-3xl font-semibold" style={{ color: content.home.sectionHeadingColor || content.primaryTextColor }}>{content.home.featuredHeading}</h2>
            <p className="mt-4 leading-7" style={{ color: content.secondaryTextColor }}>Explore projects across the four branches of Lahat Liwa.</p>
          </div>
        </div>
        <div className="mb-10 grid grid-cols-2 border-y border-white/[0.08] sm:grid-cols-4" role="tablist" aria-label="Project branches">
          {PROJECT_BRANCHES.map((branch) => {
            const active = selectedBranch === branch.key;
            return <button key={branch.key} type="button" role="tab" aria-selected={active} onClick={() => setSelectedBranch(branch.key)} className={`min-w-0 border-b px-2 py-4 text-left transition sm:px-4 ${active ? 'border-[var(--site-accent)] text-white' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}><span className="block text-sm font-medium">{branch.label}</span><span className="mt-1 hidden text-xs leading-5 text-zinc-600 lg:block">{branch.description}</span></button>;
          })}
        </div>
        {loading ? <LoadingState label="Loading projects" /> : projectError ? <p className="border-y border-red-400/20 py-6 text-sm text-red-100">{projectError}</p> : visibleProjects.length ? <ProjectGrid projects={visibleProjects} /> : <EmptyState title="Projects for this branch are being prepared." message="Explore another branch or view all current work." />}
        <Link to={branchProjectsUrl(selectedBranch)} className="fine-link site-hover-accent mt-9 inline-flex items-center gap-2 text-sm text-zinc-300">View all {selectedBranchInfo.label} projects <ArrowRight size={16} /></Link>
      </section>

      <section className="page-shell major-border-top py-16">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em]" style={{ color: content.home.accentTextColor || content.accentColor }}>Featured creatives</p>
            <h2 className="mt-3 text-3xl font-semibold" style={{ color: content.home.sectionHeadingColor || content.primaryTextColor }}>Meet the people behind the work.</h2>
          </div>
          <Link to="/creatives" className="fine-link site-hover-accent text-sm text-zinc-300">View creatives</Link>
        </div>
        {loading ? <LoadingState label="Loading creatives" /> : creatives.length ? (
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {creatives.map((creative) => <CreativeCard key={creative.id} creative={creative} />)}
          </div>
        ) : <EmptyState title="No featured creatives yet" message="Publish and feature creative members from the admin dashboard." />}
      </section>

      <section className="page-shell major-border-top py-16">
        <div className="mb-10 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.22em]" style={{ color: content.home.accentTextColor || content.accentColor }}>Services preview</p>
          <h2 className="mt-3 text-3xl font-semibold" style={{ color: content.home.sectionHeadingColor || content.primaryTextColor }}>{content.home.servicesHeading}</h2>
          <p className="mt-4 leading-7" style={{ color: content.secondaryTextColor }}>{content.home.servicesIntro}</p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          {servicePreview.map((group) => {
            const Icon = iconMap[group.iconName] || Circle;
            const serviceLogoUrl = resolvePublicAssetUrl(group.serviceLogoUrl);
            const iconUrl = resolvePublicAssetUrl(group.customIconUrl || group.iconUrl);
            return (
            <div key={group.name} className="major-border-top pt-5">
              <div className="flex min-h-10 items-center gap-0.5">
                {serviceLogoUrl && <img src={serviceLogoUrl} alt={`${group.name} logo`} loading="lazy" decoding="async" width="80" height="28" className="h-7 max-w-20 object-contain" />}
                {iconUrl ? <img src={iconUrl} alt="" loading="lazy" decoding="async" width="40" height="40" className="h-10 w-10 object-contain" /> : (group.iconName && <Icon style={{ color: content.servicesPage.iconColor || content.accentColor }} size={40} />)}
              </div>
              <h3 className="mt-5 text-lg font-medium" style={{ color: content.primaryTextColor }}>{group.name}</h3>
              <p className="mt-2 text-sm leading-6" style={{ color: content.secondaryTextColor }}>{group.description || 'Clean, useful work for school, brands, creators, events, and small teams.'}</p>
            </div>
          );})}
        </div>
      </section>

      <section className="page-shell major-border-top py-16">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.22em]" style={{ color: content.home.accentTextColor || content.accentColor }}>Start a project</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold" style={{ color: content.home.sectionHeadingColor || content.primaryTextColor }}>Need visuals, content, a website, or digital support?</h2>
            <p className="mt-4 max-w-2xl leading-7" style={{ color: content.secondaryTextColor }}>Tell the collective what you are planning and we will review the best next step.</p>
          </div>
          <Link to="/start-a-project" className="inline-flex w-fit items-center gap-2 rounded-md px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:opacity-90" style={{ backgroundColor: content.accentColor }}>
            Send inquiry <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
