import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { ArrowRight, CheckCircle2, Send, UserRound } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ActionFeedback, FieldError } from '../components/FieldFeedback';
import PublicPageHeader from '../components/PublicPageHeader';
import WorkTaxonomyDropdowns from '../components/WorkTaxonomyDropdowns';
import { usePublicContent } from '../lib/contentApi';
import { inquiryContextFromSearchParams } from '../lib/inquiryContext';
import { supabase } from '../lib/supabaseClient';
import { loadWorkTaxonomy } from '../lib/workTaxonomy';

const DRAFT_KEY = 'lahat-liwa-open-inquiry-v1';
const contactMethods = ['Email', 'Phone', 'Facebook / Messenger', 'WhatsApp', 'Other'];

const emptyDraft = (projectContext = null) => ({
  clientName: '', organization: '', clientEmail: '', clientPhone: '', preferredContactMethod: 'Email',
  summary: projectContext?.title ? `Question about ${projectContext.title}` : '', details: '', preferredSchedule: '',
  generalLocation: '', budgetRange: '', consent: false, honeypot: '', projectContext,
  creativeSlug: '', taxonomyTermIds: [], idempotencyKey: globalThis.crypto?.randomUUID?.() || '',
});

function readDraft(context) {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (!stored || typeof stored !== 'object') return emptyDraft(context);
    return { ...emptyDraft(context), ...stored, projectContext: context || stored.projectContext || null };
  } catch { return emptyDraft(context); }
}

async function functionErrorMessage(error) {
  if (error instanceof FunctionsHttpError) {
    try { const payload = await error.context.clone().json(); return payload.message || payload.error || 'The message could not be submitted.'; } catch { return 'The message could not be submitted.'; }
  }
  if (error instanceof FunctionsFetchError) return 'The inquiry service could not be reached. Check your connection and try again.';
  if (error instanceof FunctionsRelayError) return 'The inquiry service is temporarily unavailable. Please try again.';
  return error?.message || 'The message could not be submitted.';
}

