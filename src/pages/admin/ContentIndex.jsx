import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminPageHeader } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { supabase } from '../../lib/supabaseClient';

const pages = [
  {
    key: 'home',
    title: 'Home',
    description: 'Hero copy, featured heading, services preview, and hero background settings.',
    editorPath: '/admin/content/home',
    publicPath: '/',
  },
  {
    key: 'about',
    title: 'About',
    description: 'About page heading, introduction, purpose, and platform positioning copy.',
    editorPath: '/admin/content/about',
    publicPath: '/about',
  },
  {
    key: 'services',
    title: 'Services',
    description: 'Services page heading, intro text, colors, and fallback service groups.',
    editorPath: '/admin/content/services',
    publicPath: '/services',
  },
  {
    key: 'contact',
    title: 'Contact',
    description: 'Contact page heading, description, CTA label, notes, and theme colors.',
    editorPath: '/admin/content/contact',
    publicPath: '/contact',
  },
];

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}

function LineButton({ children, to, href, onClick, subtle = false, external = false }) {
  const classes = `inline-flex h-10 items-center gap-2 border-b px-2 text-sm transition ${subtle ? 'border-white/[0.08] text-zinc-400 hover:border-amber-200/35 hover:text-white' : 'border-white/[0.12] text-zinc-300 hover:border-amber-200/40 hover:text-white'}`;

  if (to) return <Link to={to} className={classes}>{children}</Link>;
  if (href && !external) return <Link to={href} className={classes}>{children}</Link>;
  if (href) return <a href={href} target="_blank" rel="noreferrer noopener" className={classes}>{children}</a>;
  return <button type="button" onClick={onClick} className={classes}>{children}</button>;
}

export default function ContentIndex() {
  const [updatedAtByKey, setUpdatedAtByKey] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadMeta() {
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from('page_content')
        .select('page_key, updated_at')
        .in('page_key', pages.map((page) => page.key));

      if (!active) return;
      if (loadError) {
        setError(loadError.message || 'Page content metadata could not be loaded.');
        setLoading(false);
        return;
      }

      const next = Object.fromEntries((data || []).map((row) => [row.page_key, row.updated_at]));
      setUpdatedAtByKey(next);
      setLoading(false);
    }

    loadMeta();

    return () => {
      active = false;
    };
  }, []);

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow="Website CMS"
        title="Page Content"
        description="Edit public page copy and structured content without leaving the admin dashboard."
      />

      {error && <div className="mb-5 border-b border-red-300/30 py-3 text-sm text-red-100">{error}</div>}

      {loading ? (
        <LoadingState label="Loading page content" />
      ) : (
        <section className="border-y border-white/[0.08]">
          {pages.map((page, index) => (
            <article
              key={page.key}
              className={`grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_minmax(10rem,0.34fr)_auto] md:items-center ${index !== 0 ? 'border-t border-white/[0.06]' : ''}`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-semibold text-white">{page.title}</h2>
                  <span className="text-xs uppercase tracking-[0.18em] text-zinc-600">Controls {page.publicPath}</span>
                </div>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">{page.description}</p>
              </div>

              <div className="text-sm text-zinc-400">
                <span className="block text-xs uppercase tracking-[0.18em] text-zinc-600">Last updated</span>
                <span>{formatDate(updatedAtByKey[page.key]) || 'Not saved yet'}</span>
              </div>

              <div className="flex flex-wrap items-center gap-3 md:justify-end">
                <LineButton to={page.editorPath}>Edit</LineButton>
                <LineButton href={page.publicPath} subtle>Preview Page</LineButton>
                <LineButton href={page.publicPath} subtle external>Open Public Page</LineButton>
              </div>
            </article>
          ))}
        </section>
      )}
    </AdminLayout>
  );
}
