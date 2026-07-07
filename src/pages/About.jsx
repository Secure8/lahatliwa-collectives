import { siteContent } from '../data/siteContent';

export default function About() {
  return (
    <div className="page-shell py-20">
      <section className="max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-amber-200/80">About</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">{siteContent.about.title}</h1>
        <p className="mt-6 text-lg leading-8 text-zinc-300">{siteContent.about.intro}</p>
      </section>

      <section className="mt-16 grid gap-12 border-y border-white/[0.07] py-12 md:grid-cols-2">
        <div>
          <h2 className="text-2xl font-medium">Skills</h2>
          <div className="mt-6 grid gap-3">
            {siteContent.skills.map((skill) => <span key={skill} className="border-b border-white/[0.06] pb-3 text-sm text-zinc-300">{skill}</span>)}
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-medium">Tools</h2>
          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-3">
            {siteContent.tools.map((tool) => <span key={tool} className="text-sm text-zinc-300">{tool}</span>)}
          </div>
        </div>
      </section>

      <section className="mt-14 grid gap-8 md:grid-cols-[0.4fr_1fr]">
        <h2 className="text-2xl font-medium">Creative Journey</h2>
        <p className="max-w-4xl text-lg leading-8 text-zinc-400">{siteContent.about.journey}</p>
      </section>
    </div>
  );
}
