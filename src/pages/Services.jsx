import { siteContent } from '../data/siteContent';

export default function Services() {
  return (
    <div className="page-shell py-20">
      <div className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-amber-200/80">Services</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">Creative, digital, and technical support.</h1>
        <p className="mt-6 text-lg leading-8 text-zinc-300">{siteContent.servicesIntro}</p>
      </div>
      <div className="mt-14 grid gap-10 md:grid-cols-2">
        {siteContent.services.map((group) => (
          <section key={group.name} className="border-t border-white/[0.08] pt-6">
            <h2 className="text-2xl font-medium text-white">{group.name}</h2>
            <p className="mt-3 max-w-md leading-7 text-zinc-400">{group.description}</p>
            <div className="mt-6 grid gap-3">
              {group.items.map((item) => <div key={item} className="border-b border-white/[0.06] pb-3 text-zinc-300">{item}</div>)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
