import { Facebook, Github, Globe, Instagram, Linkedin, Lock, Mail, Music2, Youtube } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePublicContent } from '../lib/contentApi';
import { useAuthSession } from '../lib/authSession';

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
  const { status: authStatus } = useAuthSession();
  const hasSession = authStatus === 'authenticated';
  const socialLinks = content.socialLinks || [];

  return (
    <footer className="major-border-top mt-28">
      <div className="page-shell grid gap-10 py-12 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-lg font-semibold">{content.displayName}</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">{content.footerText}</p>
        </div>
        <div className="flex flex-wrap items-start gap-3 md:justify-end">
          {content.email && <a className="site-hover-accent border border-white/10 p-2 text-zinc-300 transition" href={`mailto:${content.email}`} aria-label="Email">
            <Mail size={18} />
          </a>}
          {socialLinks.map((link) => {
            const Icon = socialIconMap[link.label] || Globe;
            return (
              <a key={`${link.label}-${link.href}`} className="site-hover-accent border border-white/10 p-2 text-zinc-300 transition" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label}>
                <Icon size={18} />
              </a>
            );
          })}
          {hasSession && <Link className="border border-white/10 p-2 text-zinc-500 transition hover:border-white/20 hover:text-zinc-300" to="/admin/dashboard" aria-label="Admin dashboard">
            <Lock size={18} />
          </Link>}
        </div>
      </div>
      <div className="page-shell major-border-top py-5 text-sm text-zinc-500">
        Copyright {new Date().getFullYear()} {content.displayName}. All rights reserved.
      </div>
    </footer>
  );
}
