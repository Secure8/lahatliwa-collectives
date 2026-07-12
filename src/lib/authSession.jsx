import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { initialAuthFlow, readAuthCallback } from './authCallback';

const AuthSessionContext = createContext(null);

export function AuthSessionProvider({ children }) {
  const [callback] = useState(() => readAuthCallback(window.location));
  const [state, setState] = useState(() => ({ status: 'initializing', session: null, event: 'INITIALIZING', authFlow: initialAuthFlow(callback) }));

  useEffect(() => {
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setState((current) => ({
        status: session ? 'authenticated' : 'unauthenticated',
        session,
        event,
        authFlow: current.authFlow,
      }));
    });

    async function processCallback() {
      if (!callback.isPasswordRoute || ['none', 'complete', 'invalid'].includes(initialAuthFlow(callback))) return;
      try {
        const { data: existing } = await supabase.auth.getSession();
        if (existing.session) await supabase.auth.signOut({ scope: 'local' });
        let result;
        if (callback.code) {
          result = await supabase.auth.exchangeCodeForSession(callback.code);
        } else if (callback.accessToken && callback.refreshToken) {
          result = await supabase.auth.setSession({ access_token: callback.accessToken, refresh_token: callback.refreshToken });
        } else if (callback.tokenHash && ['invite', 'recovery'].includes(callback.type)) {
          result = await supabase.auth.verifyOtp({ token_hash: callback.tokenHash, type: callback.type });
        } else {
          throw new Error('Unsupported authentication callback.');
        }
        if (result.error || !result.data?.session?.user) throw result.error || new Error('Authentication callback did not create a session.');
        if (!active) return;
        setState({ status: 'authenticated', session: result.data.session, event: callback.type === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN', authFlow: 'setting-password' });
      } catch {
        if (active) setState({ status: 'unauthenticated', session: null, event: 'CALLBACK_ERROR', authFlow: 'invalid' });
      }
    }
    processCallback();

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [callback]);

  const value = useMemo(() => ({
    ...state,
    user: state.session?.user || null,
    finishAuthFlow: () => setState((current) => ({ ...current, authFlow: 'none' })),
  }), [state]);
  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) throw new Error('useAuthSession must be used within AuthSessionProvider.');
  return context;
}
