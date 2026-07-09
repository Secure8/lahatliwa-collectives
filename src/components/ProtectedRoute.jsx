import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import LoadingState from './LoadingState';
import { AdminAccessProvider, isPrivilegedRole, normalizeRole } from '../lib/adminAccess';
import { PublicContentProvider } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';

export default function ProtectedRoute() {
  const [session, setSession] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [blockedReason, setBlockedReason] = useState('');

  useEffect(() => {
    async function checkAccess(currentSession) {
      setSession(currentSession);
      setError('');
      setBlockedReason('');

      if (!currentSession) {
        setAdminUser(null);
        setLoading(false);
        return;
      }

      let { data, error: adminError } = await supabase
        .from('admin_users')
        .select('id, user_id, email, display_name, avatar_url, role, status, creative_member_id')
        .eq('user_id', currentSession.user.id)
        .maybeSingle();

      if (!data && currentSession.user.email) {
        const { data: emailRecord } = await supabase
          .from('admin_users')
          .select('id, user_id, email, display_name, avatar_url, role, status, creative_member_id')
          .ilike('email', currentSession.user.email)
          .maybeSingle();

        if (emailRecord && !emailRecord.user_id) {
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
        setAdminUser(null);
        setError('Admin allowlist is not configured yet. Run the Supabase security migrations and add your user to admin_users.');
      } else if (!data) {
        setAdminUser(null);
        setBlockedReason('This account is signed in but is not on the team allowlist.');
      } else if (data.status === 'disabled') {
        setAdminUser(data);
        setBlockedReason('Access disabled. Ask a Super Admin to reactivate this account.');
      } else {
        setAdminUser({ ...data, role: normalizeRole(data.role) });
      }
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      checkAccess(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setLoading(true);
      checkAccess(currentSession);
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
