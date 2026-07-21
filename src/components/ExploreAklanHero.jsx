import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { carouselStep, editorialPublicPath, normalizeHomepageSlides, swipeDirection, TOURISM_SLIDE_AUTOPLAY_MS, tourismSlideMeta } from '../lib/tourismHomepage.js';
import TourismStoryFallback from './TourismStoryFallback.jsx';

export default function ExploreAklanHero({ slides: sourceSlides = [], loading = false }) {
  const slides = normalizeHomepageSlides(sourceSlides);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const touchStart = useRef(null);

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(slides.length - 1, 0)));
  }, [slides.length]);

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
    if (paused || !pageVisible || reducedMotion || slides.length < 2) return undefined;
    const timer = window.setInterval(() => setActiveIndex((current) => carouselStep(current, slides.length, 1)), TOURISM_SLIDE_AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [pageVisible, paused, reducedMotion, slides.length]);

  function move(direction) {
    setActiveIndex((current) => carouselStep(current, slides.length, direction));
  }

  function handleKeyDown(event) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
  }

  function finishSwipe(clientX) {
    if (touchStart.current == null) return;
    const direction = swipeDirection(touchStart.current, clientX);
    touchStart.current = null;
    if (direction) move(direction);
  }

  if (!slides.length) return <ExploreFallback loading={loading} />;

  const active = slides[activeIndex];
  return (
    <section
      className="theme-inverse relative isolate min-h-[34rem] overflow-hidden bg-zinc-950 sm:min-h-[40rem] lg:min-h-[calc(100svh-4rem)]"
      aria-roledescription="carousel"
      aria-label="Explore Aklan featured stories"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}
      onPointerDown={(event) => { if (event.pointerType === 'touch') touchStart.current = event.clientX; }}
      onPointerUp={(event) => { if (event.pointerType === 'touch') finishSwipe(event.clientX); }}
      onPointerCancel={() => { touchStart.current = null; }}
    >
      {slides.map((slide, index) => {
        const post = slide.editorial_posts;
        const visible = index === activeIndex;
        return <div key={slide.slot_type} className={`absolute inset-0 transition-opacity duration-700 motion-reduce:transition-none ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`} aria-hidden={!visible}>
          {post.cover_image_url
            ? <img src={post.cover_image_url} alt="" loading={index === 0 ? 'eager' : 'lazy'} fetchpriority={index === 0 ? 'high' : 'auto'} decoding="async" width="1920" height="1080" sizes="100vw" className="h-full w-full object-cover" style={{ objectPosition: `${slide.focal_x ?? 50}% ${slide.focal_y ?? 50}%` }} />
            : <TourismStoryFallback className="h-full w-full" />}
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,8,10,0.88)_0%,rgba(8,8,10,0.56)_52%,rgba(8,8,10,0.2)_100%),linear-gradient(0deg,rgba(8,8,10,0.8)_0%,transparent_65%)]" />
        </div>;
      })}

      <Link to="/explore" className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-200" aria-label="Open Explore Aklan" />
      <div className="page-shell pointer-events-none relative z-20 flex min-h-[34rem] items-end pb-20 pt-24 sm:min-h-[40rem] sm:pb-24 lg:min-h-[calc(100svh-4rem)] lg:items-center lg:pb-24 lg:pt-28">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-200">{active.eyebrow || 'Explore Aklan'}</p>
          <p className="mt-3 text-base font-medium text-white/80">{tourismSlideMeta(active.slot_type)?.label}</p>
          <h1 className="mt-4 text-4xl font-semibold leading-[0.98] tracking-[-0.035em] text-white sm:text-6xl lg:text-7xl">{active.editorial_posts.title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-200 sm:text-lg sm:leading-8">{active.description || active.editorial_posts.summary}</p>
          <Link to={editorialPublicPath(active.editorial_posts)} className="pointer-events-auto mt-7 inline-flex min-h-12 items-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            {tourismSlideMeta(active.slot_type)?.action} <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>

      {slides.length > 1 && <div className="absolute inset-x-0 bottom-5 z-30">
        <div className="page-shell flex items-center justify-between gap-4">
          <div className="flex items-center gap-2" role="tablist" aria-label="Choose a featured story">
            {slides.map((slide, index) => <button key={slide.slot_type} type="button" role="tab" aria-selected={index === activeIndex} aria-label={`Show ${slide.editorial_posts.title}`} onClick={() => setActiveIndex(index)} className={`h-11 min-w-11 px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${index === activeIndex ? 'text-orange-200' : 'text-white/60 hover:text-white'}`}><span className={`block h-0.5 transition-all ${index === activeIndex ? 'w-8 bg-orange-300' : 'w-4 bg-white/45'}`} /></button>)}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => move(-1)} className="grid h-11 w-11 place-items-center border border-white/25 bg-black/25 text-white backdrop-blur-sm transition hover:border-orange-200/70 hover:text-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Previous story"><ArrowLeft size={18} /></button>
            <button type="button" onClick={() => move(1)} className="grid h-11 w-11 place-items-center border border-white/25 bg-black/25 text-white backdrop-blur-sm transition hover:border-orange-200/70 hover:text-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label="Next story"><ArrowRight size={18} /></button>
          </div>
        </div>
      </div>}
      <p className="sr-only" aria-live="polite">Featured story {activeIndex + 1} of {slides.length}: {active.editorial_posts.title}</p>
    </section>
  );
}

function ExploreFallback({ loading }) {
  return <section className="theme-inverse relative isolate overflow-hidden bg-zinc-950">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_24%,rgba(251,146,60,0.2),transparent_30%),linear-gradient(145deg,#27201b,#09090b_65%)]" aria-hidden="true" />
    <div className="page-shell relative flex min-h-[34rem] items-center py-24 sm:min-h-[40rem] lg:min-h-[calc(100svh-4rem)]">
      <div className="max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-orange-200">Explore Aklan</p><h1 className="mt-5 text-4xl font-semibold leading-[0.98] tracking-[-0.035em] text-white sm:text-6xl lg:text-7xl">Discover Aklan Beyond the Usual</h1><p className="mt-6 max-w-2xl text-base leading-7 text-zinc-200 sm:text-lg sm:leading-8">Explore destinations, celebrations, activities, local products, and stories from communities across Aklan.</p><Link to="/explore" className="mt-8 inline-flex min-h-12 items-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Explore Aklan <ArrowRight size={17} /></Link>{loading && <p className="mt-4 text-sm text-white/55">Loading featured stories…</p>}</div>
    </div>
  </section>;
}
