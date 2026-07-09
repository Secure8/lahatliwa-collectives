import { ArrowLeft, CheckCircle2, KeyRound, Lock, Mail, ShieldCheck, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { claimSignedInTeamRecord } from '../../lib/teamInvite';

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
  reset: {
    icon: Mail,
    title: 'Reset password',
    description: 'Send a secure reset link to your team email.',
  },
  updatePassword: {
    icon: KeyRound,
    title: 'Create new password',
    description: 'Enter a new password for your Lahat Liwa team account.',
  },
};

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

export default function Login() {
  const navigate = useNavigate();
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
  const isReset = mode === 'reset';
  const isUpdatePassword = mode === 'updatePassword';
  const passwordLabel = isSetup ? 'Create password' : 'Password';
  const canShowPassword = !isReset;

  const submitLabel = useMemo(() => {
    if (loading) {
      if (isSetup) return 'Setting up...';
      if (isReset) return 'Sending reset link...';
      if (isUpdatePassword) return 'Saving password...';
      return 'Logging in...';
    }
    if (isSetup) return 'Create password';
    if (isReset) return 'Send reset link';
    if (isUpdatePassword) return 'Save new password';
    return 'Login';
  }, [isReset, isSetup, isUpdatePassword, loading]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('updatePassword');
        setNotice('Password recovery verified. Create a new password below.');
        setError('');
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

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
    if (blockedReason) throw new Error(blockedReason);

    navigate('/admin/dashboard');
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
        emailRedirectTo: `${window.location.origin}/admin/login`,
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
      navigate('/admin/dashboard');
      return;
    }

    setNotice('Account setup started. Check your email to confirm your account, then log in here to finish.');
    setPassword('');
    setConfirmPassword('');
    setMode('login');
  }

  async function handleReset() {
    const normalizedEmail = normalizeEmail(email);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: `${window.location.origin}/admin/login`,
    });

    if (resetError) throw resetError;
    setNotice('Password reset link sent. Check your email for the secure reset link.');
  }

  async function handleUpdatePassword() {
    if (password.length < 8) {
      throw new Error('Use at least 8 characters for the password.');
    }
    if (password !== confirmPassword) {
      throw new Error('Passwords do not match.');
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) throw updateError;
    const { data: sessionData } = await supabase.auth.getSession();
    const { blockedReason, error: claimError } = await claimSignedInTeamRecord(sessionData.session?.user);
    if (claimError) throw claimError;
    if (blockedReason) throw new Error(blockedReason);
    navigate('/admin/dashboard');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');

    try {
      if (isSetup) await handleSetup();
      else if (isReset) await handleReset();
      else if (isUpdatePassword) await handleUpdatePassword();
      else await handleLogin();
    } catch (submitError) {
      setError(submitError.message || 'This request could not be completed right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,rgba(246,213,139,0.10),transparent_32%),linear-gradient(180deg,#101012,#09090b)] px-4 py-12">
      <section className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-amber-100">
          <ArrowLeft size={16} /> Back to site
        </Link>

        <form onSubmit={handleSubmit} className="mt-5 rounded-lg bg-white/[0.04] p-6 ring-1 ring-white/[0.075] backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-amber-300 text-zinc-950">
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

          {!isUpdatePassword && (
            <label className="mt-6 grid gap-2 text-sm text-zinc-300">
              Email
              <input
                className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition placeholder:text-zinc-600 focus:ring-amber-200/45"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
              />
            </label>
          )}

          {canShowPassword && (
            <label className="mt-4 grid gap-2 text-sm text-zinc-300">
              {passwordLabel}
              <input
                className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition placeholder:text-zinc-600 focus:ring-amber-200/45"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={isSetup || isUpdatePassword ? 8 : undefined}
                autoComplete={isSetup || isUpdatePassword ? 'new-password' : 'current-password'}
              />
            </label>
          )}

          {(isSetup || isUpdatePassword) && (
            <label className="mt-4 grid gap-2 text-sm text-zinc-300">
              Confirm password
              <input
                className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition placeholder:text-zinc-600 focus:ring-amber-200/45"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
          )}

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
                <button type="button" onClick={() => switchMode('reset')} className="text-left text-zinc-500 transition hover:text-amber-100">
                  Forgot password?
                </button>
              </>
            )}
            {mode === 'setup' && (
              <button type="button" onClick={() => switchMode('reset')} className="text-left text-zinc-500 transition hover:text-amber-100">
                Already set up but forgot your password?
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}