export default function StartProject() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { content } = usePublicContent([]);
  const projectContext = useMemo(() => {
    const linked = inquiryContextFromSearchParams(searchParams) || location.state?.inquirySelection?.context || null;
    return linked?.type === 'project' ? linked : null;
  }, [location.state, searchParams]);
  const [draft, setDraft] = useState(() => readDraft(projectContext));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [creatives, setCreatives] = useState([]);
  const [taxonomy, setTaxonomy] = useState([]);
  const platformInquiry = searchParams.get('kind') === 'platform';
  const requestedCreative = searchParams.get('creative') || '';

  useEffect(() => {
    if (platformInquiry) return;
    let active = true;
    supabase.from('creative_members').select('id,name,slug,role,short_bio,profile_image_url,availability_status').eq('is_published', true).order('display_order', { ascending: true, nullsFirst: false }).then(({ data }) => {
      if (!active) return;
      setCreatives(data || []);
      if (requestedCreative && (data || []).some((creative) => creative.slug === requestedCreative)) setDraft((current) => ({ ...current, creativeSlug: requestedCreative }));
    });
    return () => { active = false; };
  }, [platformInquiry, requestedCreative]);

  useEffect(() => {
    if (platformInquiry) return;
    let active = true;
    loadWorkTaxonomy().then((terms) => { if (active) setTaxonomy(terms); }).catch(() => null);
    return () => { active = false; };
  }, [platformInquiry]);

  useEffect(() => { setDraft((current) => ({ ...current, projectContext: projectContext || current.projectContext })); }, [projectContext]);
  useEffect(() => { try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {} }, [draft]);

  function update(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => { const next = { ...current }; delete next[key]; return next; });
    setSubmitError('');
  }

  function validate() {
    const next = {};
    if (String(draft.clientName).trim().length < 2) next.clientName = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(draft.clientEmail).trim())) next.clientEmail = 'Please enter a valid email address.';
    if (String(draft.summary).trim().length < 5) next.summary = 'Please add a short subject.';
    if (String(draft.details).trim().length < 20) next.details = 'Please describe your message in at least 20 characters.';
    if (!platformInquiry && !creatives.some((creative) => creative.slug === draft.creativeSlug)) next.creativeSlug = 'Choose the Creative you want to contact.';
    if (!draft.consent) next.consent = 'Please confirm that we may contact you about this message.';
    return next;
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const nextErrors = validate();
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); document.querySelector(`[data-inquiry-field="${Object.keys(nextErrors)[0]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    setSubmitting(true); setSubmitError('');
    try {
      const selectedCategories = taxonomy.filter((term) => (draft.taxonomyTermIds || []).includes(term.id)).map((term) => term.name);
      const request = {
        ...draft,
        branch: 'general', serviceKey: 'general-inquiry', creativeSlug: platformInquiry ? '' : draft.creativeSlug, inquiryKind: platformInquiry ? 'platform' : 'creative', inquiryCategory: '',
        serviceMode: '', branchDetails: selectedCategories.length ? { work_categories: selectedCategories.join(', ') } : {}, editorialContext: null,
      };
      const { data, error } = await supabase.functions.invoke('submit-service-request', { body: { action: 'submit', request, sourcePath: `${location.pathname}${location.search}` } });
      if (error) throw error;
      if (!data?.success || !data.reference) throw new Error(data?.message || 'The message could not be submitted.');
      const selectedCreative = creatives.find((creative) => creative.slug === draft.creativeSlug);
      const confirmation = { reference: data.reference, service: platformInquiry ? 'Platform inquiry' : 'Creative inquiry', creative: selectedCreative?.name || '', submittedAt: data.submittedAt || new Date().toISOString() };
      try { window.sessionStorage.removeItem(DRAFT_KEY); window.sessionStorage.setItem(`lahat-liwa-inquiry-confirmation:${data.reference}`, JSON.stringify(confirmation)); } catch {}
      navigate(`/inquiry/confirmation/${data.reference}`, { replace: true, state: confirmation });
    } catch (error) { setSubmitError(await functionErrorMessage(error)); }
    finally { setSubmitting(false); }
  }

  const page = content.websitePages?.inquiries || content.contactPage || {};
  return <div className="page-shell">
    <PublicPageHeader eyebrow={page.landingEyebrow || (platformInquiry ? 'Contact Lahat Liwa' : 'Connect with a Creative')} title={page.landingHeading || (platformInquiry ? 'Message the people behind the platform.' : 'Start a private creative conversation.')} description={page.landingDescription || (platformInquiry ? 'Use this for questions about Lahat Liwa, the website, profiles, credits, or the network itself.' : 'Choose who you want to work with, then describe the project, opportunity, or collaboration directly.')} backgroundImage={page.heroBackgroundImageUrl} backgroundPosition={page.heroBackgroundPosition || 'center'} backgroundCredit={page.heroBackgroundCredit || ''} edit={{ section: 'page.inquiries', eyebrowField: 'landingEyebrow', titleField: 'landingHeading', descriptionField: 'landingDescription', backgroundField: 'heroBackgroundImageUrl', creditField: 'heroBackgroundCredit' }} />
    <form onSubmit={submit} aria-label={platformInquiry ? 'Platform contact form' : 'Creative inquiry form'} className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-14">
      <section className="grid gap-6">
        {!platformInquiry && <fieldset data-inquiry-field="creativeSlug" className="ll-creative-recipient-picker"><legend>Who would you like to contact?</legend><p>Your message will be private to the selected Creative and the Super Admin.</p><div>{creatives.map((creative) => <label key={creative.id} className={draft.creativeSlug === creative.slug ? 'is-selected' : ''}><input type="radio" name="creative" value={creative.slug} checked={draft.creativeSlug === creative.slug} onChange={() => update('creativeSlug', creative.slug)} /><span className="ll-creative-recipient-avatar">{creative.profile_image_url ? <img src={creative.profile_image_url} alt=""/> : <UserRound size={20}/>}</span><span><strong>{creative.name}</strong><small>{creative.role || creative.short_bio || 'Lahat Liwa Creative'}</small></span></label>)}</div><FieldError>{errors.creativeSlug}</FieldError></fieldset>}
        {!platformInquiry && <InquiryTaxonomy terms={taxonomy} selected={draft.taxonomyTermIds || []} onChange={(value) => update('taxonomyTermIds', value)}/>}
        {draft.projectContext && <div className="border-l-2 border-orange-300/60 bg-orange-300/[0.04] px-4 py-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-200">Related project</p><p className="mt-2 font-medium text-white">{draft.projectContext.title || draft.projectContext.slug}</p></div>}
        <div className="grid gap-5 sm:grid-cols-2"><Field fieldKey="clientName" label="Your name" value={draft.clientName} onChange={(value) => update('clientName', value)} error={errors.clientName} required /><Field label="Organization or page (optional)" value={draft.organization} onChange={(value) => update('organization', value)} /><Field fieldKey="clientEmail" label="Email" type="email" value={draft.clientEmail} onChange={(value) => update('clientEmail', value)} error={errors.clientEmail} required /><Field label="Phone or messaging contact (optional)" value={draft.clientPhone} onChange={(value) => update('clientPhone', value)} /></div>
        <Field fieldKey="summary" label="Subject" value={draft.summary} onChange={(value) => update('summary', value)} error={errors.summary} maxLength={160} placeholder="What would you like to discuss?" required />
        <TextArea fieldKey="details" label="Your message" value={draft.details} onChange={(value) => update('details', value)} error={errors.details} maxLength={5000} placeholder="Describe the goal, current situation, idea, event, expected result, or anything else that will help us understand." />
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Preferred date or timeline (optional)" value={draft.preferredSchedule} onChange={(value) => update('preferredSchedule', value)} /><Field label="Location (optional)" value={draft.generalLocation} onChange={(value) => update('generalLocation', value)} /><Select label="Preferred contact method" value={draft.preferredContactMethod} onChange={(value) => update('preferredContactMethod', value)} options={contactMethods} /><Field label="Budget or range (optional)" value={draft.budgetRange} onChange={(value) => update('budgetRange', value)} placeholder="Share only if useful" /></div>
        <label className="sr-only" aria-hidden="true">Company website<input tabIndex="-1" autoComplete="off" value={draft.honeypot} onChange={(event) => update('honeypot', event.target.value)} /></label>
        <CheckField fieldKey="consent" checked={draft.consent} onChange={(value) => update('consent', value)} error={errors.consent} label="I consent to being contacted about this message." />
        <ActionFeedback error={submitError || (Object.keys(errors).length ? 'Please check the highlighted information.' : '')} />
        <button type="submit" disabled={submitting} className="ll-primary-action ll-inquiry-submit"><Send size={16} />{submitting ? 'Sending securely…' : 'Send message'}</button>
      </section>
      <aside className="h-fit border-t border-white/[0.1] pt-6 lg:sticky lg:top-24"><p className="text-xs uppercase tracking-[0.18em] text-orange-200">What happens next</p><div className="mt-5 grid gap-4 text-sm leading-6 text-zinc-400"><p className="flex gap-3"><CheckCircle2 size={17} className="mt-1 shrink-0 text-emerald-300" />{platformInquiry ? 'Your message goes to the platform owner.' : 'Your message goes directly to the Creative you selected.'}</p><p className="flex gap-3"><CheckCircle2 size={17} className="mt-1 shrink-0 text-emerald-300" />It is not placed in a public or shared inquiry pool.</p><p className="flex gap-3"><CheckCircle2 size={17} className="mt-1 shrink-0 text-emerald-300" />A reply is sent using your preferred contact method.</p></div><p className="mt-7 text-xs leading-6 text-zinc-600">{page.disclaimer || 'Sending a message does not confirm availability, schedule, scope, or pricing.'}</p>{platformInquiry && <a href={`mailto:${content.email}`} className="fine-link mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-zinc-300">Or email directly <ArrowRight size={15} /></a>}</aside>
    </form>
  </div>;
}

function Field({ fieldKey, label, value, onChange, error, type = 'text', maxLength = 240, placeholder = '', required = false }) { const id = useId(); return <label data-inquiry-field={fieldKey} className="grid gap-2 text-sm text-zinc-300"><span>{label}</span><input id={id} required={required} type={type} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} className="min-h-12 border border-white/[0.11] bg-black/20 px-3.5 text-white outline-none placeholder:text-zinc-700 focus:border-orange-300/60" /><FieldError>{error}</FieldError></label>; }
function TextArea({ fieldKey, label, value, onChange, error, maxLength, placeholder }) { return <label data-inquiry-field={fieldKey} className="grid gap-2 text-sm text-zinc-300"><span>{label}</span><textarea value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} className="min-h-56 resize-y border border-white/[0.11] bg-black/20 px-3.5 py-3 text-white outline-none placeholder:text-zinc-700 focus:border-orange-300/60" /><FieldError>{error}</FieldError></label>; }
function Select({ label, value, onChange, options }) { return <label className="grid gap-2 text-sm text-zinc-300"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="dark-select min-h-12 border border-white/[0.11] bg-black/20 px-3.5 text-white outline-none focus:border-orange-300/60">{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function CheckField({ fieldKey, label, checked, onChange, error }) { return <label data-inquiry-field={fieldKey} className="flex min-h-12 items-start gap-3 border-y border-white/[0.08] py-3 text-sm text-zinc-300"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-300" /><span>{label}<FieldError className="mt-1">{error}</FieldError></span></label>; }
function InquiryTaxonomy({ terms, selected, onChange }) {
  return <fieldset className="ll-inquiry-taxonomy ll-work-taxonomy"><legend>What kind of work is this about? <small>Select all that apply · Optional</small></legend><WorkTaxonomyDropdowns terms={terms} selectedIds={selected} onChange={onChange} /></fieldset>;
}
