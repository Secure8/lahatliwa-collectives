import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import LoadingState from './LoadingState';
import { supabase } from '../lib/supabaseClient';

export default function ProtectedRoute() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div className="page-shell py-20"><LoadingState label="Checking admin access" /></div>;
  }

  if (!session) return <Navigate to="/admin/login" replace />;

  return <Outlet />;
}
