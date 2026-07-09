import { Facebook, Github, Globe, Instagram, Linkedin, Mail, Music2, Youtube } from 'lucide-react';
import { usePublicContent } from '../lib/contentApi';

const socialIconMap = {
  Facebook,
  GitHub: Github,
  Instagram,
  LinkedIn: Linkedin,
  TikTok: Music2,
  YouTube: Youtube,
};

export default function Contact() {
  const { content } = usePublicContent(['contact']);
  const socialLinks = content.socialLinks || [];
  const hasEmail = Boolean(content.email);
  const hasLinks = hasEmail || socialLinks.length > 0;

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
            {socialLinks.map((link) => {
              const Icon = socialIconMap[link.label] || Globe;
              return (
                <a key={`${link.label}-${link.href}`} href={link.href} target="_blank" rel="noopener noreferrer" className="site-hover-accent inline-flex items-center gap-3 border-b border-white/[0.06] pb-4 text-zinc-200 transition">
                  <Icon size={18} /> {link.label}
                </a>
              );
            })}
          </div>
        </div>}
      </section>
    </div>
  );
}
