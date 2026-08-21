import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { claimSignedInTeamRecord } from '../../lib/teamInvite';
import { teamPasswordRedirectUrl } from '../../lib/authRedirects';
import { useAuthSession } from '../../lib/authSession';
import PasswordField from '../../components/auth/PasswordField';
import LoadingState from '../../components/LoadingState';
import { dashboardRedirectAllowed } from '../../lib/authCallback';
import { ActionFeedback, FieldError } from '../../components/FieldFeedback';

const modeCopy = {
  login: {
    title: 'Login',
    description: 'Sign in to open your Creative profile or platform workspace.',
  },
  setup: {
    title: 'Sign up',
    description: 'Create a password for your approved account.',
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
  const { status: authStatus, authFlow } = useAuthSession();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState(() => new URLSearchParams(window.location.search).get('password_updated') === '1' ? 'Password saved. Sign in with your new password.' : '');
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const currentCopy = modeCopy[mode] || modeCopy.login;
  const isSetup = mode === 'setup';
  const passwordLabel = isSetup ? 'Create password' : 'Password';

  const submitLabel = useMemo(() => {
    if (loading) {
      if (isSetup) return 'Setting up...';
      return 'Signing in...';
    }
    if (isSetup) return 'Create password';
    return 'Sign in';
  }, [isSetup, loading]);

  if (authStatus === 'initializing') return <div className="page-shell py-20"><LoadingState label="Restoring session" /></div>;
  if (!dashboardRedirectAllowed(authFlow)) return <Navigate to="/set-password" replace />;
  if (authStatus === 'authenticated' && !loading) return <Navigate to="/account" replace />;

  function switchMode(nextMode) {
    setMode(nextMode);
    setFieldErrors({});
    setActionError('');
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

    navigate('/account', { replace: true });
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
      navigate('/account', { replace: true });
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
    const nextErrors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) nextErrors.email = 'Please enter a valid platform account email address.';
    if (!password) nextErrors.password = 'Please enter your password.';
    else if (isSetup && password.length < 8) nextErrors.password = 'Please use at least 8 characters for the password.';
    if (isSetup && password !== confirmPassword) nextErrors.confirmPassword = 'The passwords do not match. Please enter them again.';
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      const first = Object.keys(nextErrors)[0];
      ({ email: emailRef, password: passwordRef, confirmPassword: confirmRef })[first].current?.focus();
      return;
    }
    setLoading(true);
    setActionError('');
    setNotice('');

    try {
      if (isSetup) await handleSetup();
      else await handleLogin();
    } catch (submitError) {
      setActionError(safeAuthMessage(submitError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ll-auth-page ll-login-page">
      <section className="ll-auth-card ll-login-card">
        <Link to="/" className="ll-auth-back ll-login-back">
          <ArrowLeft size={16} /> Back
        </Link>
        <form onSubmit={handleSubmit} className="ll-auth-form ll-login-form">
          <header className="ll-login-heading">
            <span className="ll-login-heading__icon" aria-hidden="true"><UserRound size={29} strokeWidth={1.5} /></span>
            <p className="ll-login-eyebrow">Member access</p>
            <h1>{currentCopy.title}</h1>
            <p>{currentCopy.description}</p>
          </header>

          <div className="ll-login-fields">
          <label className="ll-login-field" htmlFor="team-email">
              <span>Email</span>
              <span className="ll-login-control">
                <Mail size={18} aria-hidden="true" />
                <input
                  ref={emailRef}
                  id="team-email"
                  className="ll-login-input"
                  type="email"
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); setFieldErrors((current) => ({ ...current, email: '' })); setActionError(''); }}
                  required
                  autoComplete="email"
                  disabled={loading}
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={fieldErrors.email ? 'team-email-error' : undefined}
                />
              </span>
              <FieldError id="team-email-error">{fieldErrors.email}</FieldError>
          </label>

          <PasswordField className="ll-login-field" inputClassName="ll-login-input" leadingIcon={<LockKeyhole size={18} />} inputRef={passwordRef} label={passwordLabel} value={password} onChange={(value) => { setPassword(value); setFieldErrors((current) => ({ ...current, password: '' })); setActionError(''); }} error={fieldErrors.password} minLength={isSetup ? 8 : undefined} autoComplete={isSetup ? 'new-password' : 'current-password'} disabled={loading} />

          {isSetup && <PasswordField className="ll-login-field" inputClassName="ll-login-input" leadingIcon={<LockKeyhole size={18} />} inputRef={confirmRef} label="Confirm password" value={confirmPassword} onChange={(value) => { setConfirmPassword(value); setFieldErrors((current) => ({ ...current, confirmPassword: '' })); setActionError(''); }} error={fieldErrors.confirmPassword} minLength={8} autoComplete="new-password" disabled={loading} />}
          </div>

          {isSetup && (
            <p className="mt-4 text-xs leading-5 text-zinc-500">
              This sign-in is only for approved platform members. Your email must already have an invitation or active access.
            </p>
          )}

          {notice && <div className="mt-5 flex gap-3 rounded-md bg-emerald-300/10 p-3 text-sm leading-6 text-emerald-100 ring-1 ring-emerald-300/20" role="status"><CheckCircle2 className="mt-0.5 shrink-0" size={17} /><span>{notice}</span></div>}
          <ActionFeedback error={actionError} className="mt-5" />

          <button disabled={loading} className="ll-primary-action ll-auth-submit ll-login-submit">
            <span>{submitLabel}</span><ArrowRight size={18} />
          </button>

          <div className="ll-auth-links">
            {mode !== 'login' && (
              <button type="button" onClick={() => switchMode('login')}>
                Sign in
              </button>
            )}
            {mode === 'login' && (
              <>
                <Link to="/join">Request to join</Link>
                <button type="button" onClick={() => switchMode('setup')}>
                  Set up an approved account
                </button>
                <Link to="/forgot-password">Forgot password?</Link>
              </>
            )}
            {mode === 'setup' && <Link to="/forgot-password">Forgot password?</Link>}
          </div>
        </form>
      </section>
    </main>
  );
}
