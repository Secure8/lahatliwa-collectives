import { Github, Instagram, Lock, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { siteContent } from '../data/siteContent';

export default function Footer() {
  return (
    <footer className="mt-28 border-t border-white/[0.07]">
      <div className="page-shell grid gap-10 py-12 md:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="text-lg font-semibold">{siteContent.displayName}</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
            The public creative portfolio of {siteContent.legalName}, made for visual work, digital builds, and useful project experiments.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3 md:justify-end">
          <a className="border border-white/10 p-2 text-zinc-300 transition hover:border-amber-300/60 hover:text-amber-200" href={`mailto:${siteContent.email}`} aria-label="Email">
            <Mail size={18} />
          </a>
          <a className="border border-white/10 p-2 text-zinc-300 transition hover:border-amber-300/60 hover:text-amber-200" href={siteContent.socialLinks[0].href} aria-label="Instagram">
            <Instagram size={18} />
          </a>
          <a className="border border-white/10 p-2 text-zinc-300 transition hover:border-amber-300/60 hover:text-amber-200" href={siteContent.socialLinks[1].href} aria-label="GitHub">
            <Github size={18} />
          </a>
          <Link className="border border-white/10 p-2 text-zinc-500 transition hover:border-white/20 hover:text-zinc-300" to="/admin/login" aria-label="Admin">
            <Lock size={18} />
          </Link>
        </div>
      </div>
      <div className="page-shell border-t border-white/[0.07] py-5 text-sm text-zinc-500">
        Copyright {new Date().getFullYear()} {siteContent.displayName}. All rights reserved.
      </div>
    </footer>
  );
}
