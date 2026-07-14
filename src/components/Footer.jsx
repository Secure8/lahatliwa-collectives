import { Facebook, Github, Globe, Instagram, Linkedin, Lock, Mail, Music2, Youtube } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePublicContent } from '../lib/contentApi';
import BrandWordmark from './BrandWordmark';

const socialIconMap = {
  Facebook,
  GitHub: Github,
  Instagram,
  LinkedIn: Linkedin,
  TikTok: Music2,
  YouTube: Youtube,
};

export default function Footer() {
  const { content } = usePublicContent([]);
  const socialLinks = content.socialLinks || [];

  return (
    <footer className="mt-28 border-t border-orange-300/45">
      <div className="page-shell grid gap-10 py-12 md:grid-cols-[1.4fr_1fr] md:py-14">
        <div>
          <BrandWordmark name={content.displayName} variant="footer" to="/" />
          <p className="mt-3 text-sm font-medium text-[var(--site-brand-accent)]">{content.tagline}</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">{content.footerText}</p>
        </div>
        <div className="flex flex-wrap items-start gap-3 md:justify-end">
          {content.email && <a className="site-hover-accent grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-black/20 text-zinc-300 transition hover:-translate-y-0.5 hover:border-orange-300/40 hover:shadow-[0_0_16px_rgba(251,146,60,0.24)]" href={`mailto:${content.email}`} aria-label="Email">
            <Mail size={18} />
          </a>}
          {socialLinks.map((link) => {
            const Icon = socialIconMap[link.label] || Globe;
            return (
              <a key={`${link.label}-${link.href}`} className="site-hover-accent grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-black/20 text-zinc-300 transition hover:-translate-y-0.5 hover:border-orange-300/40 hover:shadow-[0_0_16px_rgba(251,146,60,0.24)]" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label}>
                <Icon size={18} />
              </a>
            );
          })}
          <Link className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-black/20 text-zinc-500 transition hover:-translate-y-0.5 hover:border-orange-300/40 hover:text-orange-200 hover:shadow-[0_0_16px_rgba(251,146,60,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300" to="/admin/dashboard" aria-label="Platform admin access" title="Platform admin access">
            <Lock size={18} />
          </Link>
        </div>
      </div>
      <div className="page-shell border-t border-white/[0.08] py-5 text-xs uppercase tracking-[0.1em] text-zinc-600">
        Copyright {new Date().getFullYear()} {content.displayName}. All rights reserved.
      </div>
    </footer>
  );
}
