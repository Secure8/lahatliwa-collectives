import { Github, Instagram, Mail } from 'lucide-react';
import { siteContent } from '../data/siteContent';

export default function Contact() {
  return (
    <div className="page-shell py-20">
      <section className="grid gap-12 lg:grid-cols-[1fr_0.72fr]">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-amber-200/80">Contact</p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight text-white sm:text-5xl">Let us build the next project.</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-300">
            For creative work, digital support, websites, apps, and project collaboration, reach out through email or social links.
          </p>
          <a href={`mailto:${siteContent.email}`} className="mt-8 inline-flex items-center gap-2 bg-amber-200 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-100">
            <Mail size={18} /> Email {siteContent.displayName}
          </a>
        </div>
        <div className="border-y border-white/[0.07] py-6">
          <h2 className="text-xl font-medium">Links</h2>
          <div className="mt-6 grid gap-4">
            <a href={`mailto:${siteContent.email}`} className="inline-flex items-center gap-3 border-b border-white/[0.06] pb-4 text-zinc-200 transition hover:text-amber-200"><Mail size={18} /> {siteContent.email}</a>
            <a href={siteContent.socialLinks[0].href} className="inline-flex items-center gap-3 border-b border-white/[0.06] pb-4 text-zinc-200 transition hover:text-amber-200"><Instagram size={18} /> {siteContent.socialLinks[0].label}</a>
            <a href={siteContent.socialLinks[1].href} className="inline-flex items-center gap-3 border-b border-white/[0.06] pb-4 text-zinc-200 transition hover:text-amber-200"><Github size={18} /> {siteContent.socialLinks[1].label}</a>
          </div>
        </div>
      </section>
    </div>
  );
}
