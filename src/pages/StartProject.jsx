import { ArrowRight, CheckCircle2, Clock3, MessageSquare, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
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

const processSteps = [
  {
    title: 'Send inquiry',
    description: 'Share the goal, scope, and direction you have in mind.',
  },
  {
    title: 'We review',
    description: 'The collective checks the fit, timeline, and best next move.',
  },
  {
    title: 'Discuss direction',
    description: 'We align on creative, technical, budget, and delivery details.',
  },
  {
    title: 'Start building',
    description: 'Once everything is clear, we move into production together.',
  },
];

const serviceTags = ['Websites', 'Social media', 'Photo/video', 'Campaigns', 'Content systems', 'Visual direction'];
const inquiryLimits = {
  name: [2, 120],
  email_or_contact: [3, 200],
  project_type: [2, 120],
  message: [10, 5000],
  organization: [0, 160],
  budget_range: [0, 120],
  preferred_contact: [0, 120],
};

const emptyInquiry = {
  name: '',
  email_or_contact: '',
  organization: '',
  project_type: projectTypes[0],
  budget_range: budgetRanges[0],
  deadline: '',
  preferred_contact: '',
  preferred_creative_id: '',
  message: '',
};

function normalizeInquiry(form) {
  return {
    name: form.name.trim(),
    email_or_contact: form.email_or_contact.trim(),
    organization: form.organization.trim() || null,
    project_type: form.project_type.trim(),
    budget_range: form.budget_range.trim() || null,
    deadline: form.deadline || null,
    preferred_contact: form.preferred_contact.trim() || null,
    preferred_creative_id: form.preferred_creative_id || null,
    message: form.message.trim(),
  };
}

function validationError(payload, publishedCreativeIds) {
  if (payload.name.length < inquiryLimits.name[0]) return 'Please enter your name.';
  if (payload.name.length > inquiryLimits.name[1]) return 'Your name is too long.';
  if (payload.email_or_contact.length < inquiryLimits.email_or_contact[0]) return 'Please enter your email or contact details.';
  if (payload.email_or_contact.length > inquiryLimits.email_or_contact[1]) return 'Your email or contact details are too long.';
  if (payload.project_type.length < inquiryLimits.project_type[0]) return 'Please choose a project type.';
  if (payload.project_type.length > inquiryLimits.project_type[1]) return 'Your project type is too long.';
  if (payload.message.length < inquiryLimits.message[0]) return 'Please describe your project in at least 10 characters.';
  if (payload.message.length > inquiryLimits.message[1]) return 'Your project description is too long.';
  if (payload.organization?.length > inquiryLimits.organization[1]) return 'Your organization name is too long.';
  if (payload.budget_range?.length > inquiryLimits.budget_range[1]) return 'Your budget range is too long.';
  if (payload.preferred_contact?.length > inquiryLimits.preferred_contact[1]) return 'Your preferred contact details are too long.';
  if (payload.preferred_creative_id && !publishedCreativeIds.has(payload.preferred_creative_id)) return 'Please choose an available creative or select no preference.';
  return '';
}

function isRlsError(submitError) {
  const message = `${submitError?.message || ''} ${submitError?.details || ''}`.toLowerCase();
  return submitError?.code === '42501' || message.includes('row-level security');
}

export default function StartProject() {
  const [form, setForm] = useState(emptyInquiry);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [creatives, setCreatives] = useState([]);
  const { content } = usePublicContent([]);

  useEffect(() => {
    async function loadCreatives() {
      const { data } = await supabase
        .from('creative_members')
        .select('id, name, role')
        .eq('is_published', true)
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true });
      setCreatives(data || []);
    }
    loadCreatives();
  }, []);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setError('');

    const payload = normalizeInquiry(form);
    const formError = validationError(payload, new Set(creatives.map((creative) => creative.id)));
    if (formError) {
      setError(formError);
      return;
    }

    setSaving(true);

    try {
      const { error: inquiryError } = await supabase.from('project_inquiries').insert(payload);
      if (inquiryError) throw inquiryError;
      setForm(emptyInquiry);
      setMessage('Inquiry sent. We will review it and get back to you soon.');
    } catch (submitError) {
      setError(isRlsError(submitError)
        ? 'Please check the form details and try again.'
        : submitError.message || 'Inquiry could not be sent right now. Please try again later.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="page-shell py-20"
      style={{
        '--project-accent': content.accentColor,
        '--project-primary': content.primaryTextColor,
        '--project-secondary': content.secondaryTextColor,
        '--project-muted': content.mutedTextColor,
      }}
    >
      <section className="mb-12 max-w-3xl">
        <p className="text-xs font-medium uppercase tracking-[0.28em]" style={{ color: content.accentColor }}>Start a project</p>
        <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: content.primaryTextColor }}>Tell us what you are building next.</h1>
        <p className="mt-5 max-w-2xl leading-7" style={{ color: content.secondaryTextColor }}>
          Whether it is a website, social media project, visual campaign, photo/video work, or digital content system, tell us what you need and we will help shape the next step.
        </p>
        <div className="mt-8 grid gap-4 text-sm sm:grid-cols-3">
          {[
            ['01', 'Clear project context'],
            ['02', 'Creative and technical fit'],
            ['03', 'Practical next steps'],
          ].map(([number, label]) => (
            <div key={label} className="border-t border-white/[0.08] pt-4">
              <span className="block text-xs font-medium" style={{ color: content.accentColor }}>{number}</span>
              <span className="mt-2 block" style={{ color: content.secondaryTextColor }}>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-14">
        <form onSubmit={submit} className="major-border-y grid gap-8 py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.24em]" style={{ color: content.accentColor }}>Project inquiry</p>
              <h2 className="mt-3 text-2xl font-medium" style={{ color: content.primaryTextColor }}>Share the essentials.</h2>
            </div>
            <p className="max-w-xs text-sm leading-6" style={{ color: content.mutedTextColor }}>Required fields are marked by the browser when empty.</p>
          </div>

          {message && (
            <StatusMessage tone="success" icon={<CheckCircle2 size={18} />}>
              {message}
            </StatusMessage>
          )}
          {error && (
            <StatusMessage tone="error" icon={<MessageSquare size={18} />}>
              {error}
            </StatusMessage>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Name" required value={form.name} onChange={(value) => update('name', value)} />
            <Field label="Email or contact link" required value={form.email_or_contact} onChange={(value) => update('email_or_contact', value)} />
            <Field label="Business / organization" value={form.organization} onChange={(value) => update('organization', value)} />
            <Field label="Preferred contact" value={form.preferred_contact} onChange={(value) => update('preferred_contact', value)} />
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <Select label="Project type" value={form.project_type} options={projectTypes} onChange={(value) => update('project_type', value)} />
            <Select label="Budget range" value={form.budget_range} options={budgetRanges} onChange={(value) => update('budget_range', value)} />
            <Field label="Deadline / target date" type="date" value={form.deadline} onChange={(value) => update('deadline', value)} />
          </div>

          {creatives.length > 0 && <label className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em]" style={{ color: content.secondaryTextColor }}>Preferred creative</span>
            <select
              value={form.preferred_creative_id}
              onChange={(event) => update('preferred_creative_id', event.target.value)}
              className="min-h-12 w-full rounded-md border border-white/[0.08] bg-zinc-950/70 px-3.5 py-3 text-sm text-white outline-none transition duration-200 hover:border-white/[0.14] focus:border-[var(--project-accent)]"
            >
              <option value="">Let the collective decide</option>
              {creatives.map((creative) => <option key={creative.id} value={creative.id}>{creative.name}{creative.role ? ` - ${creative.role}` : ''}</option>)}
            </select>
          </label>}

          <label className="grid gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em]" style={{ color: content.secondaryTextColor }}>Message / details</span>
            <textarea
              required
              className="min-h-44 w-full resize-y rounded-md border border-white/[0.08] bg-zinc-950/70 px-4 py-4 text-sm leading-7 text-white outline-none transition duration-200 placeholder:text-zinc-600 hover:border-white/[0.14] focus:border-[var(--project-accent)]"
              value={form.message}
              onChange={(event) => update('message', event.target.value)}
              placeholder="Tell us what you want to create, what already exists, your goals, references, audience, timeline, and any details that would help us understand the project."
            />
          </label>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <button
              disabled={saving}
              className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-5 py-3 text-sm font-semibold text-zinc-950 transition duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
              style={{ backgroundColor: content.accentColor }}
            >
              <Send size={17} /> {saving ? 'Sending inquiry...' : 'Send inquiry'}
              {!saving && <ArrowRight className="transition duration-200 group-hover:translate-x-0.5" size={17} />}
            </button>
            <p className="text-sm leading-6" style={{ color: content.mutedTextColor }}>We review inquiries before recommending the best path forward.</p>
          </div>
        </form>

        <aside className="grid h-fit gap-8 lg:sticky lg:top-24">
          <section className="major-border-y py-6">
            <div className="flex items-center gap-3">
              <Clock3 size={18} style={{ color: content.accentColor }} />
              <h2 className="text-xl font-medium" style={{ color: content.primaryTextColor }}>What happens next</h2>
            </div>
            <div className="mt-6 grid gap-5">
              {processSteps.map((step, index) => (
                <div key={step.title} className="grid grid-cols-[2rem_1fr] gap-4">
                  <div className="pt-1 text-xs font-medium" style={{ color: content.accentColor }}>{String(index + 1).padStart(2, '0')}</div>
                  <div className="border-b border-white/[0.06] pb-5">
                    <h3 className="font-medium" style={{ color: content.primaryTextColor }}>{step.title}</h3>
                    <p className="mt-2 text-sm leading-6" style={{ color: content.secondaryTextColor }}>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="text-xs font-medium uppercase tracking-[0.24em]" style={{ color: content.accentColor }}>Available work</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {serviceTags.map((tag) => (
                <span key={tag} className="border-b border-white/[0.08] px-0 py-2 text-xs" style={{ color: content.secondaryTextColor }}>{tag}</span>
              ))}
            </div>
            <p className="mt-5 text-sm leading-6" style={{ color: content.mutedTextColor }}>
              Not sure where your idea fits? Choose the closest project type and describe the direction in your message.
            </p>
          </section>
        </aside>
      </section>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.18em]" style={{ color: 'var(--project-secondary)' }}>{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-md border border-white/[0.08] bg-zinc-950/70 px-3.5 py-3 text-sm text-white outline-none transition duration-200 placeholder:text-zinc-600 hover:border-white/[0.14] focus:border-[var(--project-accent)]"
      />
    </label>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.18em]" style={{ color: 'var(--project-secondary)' }}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 w-full rounded-md border border-white/[0.08] bg-zinc-950/70 px-3.5 py-3 text-sm text-white outline-none transition duration-200 hover:border-white/[0.14] focus:border-[var(--project-accent)]"
      >
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function StatusMessage({ children, icon, tone }) {
  const toneClasses = tone === 'success'
    ? 'border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-100'
    : 'border-red-400/20 bg-red-500/[0.08] text-red-100';

  return (
    <div className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm leading-6 ${toneClasses}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
