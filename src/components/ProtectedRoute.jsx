import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import LoadingState from './LoadingState';
import { AdminAccessProvider, isPrivilegedRole, normalizeRole } from '../lib/adminAccess';
import { PublicContentProvider } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';

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
        const { data: claimedRecord } = await supabase
          .rpc('claim_team_invite')
          .maybeSingle();

        if (claimedRecord) {
          data = claimedRecord;
        }
      }

      if (!data && currentSession.user.email) {
        const { data: emailRecord } = await supabase
          .from('admin_users')
          .select('id, user_id, email, display_name, avatar_url, role, status, creative_member_id')
          .ilike('email', currentSession.user.email)
          .maybeSingle();

        if (emailRecord && !emailRecord.user_id && emailRecord.status === 'invited') {
          const { data: claimedRecord } = await supabase
            .from('admin_users')
            .update({
              user_id: currentSession.user.id,
              email: currentSession.user.email,
              status: emailRecord.status === 'invited' ? 'active' : emailRecord.status,
              updated_at: new Date().toISOString(),
            })
            .eq('id', emailRecord.id)
            .select('id, user_id, email, display_name, avatar_url, role, status, creative_member_id')
            .maybeSingle();
          data = claimedRecord || emailRecord;
        } else {
          data = emailRecord;
        }
      }

      if (adminError) {
        updateAdminUser(null);
        setError('Admin allowlist is not configured yet. Run the Supabase security migrations and add your user to admin_users.');
      } else if (!data) {
        updateAdminUser(null);
        setBlockedReason('This account is signed in but is not on the team allowlist.');
      } else if (data.status === 'disabled') {
        updateAdminUser(data);
        setBlockedReason('Access disabled. Ask a Super Admin to reactivate this account.');
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
    return (
      <div className="page-shell py-20">
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-5 text-sm leading-6 text-red-100">{error}</div>
      </div>
    );
  }
  if (blockedReason) {
    return (
      <div className="page-shell py-20">
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-5 text-sm leading-6 text-red-100">{blockedReason}</div>
      </div>
    );
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
