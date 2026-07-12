import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';

const AuthSessionContext = createContext(null);

export function AuthSessionProvider({ children }) {
  const [state, setState] = useState({ status: 'initializing', session: null, event: 'INITIALIZING' });

  useEffect(() => {
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setState({
        status: session ? 'authenticated' : 'unauthenticated',
        session,
        event,
      });
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ ...state, user: state.session?.user || null }), [state]);
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error('useAuthSession must be used within AuthSessionProvider.');
  return context;
}
