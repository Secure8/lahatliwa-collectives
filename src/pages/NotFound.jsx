import { ArrowLeft, FolderOpen } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="page-shell grid min-h-[60vh] place-items-center py-20" aria-labelledby="not-found-heading">
      <div className="w-full max-w-2xl border-y border-white/[0.1] py-12">
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--site-accent-text)]">Page unavailable</p>
        <h1 id="not-found-heading" className="mt-4 text-4xl font-semibold text-[var(--site-primary-text)] sm:text-5xl">This page is not available.</h1>
        <p className="mt-5 max-w-xl leading-7 text-[var(--site-secondary-text)]">The address may be outdated or incomplete. Return home or continue browsing the published work.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/" className="inline-flex min-h-11 items-center gap-2 bg-[var(--site-accent)] px-5 text-sm font-semibold text-zinc-950 transition hover:bg-[var(--site-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <ArrowLeft size={17} aria-hidden="true" /> Return home
          </Link>
          <Link to="/projects" className="inline-flex min-h-11 items-center gap-2 border border-white/[0.14] px-5 text-sm font-semibold text-[var(--site-primary-text)] transition hover:border-[var(--site-accent-border)] hover:text-[var(--site-accent-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
            <FolderOpen size={17} aria-hidden="true" /> View projects
          </Link>
        </div>
      </div>
    </section>
  );
}
