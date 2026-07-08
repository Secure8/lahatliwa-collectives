import { Github, Instagram, Lock, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePublicContent } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';

export default function Footer() {
  const { content } = usePublicContent([]);
  const [hasSession, setHasSession] = useState(false);
  const github = content.socialLinks?.find((link) => link.label === 'GitHub');
  const instagram = content.socialLinks?.find((link) => link.label === 'Instagram');

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setHasSession(Boolean(data.session));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

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
          {instagram?.href && <a className="site-hover-accent border border-white/10 p-2 text-zinc-300 transition" href={instagram.href} aria-label="Instagram">
            <Instagram size={18} />
          </a>}
          {github?.href && <a className="site-hover-accent border border-white/10 p-2 text-zinc-300 transition" href={github.href} aria-label="GitHub">
            <Github size={18} />
          </a>}
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
