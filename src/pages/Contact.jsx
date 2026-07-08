import { Github, Instagram, Mail } from 'lucide-react';
import { usePublicContent } from '../lib/contentApi';

export default function Contact() {
  const { content } = usePublicContent(['contact']);
  const github = content.socialLinks?.find((link) => link.label === 'GitHub');
  const instagram = content.socialLinks?.find((link) => link.label === 'Instagram');
  const hasEmail = Boolean(content.email);
  const hasLinks = hasEmail || Boolean(instagram?.href) || Boolean(github?.href);

  return (
    <div className="page-shell py-20">
      <section className="grid gap-12 lg:grid-cols-[1fr_0.72fr]">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.28em]" style={{ color: content.contactPage.accentColor || content.accentColor }}>Contact</p>
          <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: content.contactPage.headingColor || content.primaryTextColor }}>{content.contactPage.heading}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8" style={{ color: content.contactPage.bodyTextColor || content.secondaryTextColor }}>{content.contactPage.description}</p>
          {hasEmail && <a href={`mailto:${content.email}`} className="mt-8 inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:opacity-90" style={{ backgroundColor: content.contactPage.accentColor || content.accentColor }}>
            <Mail size={18} /> {content.contactPage.ctaText}
          </a>}
          {content.contactPage.notes && <p className="mt-5 max-w-xl text-sm leading-6 text-zinc-500">{content.contactPage.notes}</p>}
        </div>
        {hasLinks && <div className="major-border-y py-6">
          <h2 className="text-xl font-medium">Links</h2>
          <div className="mt-6 grid gap-4">
            {hasEmail && <a href={`mailto:${content.email}`} className="site-hover-accent inline-flex items-center gap-3 border-b border-white/[0.06] pb-4 text-zinc-200 transition"><Mail size={18} /> {content.email}</a>}
            {instagram?.href && <a href={instagram.href} className="site-hover-accent inline-flex items-center gap-3 border-b border-white/[0.06] pb-4 text-zinc-200 transition"><Instagram size={18} /> {instagram.label}</a>}
            {github?.href && <a href={github.href} className="site-hover-accent inline-flex items-center gap-3 border-b border-white/[0.06] pb-4 text-zinc-200 transition"><Github size={18} /> {github.label}</a>}
          </div>
        </div>}
      </section>
    </div>
  );
}
