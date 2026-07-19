import { Navigate } from 'react-router-dom';
import LoadingState from '../../components/LoadingState.jsx';
import NotFound from '../../pages/NotFound.jsx';
import { useAdminAccess } from '../../lib/adminAccess.jsx';
import { canAccessEditorial } from './editorialCapabilities.js';
import { useEditorialFlags } from './editorialFlags.js';

export function PublicEditorialGate({ children }) {
  const { flags, loading } = useEditorialFlags();
  if (loading) return <div className="page-shell py-20"><LoadingState label="Loading guide" /></div>;
  if (!flags.publicPortalEnabled) return <NotFound />;
  return children;
}

export function StudioEditorialGate({ children }) {
  const { role, editorialRoles } = useAdminAccess();
  const { flags, loading } = useEditorialFlags();
  if (loading) return <main className="grid min-h-screen place-items-center bg-zinc-950 text-white"><LoadingState label="Loading Editorial Studio" /></main>;
  if (!canAccessEditorial(editorialRoles?.length ? editorialRoles : role)) return <Navigate to="/admin/dashboard" replace />;
  if (!flags.editorialStudioEnabled) return <main className="grid min-h-screen place-items-center bg-zinc-950 px-5 text-white"><section className="max-w-lg border-y border-white/10 py-8"><p className="text-xs uppercase tracking-[0.2em] text-amber-200/70">Editorial Studio</p><h1 className="mt-3 text-2xl font-semibold">Studio is not enabled</h1><p className="mt-3 text-sm leading-6 text-zinc-400">The module is installed but its release flag is off. No editorial data or public routes have been enabled.</p></section></main>;
  return children;
}
