import { Send } from 'lucide-react';
import { useState } from 'react';
import { usePublicContent } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';

const projectTypes = [
  'Website development',
  'Social media management',
  'Photography',
  'Photo editing',
  'Video shoot/editing',
  'Content planning',
  'Digital marketing support',
  'Branding/visuals',
  'Other',
];

const budgetRanges = ['Not sure yet', 'Below PHP 5,000', 'PHP 5,000 - 15,000', 'PHP 15,000 - 30,000', 'PHP 30,000+'];

const emptyInquiry = {
  name: '',
  email_or_contact: '',
  organization: '',
  project_type: projectTypes[0],
  budget_range: budgetRanges[0],
  deadline: '',
  preferred_contact: '',
  message: '',
};

export default function StartProject() {
  const [form, setForm] = useState(emptyInquiry);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const { content } = usePublicContent([]);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const payload = {
        ...form,
        deadline: form.deadline || null,
        organization: form.organization || null,
        preferred_contact: form.preferred_contact || null,
        budget_range: form.budget_range || null,
        status: 'new',
      };
      const { error: inquiryError } = await supabase.from('project_inquiries').insert(payload);
      if (inquiryError) throw inquiryError;
      setForm(emptyInquiry);
      setMessage('Inquiry sent. We will review it and get back to you soon.');
    } catch (submitError) {
      setError(submitError.message || 'Inquiry could not be sent right now. Please try again later.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-shell py-20">
      <div className="mb-12 max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.28em]" style={{ color: content.accentColor }}>Start a project</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: content.primaryTextColor }}>Tell Lahat Liwa what you want to build.</h1>
        <p className="mt-5 max-w-2xl leading-7" style={{ color: content.secondaryTextColor }}>Share the project type, timeline, budget direction, and details. This helps the collective understand what support fits best.</p>
      </div>

      <form onSubmit={submit} className="grid gap-5 rounded-lg border border-white/10 bg-zinc-900/70 p-5">
        {message && <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div>}
        {error && <div className="rounded-md border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Name" required value={form.name} onChange={(value) => update('name', value)} />
          <Field label="Email or contact link" required value={form.email_or_contact} onChange={(value) => update('email_or_contact', value)} />
          <Field label="Business / organization" value={form.organization} onChange={(value) => update('organization', value)} />
          <Field label="Preferred contact platform" value={form.preferred_contact} onChange={(value) => update('preferred_contact', value)} />
          <Select label="Project type" value={form.project_type} options={projectTypes} onChange={(value) => update('project_type', value)} />
          <Select label="Budget range" value={form.budget_range} options={budgetRanges} onChange={(value) => update('budget_range', value)} />
          <Field label="Deadline / target date" type="date" value={form.deadline} onChange={(value) => update('deadline', value)} />
        </div>

        <label className="grid gap-2 text-sm text-zinc-300">
          Project details
          <textarea required className="min-h-36 rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" value={form.message} onChange={(event) => update('message', event.target.value)} />
        </label>

        <button disabled={saving} className="inline-flex w-fit items-center gap-2 rounded-md bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60">
          <Send size={17} /> {saving ? 'Sending...' : 'Send inquiry'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" />
    </label>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}
