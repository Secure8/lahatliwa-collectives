import { Aperture, ArrowRight, Camera, Circle, Code2, Cpu, MessagesSquare, PanelsTopLeft, Sparkles, Wrench } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import ProjectGrid from '../components/ProjectGrid';
import CreativeCard from '../components/CreativeCard';
import { AccentEyebrow } from '../components/PublicPageHeader';
import BrandWordmark from '../components/BrandWordmark';
import { resolvePublicAssetUrl, usePublicContent } from '../lib/contentApi';
import { createHeroBackgroundRender } from '../lib/heroBackground';
import { branchForKey, branchProjectsUrl, normalizeBranchQuery, PROJECT_BRANCHES, projectBranchKey, projectsForBranch } from '../lib/projectBranches';
import { fetchPublicProjectSummaries, readCachedPublicProjectSummaries } from '../lib/publicProjectData';
import { scrollPreservingNavigationState, shouldPushFilter } from '../lib/navigationHistory';
import { isBrandWordmarkText } from '../lib/brandWordmark';
import { defaultSiteContent } from '../data/siteContent';
import { homeCtaPath } from '../lib/homeCta';
import { supabase } from '../lib/supabaseClient';
import { fairProjectExposure } from '../lib/fairProjectExposure';
import { branchKeyFromRecord, branchMeta, publicBranchDescription, servicesPath } from '../lib/serviceRequest';
import useHorizontalScrollRestoration from '../lib/useHorizontalScrollRestoration';

const iconMap = { Camera, Circle, Code2, Sparkles, Wrench };
const branchIconMap = { studio: Aperture, digital: PanelsTopLeft, tech: Cpu, social: MessagesSquare };
const branchCueMap = { studio: 'Visual', digital: 'Build', tech: 'Systems', social: 'Reach' };
const TourismHomepageSections = lazy(() => import('./tourism/TourismHomepageSections.jsx'));

