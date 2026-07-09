import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminPageHeader, AdminSurface } from '../../components/admin/AdminUI';

const pages = [
  ['Home', '/admin/content/home', 'Hero copy, CTAs, featured heading, and services preview.'],
  ['About', '/admin/content/about', 'Page heading, intro, creative journey, skills, and tools.'],
  ['Services', '/admin/content/services', 'Service groups, descriptions, icon names, and service items.'],
  ['Contact', '/admin/content/contact', 'Contact heading, description, CTA text, and notes.'],
];

export default function ContentIndex() {
  return (
    <AdminLayout>
      <AdminPageHeader eyebrow="Website CMS" title="Page Content" description="Edit public page copy and structured content without leaving the studio control panel." />
      <div className="grid gap-4 md:grid-cols-2">
        {pages.map(([title, href, description]) => (
          <AdminSurface key={href} as={Link} to={href} className="transition hover:bg-white/[0.065] hover:ring-amber-200/20">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
          </AdminSurface>
        ))}
      </div>
    </AdminLayout>
  );
}
