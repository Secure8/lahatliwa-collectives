import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';

const pages = [
  ['Home', '/admin/content/home', 'Hero copy, CTAs, featured heading, and services preview.'],
  ['About', '/admin/content/about', 'Page heading, intro, creative journey, skills, and tools.'],
  ['Services', '/admin/content/services', 'Service groups, descriptions, icon names, and service items.'],
  ['Contact', '/admin/content/contact', 'Contact heading, description, CTA text, and notes.'],
];

export default function ContentIndex() {
  return (
    <AdminLayout>
      <div className="mb-8">
        <p className="text-sm text-amber-200">Website CMS</p>
        <h1 className="mt-2 text-3xl font-bold">Page Content</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {pages.map(([title, href, description]) => (
          <Link key={href} to={href} className="rounded-lg border border-white/10 bg-zinc-900/70 p-5 transition hover:border-amber-300/50">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
          </Link>
        ))}
      </div>
    </AdminLayout>
  );
}
