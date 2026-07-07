import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import clsx from 'clsx';
import { siteContent } from '../data/siteContent';

const links = [
  ['Home', '/'],
  ['About', '/about'],
  ['Projects', '/projects'],
  ['Services', '/services'],
  ['Contact', '/contact'],
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-zinc-950/75 backdrop-blur-xl">
      <nav className="page-shell flex min-h-16 items-center justify-between">
        <Link to="/" className="group flex items-center gap-3 font-medium tracking-wide">
          <span className="grid h-8 w-8 place-items-center border border-amber-200/50 text-xs font-semibold text-amber-100 transition group-hover:border-amber-100">{siteContent.initials}</span>
          <span>{siteContent.displayName}</span>
        </Link>
        <div className="hidden items-center gap-1 md:flex">
          {links.map(([label, href]) => (
            <NavLink
              key={href}
              to={href}
              className={({ isActive }) =>
                clsx(
                  'fine-link px-3 py-2 text-sm text-zinc-400 transition hover:text-white',
                  isActive && 'text-white',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
        <button className="p-2 text-zinc-200 md:hidden" onClick={() => setOpen((value) => !value)} aria-label="Toggle menu">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>
      {open && (
        <div className="page-shell grid gap-1 pb-4 md:hidden">
          {links.map(([label, href]) => (
            <NavLink key={href} to={href} onClick={() => setOpen(false)} className="border-b border-white/[0.06] py-3 text-zinc-200">
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
}
