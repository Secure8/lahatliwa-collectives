import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const emptyForm = { name: '', email: '', portfolioUrl: '', message: '' };

export default function JoinCreative() {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError('');
    const { error: requestError } = await supabase.rpc('submit_creative_join_request', {
      p_name: form.name,
      p_email: form.email,
      p_portfolio_url: form.portfolioUrl || null,
      p_message: form.message || null,
    });
    if (requestError) setError(requestError.message || 'Your request could not be sent.');
    else { setSent(true); setForm(emptyForm); }
    setSaving(false);
  }

  return <main className="ll-auth-page"><section className="ll-auth-card ll-join-card">
    <Link to="/admin/login" className="ll-auth-back fine-link"><ArrowLeft size={16}/> Back to sign in</Link>
    {sent ? <div className="ll-auth-form ll-join-success"><CheckCircle2 size={28}/><h1>Request received</h1><p>A Super Admin will review your request. If approved, you’ll receive an email to create your Creative account.</p><Link to="/" className="ll-primary-action">Return to the feed</Link></div> : <form onSubmit={submit} className="ll-auth-form">
      <div className="ll-auth-heading"><div><p className="ll-kicker">Creative access</p><h1>Request to join</h1><p>Tell us who you are. Approval is required before you can sign in and publish.</p></div></div>
      <label>Name<input required maxLength="100" value={form.name} onChange={(event)=>update('name',event.target.value)}/></label>
      <label>Email<input required type="email" value={form.email} onChange={(event)=>update('email',event.target.value)}/></label>
      <label>Portfolio or social link <span>Optional</span><input type="url" value={form.portfolioUrl} onChange={(event)=>update('portfolioUrl',event.target.value)} placeholder="https://"/></label>
      <label>Short introduction <span>Optional</span><textarea maxLength="1500" rows="5" value={form.message} onChange={(event)=>update('message',event.target.value)} placeholder="What do you create, and why would you like to join?"/></label>
      {error && <p className="ll-form-error" role="alert">{error}</p>}
      <button disabled={saving} className="ll-primary-action ll-auth-submit">{saving ? 'Sending…' : 'Send request'}</button>
    </form>}
  </section></main>;
}
