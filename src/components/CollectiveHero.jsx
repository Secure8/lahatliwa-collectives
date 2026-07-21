import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { defaultSiteContent } from '../data/siteContent.js';
import { isBrandWordmarkText } from '../lib/brandWordmark.js';
import { createHeroBackgroundRender } from '../lib/heroBackground.js';
import { homeCtaPath } from '../lib/homeCta.js';
import BrandWordmark from './BrandWordmark.jsx';
import { AccentEyebrow } from './PublicPageHeader.jsx';

export default function CollectiveHero({ content }) {
  const backgroundImage = content.home.heroBackgroundImageUrl || content.defaultBackgroundImageUrl;
  const background = createHeroBackgroundRender({
    imageUrl: backgroundImage,
    position: content.home.heroBackgroundPosition || 'center',
    overlayOpacity: content.home.heroBackgroundOverlayOpacity ?? content.defaultBackgroundOverlayOpacity ?? 0.55,
    blur: content.home.heroBackgroundBlur || 14,
    mode: content.home.heroBackgroundStyle || 'none',
  });
  const showPortrait = content.showHeroPortrait === true || content.show_hero_portrait === true;
  const hasPortrait = Boolean(content.heroImageUrl && showPortrait);
  const brandTitle = isBrandWordmarkText(content.home.heroTitle, content.displayName, [defaultSiteContent.displayName, defaultSiteContent.legalName]);
  const primaryLabel = content.home.primaryCta || 'Send an Inquiry';
  const secondaryLabel = content.home.secondaryCta || 'Explore Published Work';

  return <section className="theme-inverse relative overflow-hidden">
    {backgroundImage ? <><div className={`hero-background-visual absolute inset-0 ${background.mode === 'ambient-blur' ? 'lg:scale-105' : ''}`} style={{ ...background.style, filter: undefined, transform: undefined, '--hero-background-blur': background.mode === 'ambient-blur' ? `blur(${content.home.heroBackgroundBlur || 14}px)` : 'none' }} aria-hidden="true" /><div className="hero-background-overlay absolute inset-0" style={background.overlayStyle} aria-hidden="true" /></> : <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(120,113,108,0.12),transparent_45%),linear-gradient(180deg,#101012,#09090b)]" aria-hidden="true" />}
    <div className={`page-shell relative grid min-h-[32rem] items-center gap-10 py-16 ${hasPortrait ? 'lg:grid-cols-[1.1fr_0.7fr]' : 'lg:grid-cols-1'} lg:min-h-[calc(100svh-4rem)] lg:gap-14 lg:py-20`}>
      <div className="max-w-2xl">
        <AccentEyebrow color={content.home.accentTextColor || content.accentColor} preserveColor>{content.home.heroEyebrow || content.hero.eyebrow}</AccentEyebrow>
        <h1 className="mt-5 text-4xl font-semibold leading-[0.95] sm:text-5xl lg:text-7xl" style={{ color: content.home.heroTitleColor || content.primaryTextColor }}>{brandTitle ? <BrandWordmark name={content.home.heroTitle} variant="hero" /> : content.home.heroTitle}</h1>
        <p className="mt-7 text-lg leading-8" style={{ color: content.home.heroDescriptionColor || content.secondaryTextColor }}>{content.home.heroDescription}</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link to={homeCtaPath(primaryLabel, '/inquiry')} className="inline-flex min-h-11 items-center gap-2 px-5 text-sm font-semibold text-zinc-950 transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" style={{ backgroundColor: content.accentColor }}>{primaryLabel} <ArrowRight size={18} /></Link><Link to={homeCtaPath(secondaryLabel, '/projects')} className="fine-link px-1 py-3 text-sm font-semibold" style={{ color: content.primaryTextColor }}>{secondaryLabel}</Link></div>
        <p className="mt-8 max-w-xl text-sm leading-6" style={{ color: content.mutedTextColor }}>{content.tagline}</p>
      </div>
      {hasPortrait && <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-[10px] border border-white/10 bg-zinc-900/70 shadow-[0_24px_60px_rgba(0,0,0,0.2)] lg:ml-auto"><img src={content.heroImageUrl} alt={content.heroImageAlt} decoding="async" fetchPriority="high" sizes="384px" width="800" height="1000" className="aspect-[4/5] w-full object-cover" /></div>}
    </div>
  </section>;
}
