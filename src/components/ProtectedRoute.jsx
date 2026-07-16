import { useEffect, useState } from 'react';
import { Link, Navigate, Outlet } from 'react-router-dom';
import LoadingState from './LoadingState';
import BrandWordmark from './BrandWordmark';
import { AdminAccessProvider, isPrivilegedRole, normalizeRole } from '../lib/adminAccess';
import { PublicContentProvider } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';
import { claimSignedInTeamRecord, disabledTeamMessage, notInvitedMessage } from '../lib/teamInvite';
import { useAuthSession } from '../lib/authSession';
import { dashboardRedirectAllowed } from '../lib/authCallback';

export default function ProtectedRoute() {
  const { status: authStatus, session, authFlow } = useAuthSession();
  const [authorization, setAuthorization] = useState({ status: 'idle', adminUser: null, message: '' });

  useEffect(() => {
    let active = true;
    if (authStatus !== 'authenticated' || !session?.user) {
      setAuthorization({ status: 'idle', adminUser: null, message: '' });
      return () => { active = false; };
    }

    setAuthorization({ status: 'loading', adminUser: null, message: '' });
    async function checkAccess() {
      let { data, error: adminError } = await supabase
        .from('admin_users')
        .select('id, user_id, email, display_name, avatar_url, role, status, creative_member_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (!data && session.user.email) {
        const { data: claimedRecord, error: claimError, blockedReason } = await claimSignedInTeamRecord(session.user);

        if (claimedRecord) {
          data = claimedRecord;
        } else if (claimError) {
          adminError = claimError;
        } else if (blockedReason) {
          if (active) setAuthorization({ status: 'unauthorized', adminUser: null, message: blockedReason });
          return;
        }
      }

      if (!active) return;
      if (adminError) {
        setAuthorization({ status: 'error', adminUser: null, message: 'We could not verify admin access for this account. Please try signing in again or contact an authorized administrator.' });
      } else if (!data) {
        setAuthorization({ status: 'unauthorized', adminUser: null, message: notInvitedMessage });
      } else if (data.status === 'disabled') {
        setAuthorization({ status: 'unauthorized', adminUser: data, message: disabledTeamMessage });
      } else {
        setAuthorization({ status: 'authorized', adminUser: { ...data, role: normalizeRole(data.role) }, message: '' });
      }
    }
    checkAccess();
    return () => { active = false; };
  }, [authStatus, session?.user?.id]);

  if (!dashboardRedirectAllowed(authFlow)) return <Navigate to="/set-password" replace />;
  if (authStatus === 'initializing' || (authStatus === 'authenticated' && authorization.status !== 'authorized' && !['unauthorized', 'error'].includes(authorization.status))) {
    return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-12 text-white"><section className="w-full max-w-lg"><BrandWordmark variant="auth" to="/" /><div className="mt-8"><LoadingState label="Checking admin access" /></div></section></main>;
  }

  if (authStatus === 'unauthenticated') return <Navigate to="/admin/login" replace />;
  if (['unauthorized', 'error'].includes(authorization.status)) {
    return <AccessBlocked title="Admin access unavailable" message={authorization.message} email={session?.user?.email} />;
  }

  const adminUser = authorization.adminUser;
  const access = {
    session,
    user: session?.user || null,
    adminUser,
    role: normalizeRole(adminUser?.role),
    isPrivileged: isPrivilegedRole(adminUser?.role),
  };

  return (
    <AdminAccessProvider value={access}>
      <PublicContentProvider>
        <Outlet context={access} />
      </PublicContentProvider>
    </AdminAccessProvider>
  );
}

function AccessBlocked({ title, message, email }) {
  async function signOut() { await supabase.auth.signOut(); }
  return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-12 text-white"><section className="w-full max-w-lg"><BrandWordmark variant="auth" to="/" /><div className="mt-8 border-y border-white/[0.1] py-8"><p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Access check</p><h1 className="mt-3 text-2xl font-semibold">{title}</h1><p className="mt-4 text-sm leading-7 text-zinc-400">{message}</p>{email && <p className="mt-3 text-sm text-zinc-500">Signed in as <span className="text-zinc-300">{email}</span></p>}<div className="mt-6 flex flex-wrap gap-4"><button type="button" onClick={signOut} className="border-b border-amber-200/40 pb-1 text-sm text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50">Sign out</button><Link to="/" className="border-b border-white/[0.12] pb-1 text-sm text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50">Home</Link></div></div></section></main>;
}
