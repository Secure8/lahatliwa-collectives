import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Outlet } from 'react-router-dom';
import LoadingState from './LoadingState';
import { AdminAccessProvider, isPrivilegedRole, normalizeRole } from '../lib/adminAccess';
import { PublicContentProvider } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';
import { claimSignedInTeamRecord, disabledTeamMessage, notInvitedMessage } from '../lib/teamInvite';

export default function ProtectedRoute() {
  const sessionRef = useRef(null);
  const adminUserRef = useRef(null);
  const [session, setSession] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [blockedReason, setBlockedReason] = useState('');

  useEffect(() => {
    function updateSession(currentSession) {
      sessionRef.current = currentSession;
      setSession(currentSession);
    }

    function updateAdminUser(nextAdminUser) {
      adminUserRef.current = nextAdminUser;
      setAdminUser(nextAdminUser);
    }

    async function checkAccess(currentSession, { showLoading = false } = {}) {
      if (showLoading) setLoading(true);
      updateSession(currentSession);
      setError('');
      setBlockedReason('');

      if (!currentSession) {
        updateAdminUser(null);
        setLoading(false);
        return;
      }

      let { data, error: adminError } = await supabase
        .from('admin_users')
        .select('id, user_id, email, display_name, avatar_url, role, status, creative_member_id')
        .eq('user_id', currentSession.user.id)
        .maybeSingle();

      if (!data && currentSession.user.email) {
        const { data: claimedRecord, error: claimError, blockedReason: claimBlockedReason } = await claimSignedInTeamRecord(currentSession.user);

        if (claimedRecord) {
          data = claimedRecord;
        } else if (claimError) {
          adminError = claimError;
        } else if (claimBlockedReason) {
          setBlockedReason(claimBlockedReason);
        }
      }

      if (adminError) {
        updateAdminUser(null);
        setError('Admin allowlist is not configured yet. Run the Supabase security migrations and add your user to admin_users.');
      } else if (!data) {
        updateAdminUser(null);
        setBlockedReason(notInvitedMessage);
      } else if (data.status === 'disabled') {
        updateAdminUser(data);
        setBlockedReason(disabledTeamMessage);
      } else {
        updateAdminUser({ ...data, role: normalizeRole(data.role) });
      }
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      checkAccess(data.session, { showLoading: true });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, currentSession) => {
      const currentUserId = sessionRef.current?.user?.id;
      const nextUserId = currentSession?.user?.id;
      const sameSignedInUser = currentUserId && nextUserId && currentUserId === nextUserId && adminUserRef.current;

      if (['TOKEN_REFRESHED', 'USER_UPDATED'].includes(event) && currentSession) {
        updateSession(currentSession);
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_IN' && sameSignedInUser) {
        updateSession(currentSession);
        setLoading(false);
        return;
      }

      checkAccess(currentSession, { showLoading: event === 'SIGNED_OUT' || !adminUserRef.current });
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="page-shell py-20"><LoadingState label="Checking admin access" /></div>;
  }

  if (!session) return <Navigate to="/admin/login" replace />;
  if (error) {
    return <AccessBlocked title="Admin access unavailable" message="We could not verify admin access for this account. Please try signing in again or contact an authorized administrator." email={session?.user?.email} />;
  }
  if (blockedReason) {
    return <AccessBlocked title="Admin access unavailable" message={blockedReason} email={session?.user?.email} />;
  }

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
  return <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-12 text-white"><section className="w-full max-w-lg border-y border-white/[0.1] py-8"><p className="text-xs uppercase tracking-[0.2em] text-zinc-600">Access check</p><h1 className="mt-3 text-2xl font-semibold">{title}</h1><p className="mt-4 text-sm leading-7 text-zinc-400">{message}</p>{email && <p className="mt-3 text-sm text-zinc-500">Signed in as <span className="text-zinc-300">{email}</span></p>}<div className="mt-6 flex flex-wrap gap-4"><button type="button" onClick={signOut} className="border-b border-amber-200/40 pb-1 text-sm text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50">Sign out</button><Link to="/" className="border-b border-white/[0.12] pb-1 text-sm text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50">Return to public site</Link></div></section></main>;
}
