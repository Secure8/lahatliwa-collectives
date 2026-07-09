import { Camera, Circle, Code2, Sparkles, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { resolvePublicAssetUrl, usePublicContent } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';

const iconMap = { Camera, Circle, Code2, Sparkles, Wrench };

function normalizeServiceKey(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findContentGroup(branch, groups = [], index = 0) {
  const branchName = normalizeServiceKey(branch.name);
  const branchSlug = normalizeServiceKey(branch.slug);
  return groups.find((group) => {
    const groupName = normalizeServiceKey(group.name);
    return groupName === branchName
      || groupName === branchSlug
      || branchName.includes(groupName)
      || groupName.includes(branchName);
  }) || groups[index] || null;
}

export default function Services() {
  const { content } = usePublicContent(['services']);
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    async function loadBranches() {
      const { data } = await supabase
        .from('service_branches')
        .select('*')
        .eq('is_published', true)
        .order('display_order', { ascending: true, nullsFirst: false });
      setBranches(data || []);
    }
    loadBranches();
  }, []);

  const serviceGroups = branches.length
    ? branches.map((branch, index) => {
        const contentGroup = findContentGroup(branch, content.servicesPage.groups, index);
        return {
        name: branch.name,
        description: branch.description,
        items: branch.included_services || [],
        serviceLogoUrl: resolvePublicAssetUrl(contentGroup?.serviceLogoUrl),
        customIconUrl: resolvePublicAssetUrl(branch.icon_url || branch.image_url || contentGroup?.customIconUrl || contentGroup?.iconUrl),
        iconName: contentGroup?.iconName || 'Circle',
        ctaLabel: branch.cta_label || 'Start a project',
        ctaUrl: branch.cta_url || '/start-a-project',
      };
      })
    : content.servicesPage.groups;

  return (
    <div className="page-shell py-20">
      <div className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.28em]" style={{ color: content.accentColor }}>Services</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: content.servicesPage.headingColor || content.primaryTextColor }}>Creative branches for practical digital work.</h1>
        <p className="mt-6 text-lg leading-8" style={{ color: content.servicesPage.bodyTextColor || content.secondaryTextColor }}>Lahat Liwa Collectives works across studio, social, web, and creative production for teams, events, creators, and growing ideas.</p>
      </div>
      <div className="mt-14 grid gap-10 md:grid-cols-2">
        {serviceGroups.map((group) => {
          const Icon = iconMap[group.iconName] || Circle;
          const serviceLogoUrl = resolvePublicAssetUrl(group.serviceLogoUrl);
          const iconUrl = resolvePublicAssetUrl(group.customIconUrl || group.iconUrl);
          return (
          <section key={group.name} className="major-border-top pt-6">
            <div className="mb-5 flex min-h-8 items-center gap-0.5">
              {serviceLogoUrl && <img src={serviceLogoUrl} alt={`${group.name} logo`} className="h-8 max-w-24 object-contain" />}
              {iconUrl ? <img src={iconUrl} alt="" className="h-10 w-10 object-contain" /> : <Icon style={{ color: content.servicesPage.iconColor || content.accentColor }} size={40} />}
            </div>
            <h2 className="text-2xl font-medium" style={{ color: content.servicesPage.serviceTitleColor || content.primaryTextColor }}>{group.name}</h2>
            <p className="mt-3 max-w-md leading-7" style={{ color: content.servicesPage.bodyTextColor || content.secondaryTextColor }}>{group.description}</p>
            <div className="mt-6 grid gap-3">
              {(group.items || []).map((item) => <div key={item} className="border-b border-white/[0.06] pb-3 text-zinc-300">{item}</div>)}
            </div>
            <Link to={group.ctaUrl || '/start-a-project'} className="site-hover-accent mt-6 inline-flex text-sm text-zinc-300">{group.ctaLabel || 'Start a project'}</Link>
          </section>
        );})}
      </div>
    </div>
  );
}
