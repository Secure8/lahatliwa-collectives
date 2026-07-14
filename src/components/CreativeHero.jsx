import { ArrowRight, ChevronUp } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicImageUrl } from '../lib/storage';
import { resourceMeta } from '../lib/profileResources';
import { inquiryUrl } from '../lib/serviceRequest';
import BrandWordmark from './BrandWordmark';

export default function CreativeHero({ creative, projectCount, socials, resources = [], renderSocial, adminPreview = false }) {
  const profileImage = getPublicImageUrl(creative.profile_image_url);
  const coverImage = getPublicImageUrl(creative.cover_image) || profileImage;
  const intro = creative.short_bio || creative.full_bio;
  return (
    <header className="theme-inverse relative isolate w-full overflow-hidden rounded-[10px] bg-[#09090b] lg:flex lg:aspect-video lg:min-h-[32.5rem] lg:max-h-[45rem] lg:flex-col">
      <div data-creative-cover className="relative aspect-[16/9] w-full shrink-0 overflow-hidden lg:absolute lg:inset-0 lg:h-full lg:aspect-auto">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_22%,rgba(246,213,139,0.14),transparent_34%),linear-gradient(135deg,#27272a,#09090b)]" />
        {coverImage && <SmoothImage key={`cover-${coverImage}`} src={coverImage} alt={`${creative.name} cover`} loading={adminPreview ? 'lazy' : 'eager'} fetchpriority={adminPreview ? 'auto' : 'high'} decoding="async" width="1920" height="1080" sizes="(max-width: 1439px) calc(100vw - 24px), 1360px" className="absolute inset-0 h-full w-full object-cover object-center" />}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,5,6,0.94)_0%,rgba(5,5,6,0.58)_30%,rgba(5,5,6,0.02)_57%,rgba(5,5,6,0.82)_100%),linear-gradient(0deg,rgba(5,5,6,0.78)_0%,transparent_58%)]" />
      </div>
      {!adminPreview && <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-3 z-20 hidden justify-center xl:flex"><div className="flex items-center gap-3 text-[9px] font-medium uppercase tracking-[0.24em] text-white/55"><span className="h-px w-12 bg-gradient-to-r from-transparent to-orange-200/55 shadow-[0_0_6px_rgba(251,146,60,0.28)]" /><ChevronUp size={12} className="text-orange-200/75" /><span>DISCOVER MORE</span><span className="h-px w-12 bg-gradient-to-l from-transparent to-orange-200/55 shadow-[0_0_6px_rgba(251,146,60,0.28)]" /></div></div>}
      <div data-creative-hero-content className="relative z-10 -mt-12 min-w-0 px-5 pb-7 sm:-mt-16 sm:px-9 sm:pb-9 lg:mt-0 lg:flex lg:w-[48%] lg:flex-1 lg:translate-y-10 lg:items-center lg:px-12 lg:pb-10 lg:pt-10">
        <div className="max-w-[34rem]">
        <div className="relative grid h-40 w-40 place-items-center overflow-hidden rounded-full border border-white/25 bg-zinc-900/85 shadow-[0_10px_28px_rgba(0,0,0,0.35)]">
          <span aria-hidden="true" className="text-3xl font-semibold text-orange-200">{creative.name?.slice(0, 1) || 'L'}</span>
          {profileImage && <SmoothImage key={`profile-${profileImage}`} src={profileImage} alt={`${creative.name} profile`} loading={adminPreview ? 'lazy' : 'eager'} fetchpriority="auto" decoding="async" width="320" height="320" sizes="160px" className="absolute inset-0 h-full w-full object-cover" />}
        </div>
        <p className="mt-3 inline-flex w-40 whitespace-nowrap justify-center border border-white/20 bg-black/20 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-100 backdrop-blur-sm">Creative portfolio</p>
        <h1 className="mt-4 max-w-3xl [overflow-wrap:anywhere] text-[clamp(2.5rem,5.6vw,5.7rem)] font-semibold leading-[0.94] tracking-[-0.045em] text-white">{creative.name}</h1>
        <div className="mt-4 max-w-2xl border-l-2 border-orange-300 pl-3 sm:pl-4">
          <BrandWordmark variant="eyebrow" />
          <p className="mt-1 [overflow-wrap:anywhere] text-sm font-semibold leading-6 text-white sm:text-base sm:leading-7"><SeparatedTitle value={creative.role} /></p>
        </div>
        {intro && <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-100 sm:text-base sm:leading-7 lg:hidden">{intro}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {!adminPreview && <Link to={inquiryUrl({ creative: creative.slug })} className="inline-flex min-h-11 items-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">Start a project <ArrowRight size={16} /></Link>}
          <div className="flex flex-wrap gap-2">{socials.map(renderSocial)}</div>
        </div>
        </div>
      </div>
      <aside className="absolute right-8 top-[58%] z-10 hidden w-[23%] -translate-y-1/2 border-l border-orange-300/60 pl-7 lg:block">
        {intro && <p className="mb-8 text-sm leading-6 text-zinc-100">{intro}</p>}
        <div className="grid gap-6">
          <HeroFact label="01 / Status" value={creative.availability_status || 'Creative profile'} accent={Boolean(creative.availability_status)} />
          <HeroFact label="02 / Discipline" value={<SeparatedTitle value={creative.role || 'Multidisciplinary'} />} />
          <HeroFact label="03 / Selected work" value={`${projectCount} published ${projectCount === 1 ? 'project' : 'projects'}`} />
        </div>
      </aside>
      <div data-creative-hero-facts className="relative z-10 mx-3 mb-3 lg:hidden">
        {resources.length > 0 && <ResourceDock resources={resources} mobile />}
        <div className="grid border border-white/15 bg-black/55 backdrop-blur-md sm:grid-cols-3">
          <HeroFact label="Status" value={creative.availability_status || 'Creative profile'} accent={Boolean(creative.availability_status)} />
          <HeroFact label="Discipline" value={<SeparatedTitle value={creative.role || 'Multidisciplinary'} />} />
          <HeroFact label="Selected work" value={`${projectCount} published ${projectCount === 1 ? 'project' : 'projects'}`} />
        </div>
      </div>
      {resources.length > 0 && <ResourceDock resources={resources} />}
    </header>
  );
}

