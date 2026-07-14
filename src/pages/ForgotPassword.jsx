import { ArrowLeft, CheckCircle2, Mail, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import LoadingState from '../components/LoadingState';
import { teamPasswordRedirectUrl } from '../lib/authRedirects';
import { useAuthSession } from '../lib/authSession';
import { supabase } from '../lib/supabaseClient';
import { dashboardRedirectAllowed } from '../lib/authCallback';
import { ActionFeedback, FieldError } from '../components/FieldFeedback';

export default function ForgotPassword() {
  const { status, authFlow } = useAuthSession();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [fieldError, setFieldError] = useState('');
  const [actionError, setActionError] = useState('');
  const [sent, setSent] = useState(false);
  const emailRef = useRef(null);

  if (status === 'initializing') return <div className="page-shell py-20"><LoadingState label="Restoring session" /></div>;
  if (!dashboardRedirectAllowed(authFlow)) return <Navigate to="/set-password" replace />;
  if (status === 'authenticated') return <Navigate to="/admin/dashboard" replace />;

  async function submit(event) {
    event.preventDefault();
    if (sending) return;
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setFieldError('Please enter a valid team email address.');
      emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      emailRef.current?.focus({ preventScroll: true });
      return;
    }
    setSending(true);
    setActionError('');
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: teamPasswordRedirectUrl(window.location.origin),
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (submitError) {
      setActionError(submitError.status === 429
        ? 'Too many email requests were made. Please wait before trying again.'
        : 'The reset email could not be sent. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-950 px-4 py-12 text-white">
      <section className="w-full max-w-md">
        <Link to="/admin/login" className="inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-amber-100"><ArrowLeft size={16} /> Back to login</Link>
        <div className="mt-5 border-y border-white/[0.1] py-7">
          <div className="flex items-start gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center bg-amber-300 text-zinc-950"><Mail size={20} /></span><div><h1 className="text-2xl font-semibold">Reset password</h1><p className="mt-1 text-sm leading-6 text-zinc-400">We will send a secure password link to your team email.</p></div></div>
          {sent ? <div className="mt-6 border-t border-white/[0.07] pt-6"><p className="flex gap-2 text-sm leading-6 text-emerald-100" role="status"><CheckCircle2 className="mt-0.5 shrink-0" size={17} /> Reset link sent. Check your inbox and use the newest email. The link will open the password setup page.</p><Link to="/admin/login" className="mt-5 inline-flex border-b border-amber-200/40 pb-1 text-sm text-amber-100">Return to login</Link></div> : <form onSubmit={submit} noValidate className="mt-6"><label className="grid gap-2 text-sm text-zinc-300" htmlFor="reset-email"><span>Email</span><input ref={emailRef} id="reset-email" className="rounded-md border border-white/[0.14] bg-white/[0.035] px-3 py-3 text-white outline-none transition hover:border-amber-200/25 focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/20 aria-[invalid=true]:border-red-300/60 aria-[invalid=true]:focus:ring-red-300/20" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setFieldError(''); setActionError(''); }} required autoComplete="email" disabled={sending} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'reset-email-error' : undefined} /><FieldError id="reset-email-error">{fieldError}</FieldError></label><ActionFeedback error={actionError} className="mt-5" /><button disabled={sending} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-amber-300 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"><Send size={17} /> {sending ? 'Sending reset link...' : 'Send reset link'}</button></form>}
        </div>
      </section>
    </main>
  );
}
