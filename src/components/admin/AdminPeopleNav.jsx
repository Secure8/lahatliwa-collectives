import { UserCog, Users } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';

const peopleViews = [
  {
    to: '/admin/creatives',
    label: 'Creative profiles',
    description: 'Public identity and portfolio visibility',
    icon: Users,
  },
  {
    to: '/admin/team',
    label: 'Team access',
    description: 'Sign-in access, roles, and permissions',
    icon: UserCog,
  },
];

export default function AdminPeopleNav() {
  const { pathname } = useLocation();

  return (
    <nav aria-label="People management" className="admin-people-nav mb-6 flex flex-wrap items-center gap-1 border-b border-white/[0.1]">
      <p className="mr-3 hidden py-3 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-zinc-600 sm:block">People views</p>
      <div className="grid w-full grid-cols-2 gap-1 overflow-x-auto sm:flex sm:w-auto">
        {peopleViews.map(({ to, label, description, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <NavLink
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={clsx(
                'relative flex h-11 min-w-0 shrink-0 items-center justify-center gap-1.5 border-b-2 px-2 text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50 sm:gap-2 sm:px-3 sm:text-sm',
                active
                  ? 'border-amber-300 text-white'
                  : 'border-transparent text-zinc-500 hover:border-white/[0.18] hover:text-white',
              )}
            >
              <span className={clsx('grid h-7 w-7 shrink-0 place-items-center rounded-md', active ? 'bg-amber-200/10 text-amber-100' : 'text-zinc-600')}>
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className="font-medium" title={description}>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
