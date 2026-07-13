import { ArrowRight, Camera, Check, Circle, Code2, Headphones, Megaphone, Sparkles, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import LoadingState from '../components/LoadingState';
import PublicPageHeader from '../components/PublicPageHeader';
import { resolvePublicAssetUrl, usePublicContent } from '../lib/contentApi';
import { branchKeyFromRecord, branchMeta, GENERAL_BRANCH, inquiryUrl, SERVICE_BRANCHES, servicesPath, slugifyService } from '../lib/serviceRequest';
import { supabase } from '../lib/supabaseClient';

const iconMap = { studio: Camera, tech: Wrench, digital: Code2, social: Megaphone, general: Headphones, Camera, Circle, Code2, Sparkles, Wrench };

function findContentGroup(branch, groups = [], index = 0) {
  const source = `${branch.name || ''} ${branch.slug || ''}`.toLowerCase();
  return groups.find((group) => source.includes(String(group.name || '').toLowerCase().replace('lahat liwa', '').trim())) || groups[index] || null;
}

function fallbackBranches(groups = []) {
  const keys = ['studio', 'social', 'digital', 'tech'];
  return groups.map((group, index) => ({
    ...group,
    slug: keys[index] || slugifyService(group.name),
    included_services: group.items || [],
    icon_url: group.customIconUrl || group.iconUrl || '',
  }));
}

export default function Services() {
  const { branch: branchParam = '' } = useParams();
  const { content } = usePublicContent(['services']);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.from('service_branches')
      .select('id, name, slug, description, included_services, icon_url, image_url, display_order')
      .eq('is_published', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        if (!active) return;
        setBranches(data || []);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const branchGroups = useMemo(() => {
    const rows = branches.length ? branches : fallbackBranches(content.servicesPage.groups);
    return rows.map((branch, index) => {
      const key = branchKeyFromRecord(branch) || SERVICE_BRANCHES[index]?.key || '';
      const meta = branchMeta(key);
      const contentGroup = findContentGroup(branch, content.servicesPage.groups, index);
      return meta ? {
        ...branch,
        key,
        label: meta.label,
        action: meta.action,
        description: branch.description || contentGroup?.description || meta.description,
        services: (branch.included_services || branch.items || []).filter(Boolean).map((name) => ({ name, key: slugifyService(name) })),
        iconUrl: resolvePublicAssetUrl(branch.icon_url || branch.image_url || contentGroup?.customIconUrl || contentGroup?.iconUrl),
      } : null;
    }).filter(Boolean);
  }, [branches, content.servicesPage.groups]);

  if (branchParam && !branchMeta(branchParam)) return <Navigate to="/services" replace />;
  const selected = branchParam ? branchGroups.find((branch) => branch.key === branchParam) : null;

  return (
    <div className="page-shell py-16 sm:py-20">
      <PublicPageHeader eyebrow="Client services" title="Choose the right path for your next project." description="Explore a service branch, select the support you need, and send a guided request to the collective or a specific creative." accentColor={content.accentColor} titleColor={content.servicesPage.headingColor || content.primaryTextColor} bodyColor={content.servicesPage.bodyTextColor || content.secondaryTextColor} />

      <nav aria-label="Service branches" className="public-filter-scroll mt-10 flex gap-6 overflow-x-auto border-y border-white/[0.08] py-1">
        <Link to="/services" className={`min-h-12 shrink-0 content-center border-b text-xs uppercase tracking-[0.15em] ${!branchParam ? 'border-orange-300 text-white' : 'border-transparent text-zinc-500 hover:text-white'}`}>Overview</Link>
        {branchGroups.map((branch) => <Link key={branch.key} to={servicesPath(branch.key)} className={`min-h-12 shrink-0 content-center border-b text-xs uppercase tracking-[0.15em] ${branchParam === branch.key ? 'border-orange-300 text-white' : 'border-transparent text-zinc-500 hover:text-white'}`}>{branch.label}</Link>)}
      </nav>

      {loading ? <div className="py-12"><LoadingState label="Loading services" /></div> : selected ? (
        <BranchWorkspace branch={selected} content={content} />
      ) : (
        <ServiceOverview branches={branchGroups} content={content} />
      )}
    </div>
  );
}

function ServiceOverview({ branches, content }) {
  return <div className="pt-10">
    <div className="grid gap-x-7 gap-y-9 md:grid-cols-2">
      {branches.map((branch, index) => <BranchCard key={branch.key} branch={branch} index={index} content={content} />)}
    </div>
    <section className="mt-12 grid gap-6 border-y border-white/[0.09] py-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div><p className="text-xs uppercase tracking-[0.19em] text-orange-300">Not sure where to begin?</p><h2 className="mt-3 text-2xl font-medium text-white">Tell the main team what you have in mind.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Use a general inquiry for multidisciplinary work, partnerships, collaborations, or requirements that do not fit neatly into one branch.</p></div>
      <Link to={inquiryUrl({ branch: GENERAL_BRANCH.key })} className="inline-flex min-h-11 w-fit items-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 hover:bg-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200">{GENERAL_BRANCH.action}<ArrowRight size={16} /></Link>
    </section>
  </div>;
}

function BranchCard({ branch, index, content }) {
  const Icon = iconMap[branch.key] || Circle;
  return <section className="group relative min-w-0 border-t border-white/[0.1] pt-6 transition hover:border-orange-300/40">
    <div className="flex items-start justify-between gap-5">
      <div className="grid h-11 w-11 place-items-center border border-white/[0.1] bg-white/[0.025] text-orange-200 transition group-hover:border-orange-300/35 group-hover:shadow-[0_0_22px_rgba(251,146,60,0.16)]">{branch.iconUrl ? <img src={branch.iconUrl} alt="" width="44" height="44" className="h-9 w-9 object-contain" /> : <Icon size={21} />}</div>
      <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-700">0{index + 1}</span>
    </div>
    <h2 className="mt-6 text-2xl font-medium text-white">{branch.label}</h2>
    <p className="mt-3 max-w-xl text-sm leading-7" style={{ color: content.servicesPage.bodyTextColor || content.secondaryTextColor }}>{branch.description}</p>
    <ul className="mt-5 grid gap-2 sm:grid-cols-2">{branch.services.slice(0, 6).map((service) => <li key={service.key} className="flex min-w-0 items-start gap-2 border-b border-white/[0.06] py-2.5 text-sm text-zinc-400"><Check size={14} className="mt-0.5 shrink-0 text-orange-300/80" /><span>{service.name}</span></li>)}</ul>
    <Link to={servicesPath(branch.key)} className="mt-6 inline-flex min-h-11 items-center gap-2 border-b border-orange-300/45 text-sm font-medium text-zinc-200 transition hover:text-orange-200">Explore {branch.label}<ArrowRight size={15} /></Link>
  </section>;
}

function BranchWorkspace({ branch, content }) {
  const Icon = iconMap[branch.key] || Circle;
  return <div className="pt-10">
    <section className="grid gap-8 border-b border-white/[0.09] pb-9 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
      <div><div className="flex items-center gap-3 text-orange-200"><Icon size={20} /><span className="text-xs uppercase tracking-[0.19em]">{branch.label}</span></div><h1 className="mt-5 max-w-3xl text-4xl font-medium leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl">Choose the service that fits your request.</h1><p className="mt-5 max-w-2xl leading-7" style={{ color: content.servicesPage.bodyTextColor || content.secondaryTextColor }}>{branch.description}</p></div>
      <div className="border-l border-orange-300/45 pl-5"><p className="text-[10px] uppercase tracking-[0.17em] text-zinc-600">Guided request</p><p className="mt-2 text-sm leading-6 text-zinc-300">Choose a service, select a creative or the general team, then review everything before submitting.</p></div>
    </section>

    <div className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
      {branch.services.map((service, index) => <article key={service.key} className="group grid content-between border-t border-white/[0.09] py-5 transition hover:border-orange-300/45">
        <div><p className="text-[10px] uppercase tracking-[0.17em] text-zinc-700">{String(index + 1).padStart(2, '0')} / Service</p><h2 className="mt-4 text-xl font-medium text-white">{service.name}</h2><p className="mt-3 text-sm leading-6 text-zinc-500">Start a guided {branch.label} request and add the project-specific details the team needs to review it.</p></div>
        <Link to={inquiryUrl({ branch: branch.key, service: service.key })} className="mt-7 inline-flex min-h-11 items-center gap-2 border-b border-white/[0.12] text-sm text-zinc-300 transition group-hover:border-orange-300/45 group-hover:text-orange-200">Choose service<ArrowRight size={15} /></Link>
      </article>)}
    </div>

    <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-y border-white/[0.08] py-5"><p className="text-sm text-zinc-500">Need help choosing? Start with the branch and describe the outcome you need.</p><Link to={inquiryUrl({ branch: branch.key })} className="inline-flex min-h-11 items-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 hover:bg-orange-200">{branch.action}<ArrowRight size={16} /></Link></div>
  </div>;
}
