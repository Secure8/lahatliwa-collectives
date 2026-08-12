import { ArrowLeft, ArrowRight, CalendarDays, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { latestProjectUpdate } from '../lib/projectProgress';
import { publicImageVariant } from '../lib/publicImages';
import { getPublicImageUrl } from '../lib/storage';

const AUTOPLAY_MS = 6000;

const step = (index, length, direction) => length ? (index + direction + length) % length : 0;

export default function ActiveWorkHero({ projects = [], loading = false, page = {}, brandName = 'Lahat Liwa Collectives' }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoplayPaused, setAutoplayPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef(null);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(projects.length - 1, 0)));
  }, [projects.length]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible');
    updateMotion();
    updateVisibility();
    media.addEventListener?.('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      media.removeEventListener?.('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (autoplayPaused || !pageVisible || reducedMotion || projects.length < 2) return undefined;
    const timer = window.setTimeout(() => setActiveIndex((current) => step(current, projects.length, 1)), AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, autoplayPaused, pageVisible, projects.length, reducedMotion]);

  useEffect(() => {
    if (projects.length < 2) return;
    const nextProject = projects[step(activeIndex, projects.length, 1)];
    const nextCover = publicImageVariant(getPublicImageUrl(nextProject?.cover_image), 'expanded');
    if (nextCover) {
      const image = new Image();
      image.src = nextCover;
    }
  }, [activeIndex, projects]);

  const active = projects[activeIndex] || null;
  const update = active ? latestProjectUpdate(active) : null;
  const cover = active ? publicImageVariant(getPublicImageUrl(active.cover_image), 'expanded') : '';

  function move(direction) {
    setActiveIndex((current) => step(current, projects.length, direction));
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
  }

  function finishSwipe(clientX) {
    if (touchStart.current == null) return;
    const distance = clientX - touchStart.current;
    touchStart.current = null;
    if (Math.abs(distance) >= 48) move(distance < 0 ? 1 : -1);
  }

  return <section
    className="theme-inverse relative isolate min-h-[74svh] overflow-hidden bg-zinc-950 text-white"
    aria-roledescription={projects.length > 1 ? 'carousel' : undefined}
    aria-label="Current active projects"
    tabIndex={projects.length > 1 ? 0 : undefined}
    onKeyDown={handleKeyDown}
    onPointerDown={(event) => { if (event.pointerType === 'touch') touchStart.current = event.clientX; }}
    onPointerUp={(event) => { if (event.pointerType === 'touch') finishSwipe(event.clientX); }}
    onPointerCancel={() => { touchStart.current = null; }}
  >
    <div aria-hidden="true" className="absolute inset-0 -z-30 bg-[radial-gradient(circle_at_78%_24%,rgba(251,146,60,0.2),transparent_30%),linear-gradient(145deg,#27201b,#09090b_65%)]" />
    {cover && <img key={`${active?.id}-${cover}`} src={cover} alt="" className="active-work-hero-image absolute inset-0 -z-20 h-full w-full object-cover" fetchpriority="high" decoding="async" />}
    <div aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(8,8,10,0.9)_0%,rgba(8,8,10,0.68)_50%,rgba(8,8,10,0.28)_100%),linear-gradient(0deg,rgba(8,8,10,0.82)_0%,transparent_68%)]" />

    <div className="page-shell relative flex min-h-[74svh] items-end pb-24 pt-28 sm:pb-28 lg:items-center">
      <div className="max-w-4xl">
        <p className="public-eyebrow">{page.heroEyebrow || 'Aklan-based creative work platform'}</p>
        <h1 className="mt-5 text-4xl font-semibold leading-[0.98] tracking-[-0.04em] sm:text-6xl lg:text-7xl">{page.heroTitle || 'Creative work, shared from first progress to finished portfolio.'}</h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-zinc-200 sm:text-lg">{page.heroDescription || `${brandName} documents active client work, content, event coverage, and digital projects—then preserves completed work with clear contributor credit.`}</p>

        {active ? <div className="mt-8 max-w-2xl border-l-2 border-[var(--site-accent)] pl-5">
          <p className="public-eyebrow">Currently working on</p>
          <h2 className="mt-2 text-xl font-semibold sm:text-2xl">{active.title}</h2>
          {update && <p className="mt-2 inline-flex items-center gap-2 text-sm text-zinc-300"><CalendarDays size={15} />{update.title}</p>}
          <Link to={`/projects/${active.slug}`} className="mt-4 inline-flex min-h-11 items-center gap-2 border-b border-white/25 text-sm font-medium text-white transition hover:border-orange-300 hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Open this project <ArrowRight size={16} /></Link>
        </div> : loading ? <p className="mt-8 text-sm text-zinc-400">Loading current work…</p> : null}

        <div className="mt-8 flex flex-wrap gap-3"><Link to="/work" className="public-button public-button--primary">Follow current work <ArrowRight size={17} /></Link><Link to="/projects" className="public-button public-button--secondary border-white/20 text-white hover:border-[var(--site-accent)]">View completed work</Link></div>
      </div>
    </div>

    {projects.length > 1 && <div className="absolute inset-x-0 bottom-4 z-20 sm:bottom-5">
      <div className="page-shell flex items-center justify-between gap-4">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/70"><span className="text-orange-200">{activeIndex + 1}</span> / {projects.length} active projects</p>
        <div className="grid grid-cols-3 items-center gap-3 sm:gap-4">
          <button type="button" onClick={() => move(-1)} aria-label="Previous active project" className="grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur-sm transition hover:border-orange-200/70 hover:text-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><ArrowLeft size={18} /></button>
          <button type="button" onClick={() => setAutoplayPaused((paused) => !paused)} disabled={reducedMotion} aria-label={reducedMotion ? 'Automatic sliding disabled by reduced motion preference' : autoplayPaused ? 'Resume automatic sliding' : 'Pause automatic sliding'} aria-pressed={autoplayPaused || reducedMotion} title={reducedMotion ? 'Automatic sliding disabled' : autoplayPaused ? 'Play' : 'Pause'} className="grid h-10 w-10 place-items-center justify-self-center rounded-full border border-white/15 bg-black/25 text-white/80 backdrop-blur-sm transition hover:border-orange-200/60 hover:text-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-45">{autoplayPaused || reducedMotion ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}</button>
          <button type="button" onClick={() => move(1)} aria-label="Next active project" className="grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-black/35 text-white backdrop-blur-sm transition hover:border-orange-200/70 hover:text-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><ArrowRight size={18} /></button>
        </div>
      </div>
    </div>}
    {active && <p className="sr-only" aria-live="polite">Active project {activeIndex + 1} of {projects.length}: {active.title}</p>}
  </section>;
}