export default function Home() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [projects, setProjects] = useState(() => readCachedPublicProjectSummaries() || []);
  const [projectError, setProjectError] = useState('');
  const [creatives, setCreatives] = useState([]);
  const [loading, setLoading] = useState(true);
  const { content } = usePublicContent(['home']);
  const selectedBranch = normalizeBranchQuery(searchParams.get('branch'), 'studio');
  const projectLimit = 6;
  const visibleProjects = useMemo(() => fairProjectExposure(projectsForBranch(projects, selectedBranch), projectLimit), [projectLimit, projects, selectedBranch]);
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
  const heroIsBrandWordmark = isBrandWordmarkText(content.home.heroTitle, content.displayName, [defaultSiteContent.displayName, defaultSiteContent.legalName]);
  const primaryCtaLabel = content.home.primaryCta || 'Send an Inquiry';
  const secondaryCtaLabel = content.home.secondaryCta || 'Explore Published Work';
  const servicePreview = (content.servicesPage?.groups || []).slice(0, 3);
  const selectedBranchInfo = branchForKey(selectedBranch) || PROJECT_BRANCHES[0];
  const projectRailRef = useHorizontalScrollRestoration('home-featured-projects');
  const creativeRailRef = useHorizontalScrollRestoration('home-featured-creatives');

  useEffect(() => {
    let active = true;
    async function loadFeatured() {
      try {
        const [rows, { data: creativeRows }] = await Promise.all([
          fetchPublicProjectSummaries(),
          supabase
            .from('creative_members')
            .select('id, name, slug, role, short_bio, profile_image_url, skills, is_featured')
            .eq('is_published', true)
            .eq('is_featured', true)
            .order('display_order', { ascending: true, nullsFirst: false })
            .limit(3),
        ]);
        if (!active) return;
        setProjects(rows || []);
        if (!(rows || []).some((project) => projectBranchKey(project.category) === 'studio')) {
          const firstAvailable = PROJECT_BRANCHES.find((branch) => (rows || []).some((project) => projectBranchKey(project.category) === branch.key));
          if (firstAvailable && !searchParams.has('branch')) setSearchParams({ branch: firstAvailable.key }, { replace: true, state: scrollPreservingNavigationState('home-projects', window.scrollY) });
        }
        setCreatives(creativeRows || []);
      } catch {
        if (active) setProjectError('Published work could not be loaded right now.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadFeatured();
    return () => { active = false; };
  }, []);

  function selectBranch(branchKey) {
    if (!shouldPushFilter(selectedBranch, branchKey)) return;
    const next = new URLSearchParams(searchParams);
    next.set('branch', branchKey);
    setSearchParams(next, { state: scrollPreservingNavigationState('home-projects', window.scrollY) });
  }

  return (
    <div className="public-home-app bg-[var(--theme-page-surface)]">
      <section className="theme-inverse relative overflow-hidden">
        {homeBg && (
          <>
            <div className={`hero-background-visual absolute inset-0 ${heroBackground.mode === 'ambient-blur' ? 'lg:scale-105' : ''}`} style={{ ...heroBackground.style, filter: undefined, transform: undefined, '--hero-background-blur': heroBackground.mode === 'ambient-blur' ? `blur(${content.home.heroBackgroundBlur || 14}px)` : 'none' }} aria-hidden="true" />
            <div className="hero-background-overlay absolute inset-0" style={heroBackground.overlayStyle} aria-hidden="true" />
          </>
        )}
        {!homeBg && <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(120,113,108,0.12),transparent_45%),linear-gradient(180deg,#101012,#09090b)]" aria-hidden="true" />}
        <div className={`page-shell relative grid min-h-[calc(100vh-4rem)] items-center gap-10 py-16 ${hasPortrait ? (heroBackground.mode === 'split-image' ? 'lg:grid-cols-[0.95fr_1.05fr]' : 'lg:grid-cols-[1.1fr_0.7fr]') : 'lg:grid-cols-1'} lg:gap-14 lg:py-20`}>
          <div className="max-w-2xl">
            <AccentEyebrow color={content.home.accentTextColor || content.accentColor} preserveColor>{content.home.heroEyebrow || content.hero.eyebrow}</AccentEyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[0.95] sm:text-5xl lg:text-7xl" style={{ color: content.home.heroTitleColor || content.primaryTextColor }}>{heroIsBrandWordmark ? <BrandWordmark name={content.home.heroTitle} variant="hero" /> : content.home.heroTitle}</h1>
            <p className="home-hero-description mt-7 text-lg leading-8" style={{ color: content.home.heroDescriptionColor || content.secondaryTextColor }}>{content.home.heroDescription || 'Find focused support across visual production, digital development, social media, and technical needs—or explore the creatives and work published through the platform.'}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={homeCtaPath(primaryCtaLabel, '/inquiry')} className="inline-flex min-h-11 items-center gap-2 px-5 text-sm font-semibold text-zinc-950 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ backgroundColor: content.accentColor }}>{primaryCtaLabel} <ArrowRight size={18} /></Link>
              <Link to={homeCtaPath(secondaryCtaLabel, '/projects')} className="fine-link px-1 py-3 text-sm font-semibold" style={{ color: content.primaryTextColor }}>{secondaryCtaLabel}</Link>
            </div>
            <p className="mt-8 max-w-xl text-sm leading-6" style={{ color: content.mutedTextColor }}>{content.tagline}</p>
          </div>
          {hasPortrait && <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-[10px] border border-white/10 bg-zinc-900/70 shadow-[0_24px_60px_rgba(0,0,0,0.2)] lg:ml-auto"><img src={content.heroImageUrl} alt={content.heroImageAlt} decoding="async" fetchpriority="high" sizes="384px" width="800" height="1000" className="aspect-[4/5] w-full object-cover" /></div>}
        </div>
      </section>

      <section className="home-mobile-branches page-shell py-10 lg:hidden" aria-labelledby="mobile-branch-heading">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs uppercase tracking-[0.2em] text-[var(--site-accent-text)]">Service branches</p><h2 id="mobile-branch-heading" className="mt-2 text-2xl font-semibold">Choose a starting point.</h2></div><Link to="/services" className="fine-link inline-flex min-h-11 shrink-0 items-center text-sm text-zinc-400">View all</Link></div>
        <div className="mt-5 grid grid-cols-2 gap-2">
          {PROJECT_BRANCHES.map((branch) => <Link key={branch.key} to={servicesPath(branch.key)} className="flex min-h-16 items-center justify-between gap-2 rounded-xl border border-white/[0.09] bg-white/[0.025] px-3 py-3 text-sm font-medium text-zinc-200 transition hover:border-orange-300/40 hover:text-orange-200"><span>{branch.label}</span><ArrowRight size={15} aria-hidden="true" /></Link>)}
        </div>
      </section>

      <section id="selected-work" className="page-shell scroll-mt-20 py-16" aria-labelledby="selected-work-heading">
        <div className="mb-8 max-w-2xl">
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--site-accent-text)]">Selected work</p>
          <h2 id="selected-work-heading" className="mt-3 text-3xl font-semibold text-[var(--site-primary-text)]">{content.home.featuredHeading}</h2>
          <p className="home-section-intro mt-4 leading-7 text-[var(--site-secondary-text)]">Explore complete project records, visible outputs, and contributor credits across the four Liwa branches.</p>
        </div>
        <div className="home-branch-tabs mb-10 grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Project branches">
          {PROJECT_BRANCHES.map((branch) => {
            const active = selectedBranch === branch.key;
            const Icon = branchIconMap[branch.key] || Circle;
            return <button key={branch.key} id={`home-branch-tab-${branch.key}`} type="button" role="tab" aria-selected={active} aria-controls="home-project-results" onClick={() => selectBranch(branch.key)} className="home-branch-tab group min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><span className="flex items-center justify-between gap-2"><span className="home-branch-tab-icon grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon size={18} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" /></span><span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">{branchCueMap[branch.key]}</span></span><span className="mt-3 block text-sm font-semibold text-[var(--site-primary-text)]">{branch.label}</span><span className="mt-1 block text-xs leading-5 text-[var(--site-secondary-text)]">{branch.description}</span></button>;
          })}
        </div>
        <div id="home-project-results" role="tabpanel" aria-labelledby={`home-branch-tab-${selectedBranch}`} className="min-h-[28rem]">{loading && !projects.length ? <LoadingState label="Loading projects" /> : projectError && !projects.length ? <p className="border-y border-red-400/20 py-6 text-sm text-red-100">{projectError}</p> : visibleProjects.length ? <ProjectGrid projects={visibleProjects} className="home-project-grid" containerRef={projectRailRef} scrollRestorationId="home-featured-projects" /> : <EmptyState title="Projects for this branch are being prepared." message="Explore another branch or view all current work." />}</div>
        <Link to={branchProjectsUrl(selectedBranch)} aria-label={`View all ${selectedBranchInfo.label} projects`} className="fine-link site-hover-accent mt-9 inline-flex min-h-11 items-center gap-2 text-sm text-zinc-300">View all <ArrowRight size={16} /></Link>
      </section>

      <section className="page-shell py-16">
        <div className="mb-10 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs uppercase tracking-[0.22em] text-[var(--site-accent-text)]">Featured creatives</p><h2 className="mt-3 text-3xl font-semibold text-[var(--site-primary-text)]">Discover published creatives and their work.</h2></div><Link to="/creatives" className="fine-link site-hover-accent inline-flex min-h-11 items-center text-sm text-zinc-300">View all</Link></div>
        {loading && !creatives.length ? <LoadingState label="Loading creatives" /> : creatives.length ? <div ref={creativeRailRef} data-scroll-restoration-id="home-featured-creatives" className="home-creatives-grid grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">{creatives.map((creative) => <CreativeCard key={creative.id} creative={creative} />)}</div> : <EmptyState title="No featured creative profiles yet" message="Explore the full directory for currently published profiles." />}
      </section>

      <Suspense fallback={null}><TourismHomepageSections /></Suspense>

      <section className="home-full-services page-shell hidden py-16 lg:block">
        <div className="mb-10 max-w-2xl"><p className="text-xs uppercase tracking-[0.22em] text-[var(--site-accent-text)]">Services preview</p><h2 className="mt-3 text-3xl font-semibold text-[var(--site-primary-text)]">{content.home.servicesHeading}</h2><p className="mt-4 leading-7 text-[var(--site-secondary-text)]">{content.home.servicesIntro}</p></div>
        <div className="grid grid-cols-3 gap-8">{servicePreview.map((group) => { const Icon = iconMap[group.iconName] || Circle; const serviceLogoUrl = resolvePublicAssetUrl(group.serviceLogoUrl); const iconUrl = resolvePublicAssetUrl(group.customIconUrl || group.iconUrl); const branchKey = branchKeyFromRecord(group); const broadBranch = branchMeta(branchKey); const description = broadBranch ? publicBranchDescription(branchKey, group.description) : group.description; return <div key={group.name} className="pt-5"><div className="flex min-h-10 items-center gap-0.5">{serviceLogoUrl && <img src={serviceLogoUrl} alt={`${group.name} logo`} loading="lazy" decoding="async" width="80" height="28" className="h-7 max-w-20 object-contain" />}{iconUrl ? <img src={iconUrl} alt="" loading="lazy" decoding="async" width="40" height="40" className="h-10 w-10 object-contain" /> : (group.iconName && <Icon className="text-[var(--site-accent-text)]" size={40} />)}</div><h3 className="mt-5 text-lg font-medium text-[var(--site-primary-text)]">{group.name}</h3><p className="mt-2 text-sm leading-6 text-[var(--site-secondary-text)]">{description || 'Flexible support shaped around the client’s goals and requirements.'}</p></div>; })}</div>
      </section>

      <section className="page-shell py-16">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="text-xs uppercase tracking-[0.22em] text-[var(--site-accent-text)]">Start a project</p><h2 className="mt-3 max-w-2xl text-3xl font-semibold text-[var(--site-primary-text)]">Need creative, digital, social, or technical support?</h2><p className="mt-4 max-w-2xl leading-7 text-[var(--site-secondary-text)]">Describe what you need, share the context that matters, and begin a review before any timing, pricing, or availability is confirmed.</p></div><Link to="/inquiry" className="inline-flex min-h-11 w-fit items-center gap-2 bg-[var(--site-accent)] px-5 text-sm font-semibold text-zinc-950 transition hover:bg-[var(--site-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Inquire <ArrowRight size={18} /></Link></div>
      </section>
    </div>
  );
}
