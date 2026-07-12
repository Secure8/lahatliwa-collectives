import { ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { claimSignedInTeamRecord } from '../lib/teamInvite';
import { supabase } from '../lib/supabaseClient';
import { useAuthSession } from '../lib/authSession';
import PasswordField from '../components/auth/PasswordField';

export default function SetPassword() {
  const navigate = useNavigate();
  const { authFlow, session, finishAuthFlow } = useAuthSession();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function savePassword(event) {
    event.preventDefault();
    if (saving) return;
    setError('');
    if (password.length < 8) {
      setError('Use at least 8 characters for the password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { blockedReason, error: claimError } = await claimSignedInTeamRecord(session?.user);
      if (claimError) throw claimError;
      if (blockedReason) {
        await supabase.auth.signOut();
        throw new Error(blockedReason);
      }
      await supabase.auth.signOut({ scope: 'local' });
      finishAuthFlow();
      navigate('/admin/login?password_updated=1', { replace: true });
    } catch (saveError) {
      const message = String(saveError.message || '');
      const normalized = message.toLowerCase();
      setError(message === 'This email has not been invited to the Lahat Liwa team.' || message === 'Your team access has been disabled.'
        ? message
        : normalized.includes('same password')
          ? 'Choose a password you have not used for this account.'
          : normalized.includes('at least') || normalized.includes('characters')
            ? 'Use at least 8 characters for the password.'
            : 'Your password could not be saved. Request a new link and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-12 text-white">
      <section className="w-full max-w-md">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-amber-100">
          <ArrowLeft size={16} /> Back to site
        </Link>

        <div className="mt-5 border-y border-white/[0.1] py-7">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center bg-amber-300 text-zinc-950">
              <KeyRound size={20} />
            </span>
            <div>
              <h1 className="text-2xl font-semibold">Set your password</h1>
              <p className="mt-1 text-sm leading-6 text-zinc-400">Create a secure password for your Lahat Liwa team account.</p>
            </div>
          </div>

          {authFlow.startsWith('processing-') ? (
            <p className="mt-6 border-t border-white/[0.07] pt-6 text-sm text-zinc-400" role="status">Verifying your secure link...</p>
          ) : authFlow === 'invalid' ? (
            <div className="mt-6 border-t border-white/[0.07] pt-6">
              <p className="text-sm leading-6 text-red-100">{error || 'This password link is invalid or has expired. Request a new invitation or password reset link.'}</p>
              <div className="mt-5 flex flex-wrap gap-5"><Link to="/forgot-password" className="inline-flex border-b border-amber-200/40 pb-1 text-sm text-amber-100">Request a new reset link</Link><Link to="/admin/login" className="inline-flex border-b border-white/[0.12] pb-1 text-sm text-zinc-300">Return to Admin Login</Link></div>
            </div>
          ) : authFlow === 'setting-password' ? (
            <form onSubmit={savePassword} className="mt-6">
              {error && <div className="mb-5 rounded-md bg-red-300/10 p-3 text-sm leading-6 text-red-100 ring-1 ring-red-300/20" role="alert">{error}</div>}
              <PasswordField label="New password" value={password} onChange={setPassword} minLength={8} autoComplete="new-password" disabled={saving} />
              <div className="mt-4"><PasswordField label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} minLength={8} autoComplete="new-password" disabled={saving} /></div>
              <button disabled={saving} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-amber-300 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60">
                <ShieldCheck size={17} /> {saving ? 'Saving password...' : 'Save password'}
              </button>
            </form>
          ) : <p className="mt-6 border-t border-white/[0.07] pt-6 text-sm text-zinc-400" role="status">Completing authentication...</p>}
        </div>
      </section>
    </main>
  );
}
