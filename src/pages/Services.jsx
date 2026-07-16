import { ArrowRight, Camera, Check, Circle, Code2, Headphones, Megaphone, Sparkles, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import LoadingState from '../components/LoadingState';
import PublicPageHeader from '../components/PublicPageHeader';
import { resolvePublicAssetUrl, usePublicContent } from '../lib/contentApi';
import { branchKeyFromRecord, branchMeta, GENERAL_BRANCH, inquiryCopy, inquiryNavigationState, inquiryUrl, publicBranchDescription, SERVICE_BRANCHES, serviceCategoriesForBranch, servicesPath, slugifyService } from '../lib/serviceRequest';
import { supabase } from '../lib/supabaseClient';

const iconMap = { studio: Camera, tech: Wrench, digital: Code2, social: Megaphone, general: Headphones, Camera, Circle, Code2, Sparkles, Wrench };

function findContentGroup(branch, groups = [], index = 0) {
  const source = `${branch.name || ''} ${branch.slug || ''}`.toLowerCase();
  return groups.find((group) => source.includes(String(group.name || '').toLowerCase().replace('lahat liwa', '').trim())) || groups[index] || null;
}

function fallbackBranches(groups = []) {
  return groups.map((group) => ({
    ...group,
    slug: slugifyService(group.name),
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
        description: publicBranchDescription(key, branch.description || contentGroup?.description),
        services: serviceCategoriesForBranch(key, branch.included_services || branch.items || []),
        iconUrl: resolvePublicAssetUrl(branch.icon_url || branch.image_url || contentGroup?.customIconUrl || contentGroup?.iconUrl),
      } : null;
    }).filter(Boolean);
  }, [branches, content.servicesPage.groups]);

  if (branchParam && !branchMeta(branchParam)) return <Navigate to="/services" replace />;
  const selected = branchParam ? branchGroups.find((branch) => branch.key === branchParam) : null;

  return (
    <div className="page-shell py-16 sm:py-20">
      <PublicPageHeader eyebrow="Client services" title="Four practical paths for different kinds of support." description="Select the branch closest to your need, explore its available service categories, then begin a guided inquiry. You can express a preference for a published creative when relevant or continue through the general branch option." accentColor={content.accentColor} titleColor={content.servicesPage.headingColor || content.primaryTextColor} bodyColor={content.servicesPage.bodyTextColor || content.secondaryTextColor} />

      <nav aria-label="Service branches" className="public-filter-scroll mt-10 flex gap-2 overflow-x-auto py-2">
        <Link to="/services" aria-current={!branchParam ? 'page' : undefined} className={`interactive-tab min-h-11 shrink-0 content-center px-3 text-xs uppercase tracking-[0.15em] ${!branchParam ? 'text-white' : 'text-zinc-500 hover:text-white'}`}>Overview</Link>
        {branchGroups.map((branch) => <Link key={branch.key} to={servicesPath(branch.key)} aria-current={branchParam === branch.key ? 'page' : undefined} className={`interactive-tab min-h-11 shrink-0 content-center px-3 text-xs uppercase tracking-[0.15em] ${branchParam === branch.key ? 'text-white' : 'text-zinc-500 hover:text-white'}`}>{branch.label}</Link>)}
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
      {branches.map((branch) => <BranchCard key={branch.key} branch={branch} content={content} />)}
    </div>
    <section className="mt-12 grid gap-6 py-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div><p className="text-xs uppercase tracking-[0.19em] text-orange-300">Not sure where to begin?</p><h2 className="mt-3 text-2xl font-medium text-white">Describe what you need in your own words.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{GENERAL_BRANCH.description}</p></div>
      <Link to={inquiryUrl({ branch: GENERAL_BRANCH.key })} state={inquiryNavigationState({ branch: GENERAL_BRANCH.key })} className="inline-flex min-h-11 w-fit items-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 hover:bg-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200">{GENERAL_BRANCH.action}<ArrowRight size={16} /></Link>
    </section>
    <p className="mt-6 max-w-3xl text-xs leading-6 text-zinc-500">These branches reflect the platform's current capabilities and may continue to develop through new work and collaboration.</p>
  </div>;
}

