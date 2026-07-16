import { ExternalLink, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import useModalDrawer from '../../lib/useModalDrawer';

export default function AdminCommandPalette({ groups = [] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { panelRef, triggerRef } = useModalDrawer({ open, onClose: () => setOpen(false) });
  const commands = useMemo(() => groups.flatMap(([group, links]) => links.map(([label, href, Icon]) => ({ group, label, href, Icon }))), [groups]);
  const visibleCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return commands;
    return commands.filter(({ group, label }) => `${group} ${label}`.toLowerCase().includes(normalized));
  }, [commands, query]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    setOpen(false);
    setQuery('');
  }, [location.pathname]);

  function runCommand(href) {
    setOpen(false);
    setQuery('');
    navigate(href);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="admin-command-trigger hidden h-9 min-w-64 items-center gap-2 rounded-md border border-white/[0.1] bg-zinc-900 px-3 text-left text-sm text-zinc-500 transition hover:border-white/[0.18] hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50 lg:flex"
        aria-label="Open admin command palette"
      >
        <Search size={15} aria-hidden="true" />
        <span className="flex-1">Search pages and tools</span>
        <kbd className="rounded border border-white/[0.1] bg-zinc-950 px-1.5 py-0.5 text-[10px] text-zinc-500">Ctrl K</kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 px-4 pt-[max(6rem,12vh)]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="admin-command-title" className="w-full max-w-xl overflow-hidden rounded-lg border border-white/[0.13] bg-zinc-950 shadow-2xl shadow-black/50">
            <h2 id="admin-command-title" className="sr-only">Admin command palette</h2>
            <div data-search-shell className="flex items-center gap-3 border-b border-white/[0.1] px-4">
              <Search size={18} className="text-zinc-500" aria-hidden="true" />
              <input
                data-drawer-initial-focus
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Go to a page or tool…"
                className="h-14 min-w-0 flex-1 border-0 bg-transparent text-base text-white outline-none placeholder:text-zinc-600"
              />
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-md text-zinc-500 hover:bg-white/[0.06] hover:text-white" aria-label="Close command palette"><X size={17} /></button>
            </div>
            <div className="max-h-[min(28rem,60vh)] overflow-y-auto p-2">
              {visibleCommands.length ? visibleCommands.map(({ group, label, href, Icon }) => (
                <button key={href} type="button" onClick={() => runCommand(href)} className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition hover:bg-white/[0.06] focus-visible:bg-white/[0.06] focus-visible:outline-none">
                  <span className="grid h-8 w-8 place-items-center rounded-md border border-white/[0.08] bg-zinc-900 text-zinc-400 group-hover:text-amber-100"><Icon size={15} /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-zinc-200">{label}</span><span className="mt-0.5 block text-xs text-zinc-600">{group}</span></span>
                  <span className="text-xs text-zinc-700">Open</span>
                </button>
              )) : <p className="px-3 py-10 text-center text-sm text-zinc-500">No matching admin tools.</p>}
              <a href="/" target="_blank" rel="noreferrer noopener" className="group mt-2 flex items-center gap-3 border-t border-white/[0.08] px-3 py-3 text-sm text-zinc-400 hover:text-white">
                <span className="grid h-8 w-8 place-items-center rounded-md border border-white/[0.08] bg-zinc-900"><ExternalLink size={15} /></span>
                View public website
              </a>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
