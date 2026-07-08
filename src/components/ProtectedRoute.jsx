import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import LoadingState from './LoadingState';
import { supabase } from '../lib/supabaseClient';

export default function ProtectedRoute() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function checkAccess(currentSession) {
      setSession(currentSession);
      setError('');

      if (!currentSession) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      const { data, error: adminError } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', currentSession.user.id)
        .maybeSingle();

      if (adminError) {
        setIsAdmin(false);
        setError('Admin allowlist is not configured yet. Run the Supabase security migrations and add your user to admin_users.');
      } else {
        setIsAdmin(Boolean(data));
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
  if (!isAdmin) {
    return (
      <div className="page-shell py-20">
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 p-5 text-sm leading-6 text-red-100">This account is signed in but is not on the admin allowlist.</div>
      </div>
    );
  }

  return <Outlet />;
}
