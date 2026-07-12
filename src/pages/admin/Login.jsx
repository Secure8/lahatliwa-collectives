import { ArrowLeft, CheckCircle2, Lock, ShieldCheck, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { claimSignedInTeamRecord } from '../../lib/teamInvite';
import { teamPasswordRedirectUrl } from '../../lib/authRedirects';
import { useAuthSession } from '../../lib/authSession';
import PasswordField from '../../components/auth/PasswordField';
import LoadingState from '../../components/LoadingState';

const modeCopy = {
  login: {
    icon: Lock,
    title: 'Admin Login',
    description: 'Use your Lahat Liwa team account.',
  },
  setup: {
    icon: UserPlus,
    title: 'Set up team account',
    description: 'Create a password only if your email was invited by the team.',
  },
};

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function safeAuthMessage(authError) {
  const original = String(authError?.message || '');
  const message = original.toLowerCase();
  if (original === 'This email has not been invited to the Lahat Liwa team.' || original === 'Your team access has been disabled.') return original;
  if (message.includes('invalid login credentials')) return 'The email or password is incorrect.';
  if (message.includes('email not confirmed')) return 'Confirm your email before signing in.';
  if (message.includes('already registered') || message.includes('already exists')) return 'An account already exists for this email. Sign in or reset its password.';
  if (message.includes('rate') || authError?.status === 429) return 'Too many authentication requests were made. Please wait before trying again.';
  if (message.includes('at least') || message.includes('passwords do not match')) return original;
  return 'This request could not be completed right now. Check your connection and try again.';
}

export default function Login() {
  const navigate = useNavigate();
  const { status: authStatus } = useAuthSession();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const currentCopy = modeCopy[mode] || modeCopy.login;
  const HeaderIcon = currentCopy.icon;
  const isSetup = mode === 'setup';
  const passwordLabel = isSetup ? 'Create password' : 'Password';

  const submitLabel = useMemo(() => {
    if (loading) {
      if (isSetup) return 'Setting up...';
      return 'Logging in...';
    }
    if (isSetup) return 'Create password';
    return 'Login';
  }, [isSetup, loading]);

  if (authStatus === 'initializing') return <div className="page-shell py-20"><LoadingState label="Restoring session" /></div>;
  if (authStatus === 'authenticated' && !loading) return <Navigate to="/admin/dashboard" replace />;

  function switchMode(nextMode) {
    setMode(nextMode);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmPassword('');
  }

  async function handleLogin() {
    const normalizedEmail = normalizeEmail(email);
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (loginError) throw loginError;

    const { blockedReason, error: claimError } = await claimSignedInTeamRecord(loginData.user);
    if (claimError) throw claimError;
    if (blockedReason) {
      await supabase.auth.signOut();
      throw new Error(blockedReason);
    }

    navigate('/admin/dashboard', { replace: true });
  }

  async function handleSetup() {
    const normalizedEmail = normalizeEmail(email);

    if (password.length < 8) {
      throw new Error('Use at least 8 characters for the password.');
    }
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    const { data: signupData, error: signupError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: teamPasswordRedirectUrl(window.location.origin),
      },
    });

    if (signupError) throw signupError;

    if (signupData.session) {
      const { blockedReason, error: claimError } = await claimSignedInTeamRecord(signupData.user);
      if (claimError) throw claimError;
      if (blockedReason) {
        await supabase.auth.signOut();
        throw new Error(blockedReason);
      }
      navigate('/admin/dashboard', { replace: true });
      return;
    }

    setNotice('Account setup started. Check your email to confirm your account, then log in here to finish.');
    setPassword('');
    setConfirmPassword('');
    setMode('login');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    setNotice('');

    try {
      if (isSetup) await handleSetup();
      else await handleLogin();
    } catch (submitError) {
      setError(safeAuthMessage(submitError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-12">
      <section className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-amber-100">
          <ArrowLeft size={16} /> Back to site
        </Link>

        <form onSubmit={handleSubmit} className="mt-5 border-y border-white/[0.1] py-7">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center bg-amber-300 text-zinc-950">
              <HeaderIcon size={20} />
            </span>
            <div>
              <h1 className="text-2xl font-semibold text-white">{currentCopy.title}</h1>
              <p className="mt-1 text-sm leading-6 text-zinc-400">{currentCopy.description}</p>
            </div>
          </div>

          {notice && (
            <div className="mt-5 flex gap-3 rounded-md bg-emerald-300/10 p-3 text-sm leading-6 text-emerald-100 ring-1 ring-emerald-300/20">
              <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
              <span>{notice}</span>
            </div>
          )}
          {error && <div className="mt-5 rounded-md bg-red-300/10 p-3 text-sm leading-6 text-red-100 ring-1 ring-red-300/20">{error}</div>}

          <label className="mt-6 grid gap-2 text-sm text-zinc-300">
              Email
              <input
                className="rounded-md border border-white/[0.14] bg-white/[0.035] px-3 py-3 text-white outline-none transition placeholder:text-zinc-600 hover:border-amber-200/25 focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                disabled={loading}
              />
          </label>

          <div className="mt-4"><PasswordField label={passwordLabel} value={password} onChange={setPassword} minLength={isSetup ? 8 : undefined} autoComplete={isSetup ? 'new-password' : 'current-password'} disabled={loading} /></div>

          {isSetup && <div className="mt-4"><PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} minLength={8} autoComplete="new-password" disabled={loading} /></div>}

          {isSetup && (
            <p className="mt-4 text-xs leading-5 text-zinc-500">
              This is only for invited Lahat Liwa team members. The email must already exist in Team Management with an invited or active status.
            </p>
          )}

          <button disabled={loading} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-amber-300 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:opacity-60">
            <ShieldCheck size={17} /> {submitLabel}
          </button>

          <div className="mt-5 grid gap-3 border-t border-white/[0.07] pt-5 text-sm">
            {mode !== 'login' && (
              <button type="button" onClick={() => switchMode('login')} className="text-left text-zinc-400 transition hover:text-amber-100">
                Return to normal login
              </button>
            )}
            {mode === 'login' && (
              <>
                <button type="button" onClick={() => switchMode('setup')} className="text-left text-zinc-300 transition hover:text-amber-100">
                  Set up team account
                </button>
                <Link to="/forgot-password" className="text-left text-zinc-500 transition hover:text-amber-100">Forgot password?</Link>
              </>
            )}
            {mode === 'setup' && <Link to="/forgot-password" className="text-left text-zinc-500 transition hover:text-amber-100">Already set up but forgot your password?</Link>}
          </div>
        </form>
      </section>
    </main>
  );
}
