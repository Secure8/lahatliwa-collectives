import { ArrowRight, Facebook, Github, Globe, Instagram, Linkedin, Mail, MessageCircle, Music2, Youtube } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePublicContent } from '../lib/contentApi';

const defaultFooterLogo = '/brand/liwa-collectives-v2.png';

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
    <footer className="public-footer mt-28 border-t border-[var(--site-accent-border)]">
      <div className="page-shell grid gap-10 py-12 md:grid-cols-[1.4fr_1fr] md:py-14">
        <div className="ll-footer-lockup">
          <Link className="ll-footer-logo" to="/" aria-label={`${content.displayName || 'Liwa Collectives'} home`}>
            <img src={content.footerLogoUrl || defaultFooterLogo} alt={content.footerLogoAlt || `${content.displayName || 'Liwa Collectives'} full logo`} loading="lazy" decoding="async" />
          </Link>
          <p className="ll-footer-tagline">{content.tagline}</p>
        </div>
        <div className="ll-footer-contact">
          <Link className="ll-footer-message" to="/inquiry?kind=platform">
            <MessageCircle size={18} aria-hidden="true" />
            <span>Message Lahat Liwa</span>
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <div className="ll-footer-socials" aria-label="Contact and social links">
            {content.email && <a className="site-hover-accent grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-black/20 text-zinc-300 transition hover:-translate-y-0.5 hover:border-orange-300/40 hover:shadow-[0_0_16px_rgba(251,146,60,0.24)]" href={`mailto:${content.email}`} aria-label="Email">
              <Mail size={18} />
            </a>}
            {socialLinks.map((link) => {
              const Icon = socialIconMap[link.label] || Globe;
              return (
                <a key={`${link.label}-${link.href}`} className="site-hover-accent grid h-11 w-11 place-items-center rounded-lg border border-white/10 bg-black/20 text-zinc-300 transition hover:-translate-y-0.5 hover:border-orange-300/40 hover:shadow-[0_0_16px_rgba(251,146,60,0.24)]" href={link.href} target="_blank" rel="noopener noreferrer" aria-label={link.label}>
                  <Icon size={18} />
                </a>
              );
            })}
          </div>
        </div>
      </div>
      <div className="page-shell flex flex-wrap items-center justify-between gap-3 border-t border-[var(--theme-border)] py-5 text-xs tracking-[0.06em] text-[var(--site-muted-text)]">
        <span>© {new Date().getFullYear()} {content.displayName}. All rights reserved.</span>
        <Link className="inline-flex min-h-11 items-center transition hover:text-[var(--site-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]" to="/privacy">{content.privacyLabel || 'Privacy Policy'}</Link>
      </div>
    </footer>
  );
}
