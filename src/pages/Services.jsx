import { Camera, Circle, Code2, Sparkles, Wrench } from 'lucide-react';
import { usePublicContent } from '../lib/contentApi';

const iconMap = { Camera, Circle, Code2, Sparkles, Wrench };

export default function Services() {
  const { content } = usePublicContent(['services']);

  return (
    <div className="page-shell py-20">
      <div className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.28em]" style={{ color: content.accentColor }}>Services</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: content.servicesPage.headingColor || content.primaryTextColor }}>{content.servicesPage.title}</h1>
        <p className="mt-6 text-lg leading-8" style={{ color: content.servicesPage.bodyTextColor || content.secondaryTextColor }}>{content.servicesPage.intro}</p>
      </div>
      <div className="mt-14 grid gap-10 md:grid-cols-2">
        {content.servicesPage.groups.map((group) => {
          const Icon = iconMap[group.iconName] || Circle;
          return (
          <section key={group.name} className="border-t border-white/[0.08] pt-6">
            {(group.customIconUrl || group.iconUrl) ? <img src={group.customIconUrl || group.iconUrl} alt="" className="mb-5 h-6 w-6 object-contain" /> : (group.iconName && <Icon className="mb-5" style={{ color: content.servicesPage.iconColor || content.accentColor }} size={24} />)}
            <h2 className="text-2xl font-medium" style={{ color: content.servicesPage.serviceTitleColor || content.primaryTextColor }}>{group.name}</h2>
            <p className="mt-3 max-w-md leading-7" style={{ color: content.servicesPage.bodyTextColor || content.secondaryTextColor }}>{group.description}</p>
            <div className="mt-6 grid gap-3">
              {group.items.map((item) => <div key={item} className="border-b border-white/[0.06] pb-3 text-zinc-300">{item}</div>)}
            </div>
          </section>
        );})}
      </div>
    </div>
  );
}