function BranchCard({ branch, content }) {
  const Icon = iconMap[branch.key] || Circle;
  return <section className="mobile-service-card relative min-w-0 pt-6">
    <div className="flex items-start gap-5">
      <div className="grid h-11 w-11 place-items-center border border-white/[0.1] bg-white/[0.025] text-orange-200">{branch.iconUrl ? <img src={branch.iconUrl} alt="" width="44" height="44" className="h-9 w-9 object-contain" /> : <Icon size={21} />}</div>
    </div>
    <h2 className="mt-6 text-2xl font-medium text-white">{branch.label}</h2>
    <p className="mt-3 max-w-xl text-sm leading-7" style={{ color: 'var(--site-secondary-text)' }}>{branch.description}</p>
    <ul className="mt-5 grid gap-2 sm:grid-cols-2">{branch.services.map((service) => <li key={service.key} className="flex min-w-0 items-start gap-2 border-b border-white/[0.06] py-2.5 text-sm text-zinc-400"><Check size={14} className="mt-0.5 shrink-0 text-orange-300/80" /><span>{service.name}</span></li>)}</ul>
    <Link to={servicesPath(branch.key)} className="mt-6 inline-flex min-h-11 items-center gap-2 border-b border-orange-300/45 text-sm font-medium text-zinc-200 transition hover:text-orange-200">Explore {branch.label}<ArrowRight size={15} /></Link>
  </section>;
}

function BranchWorkspace({ branch, content }) {
  const Icon = iconMap[branch.key] || Circle;
  const copy = inquiryCopy(branch.key);
  return <div className="pt-10">
    <section className="grid gap-8 pb-9 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
      <div><div className="flex items-center gap-3 text-orange-200"><Icon size={20} /><span className="text-xs uppercase tracking-[0.19em]">{branch.label}</span></div><h1 className="mt-5 max-w-3xl text-4xl font-medium leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl">{copy.serviceSelectionHeading}</h1><p className="mt-5 max-w-2xl leading-7" style={{ color: 'var(--site-secondary-text)' }}>{copy.serviceSelectionDescription}</p></div>
      <div className="border-l border-orange-300/45 pl-5"><p className="text-[10px] uppercase tracking-[0.17em] text-zinc-600">How it works</p><p className="mt-2 text-sm leading-6 text-zinc-300">Choose a category, express a preference for a published creative when relevant or continue without selecting a person, then explain the exact result or support you need.</p></div>
    </section>
    {branch.key === 'tech' && <p className="py-4 text-xs leading-6 text-zinc-500">On-site support depends on location, schedule, safety, and the availability of an appropriate support option.</p>}

    <div className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
      {branch.services.map((service) => <Link key={service.key} to={inquiryUrl({ branch: branch.key, service: service.key })} state={inquiryNavigationState({ branch: branch.key, service: service.key })} aria-label={`Choose ${service.name} for ${branch.label}`} className="mobile-service-card group grid min-h-40 content-between border border-white/[0.09] bg-white/[0.012] p-5 transition hover:border-orange-300/45 hover:bg-orange-300/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300">
        <div><p className="text-[10px] uppercase tracking-[0.17em] text-zinc-600">Service category</p><h2 className="mt-4 text-xl font-medium text-white">{service.name}</h2></div>
        <span className="mt-7 inline-flex min-h-11 items-center gap-2 border-b border-white/[0.16] text-sm text-zinc-300 transition group-hover:border-orange-300/55 group-hover:text-orange-200">Choose {service.name}<ArrowRight size={15} /></span>
      </Link>)}
    </div>

    <div className="mt-10 flex flex-wrap items-center justify-between gap-4 py-5"><p className="text-sm text-zinc-500">Need help choosing? Start with the branch and describe the outcome you need.</p><Link to={inquiryUrl({ branch: branch.key })} state={inquiryNavigationState({ branch: branch.key })} className="inline-flex min-h-11 items-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 hover:bg-orange-200">{branch.action}<ArrowRight size={16} /></Link></div>
  </div>;
}