function SmoothImage({ className = '', ...props }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img {...props} className={className} onError={() => setFailed(true)} />;
}

function SeparatedTitle({ value }) {
  const titles = String(value || 'Creative').split(/\s*\/\s*/).filter(Boolean);
  return <>{titles.map((title, index) => <Fragment key={`${title}-${index}`}>{index > 0 && <span className="mx-1.5 font-normal text-orange-300/90">/</span>}<span>{title}</span></Fragment>)}</>;
}

function ResourceDock({ resources, mobile = false }) {
  const position = mobile
    ? 'mb-2 flex w-full items-end'
    : 'absolute bottom-4 left-1/2 z-20 hidden max-w-[46%] -translate-x-1/2 items-end lg:flex';
  return <div className={`public-filter-scroll ${position} gap-2 overflow-x-auto rounded-xl border border-white/15 bg-black/55 px-3 py-2 shadow-[0_10px_35px_rgba(0,0,0,0.35)] backdrop-blur-md`} aria-label={mobile ? 'Mobile tools and resources' : 'Tools and resources'}>{resources.slice(0, 10).map((resource) => { const meta = resourceMeta(resource); if (!meta.href) return null; return <a key={`${meta.name}-${meta.href}`} href={meta.href} target="_blank" rel="noopener noreferrer" aria-label={`${meta.name} (opens in a new tab)`} title={meta.name} className="group grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-zinc-900/90 transition hover:-translate-y-1 hover:border-orange-200/50 hover:shadow-[0_0_18px_rgba(251,146,60,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 motion-reduce:transform-none"><ResourceIcon meta={meta} /></a>; })}</div>;
}

function ResourceIcon({ meta }) {
  const [failed, setFailed] = useState(false);
  if (failed || !meta.icon) return <span className="text-xs font-semibold uppercase text-orange-200">{meta.name.slice(0, 2)}</span>;
  return <img src={meta.icon} alt="" width="24" height="24" loading="lazy" className="h-6 w-6 rounded object-contain" onError={() => setFailed(true)} />;
}

function HeroFact({ label, value, accent = false }) {
  return <div className="min-w-0 border-b border-white/10 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-l sm:first:border-l-0 lg:border-0 lg:p-0"><p className="text-[10px] uppercase tracking-[0.17em] text-zinc-400">{label}</p><p className={`mt-1 flex items-center gap-2 [overflow-wrap:anywhere] text-xs sm:text-sm ${accent ? 'text-emerald-100' : 'text-white'}`}>{accent && <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true"><span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-35 blur-[3px]" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-emerald-200/70 bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)]" /></span>}<span>{value}</span></p></div>;
}
