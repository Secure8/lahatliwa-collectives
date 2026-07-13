import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, Send, ShieldAlert, UserRound } from 'lucide-react';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import PublicPageHeader from '../components/PublicPageHeader';
import { usePublicContent } from '../lib/contentApi';
import { branchKeyFromRecord, branchMeta, canonicalServiceKey, emptyInquiryDraft, INQUIRY_DRAFT_KEY, INQUIRY_STEPS, mergeInquiryContext, safeInquiryDraft, SERVICE_BRANCHES, serviceCategoriesForBranch, validateInquiryStep } from '../lib/serviceRequest';
import { supabase } from '../lib/supabaseClient';

const budgetRanges = ['Not specified', 'Below PHP 5,000', 'PHP 5,000 - 15,000', 'PHP 15,000 - 30,000', 'PHP 30,000+'];
const contactMethods = ['Email', 'Phone', 'Facebook / Messenger', 'WhatsApp', 'Other'];

function readDraft(context) {
  try {
    const stored = safeInquiryDraft(JSON.parse(window.sessionStorage.getItem(INQUIRY_DRAFT_KEY) || 'null'));
    return mergeInquiryContext(stored || emptyInquiryDraft(), context);
  } catch {
    return emptyInquiryDraft(context);
  }
}

async function functionErrorMessage(error) {
  if (error instanceof FunctionsHttpError) {
    const response = error.context;
    try {
      const payload = await response.clone().json();
      return payload.message || payload.error || 'The request could not be submitted.';
    } catch {
      try { return (await response.text()) || 'The request could not be submitted.'; } catch { return 'The request could not be submitted.'; }
    }
  }
  if (error instanceof FunctionsFetchError) return 'The inquiry service could not be reached. Check your connection and try again.';
  if (error instanceof FunctionsRelayError) return 'The inquiry service is temporarily unavailable. Please try again.';
  return error?.message || 'The request could not be submitted.';
}

export default function StartProject() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { content } = usePublicContent([]);
  const queryContext = useMemo(() => ({ branch: searchParams.get('branch') || '', service: searchParams.get('service') || '', creative: searchParams.get('creative') || '' }), [searchParams]);
  const [draft, setDraft] = useState(() => readDraft(queryContext));
  const [step, setStep] = useState(0);
  const [branches, setBranches] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [loadingChoices, setLoadingChoices] = useState(true);
  const [choiceLoadError, setChoiceLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('service_branches').select('name, slug, included_services').eq('is_published', true).order('display_order', { ascending: true, nullsFirst: false }),
      supabase.rpc('list_eligible_inquiry_creatives'),
    ]).then(([branchResult, creativeResult]) => {
      if (!active) return;
      setBranches(branchResult.data || []);
      setCreatives(creativeResult.data || []);
      if (branchResult.error || creativeResult.error) setChoiceLoadError('Some current service choices could not be verified. Unavailable options have been hidden for safety.');
      setLoadingChoices(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (loadingChoices) return;
    const requestedBranch = queryContext.branch;
    const requestedService = queryContext.service;
    const requestedCreative = String(queryContext.creative || '').toLowerCase();
    let contextNotice = '';
    setDraft((current) => {
      const next = { ...current };
      if (next.branch && next.branch !== 'general' && !branches.some((item) => branchKeyFromRecord(item) === next.branch)) {
        next.branch = '';
        next.serviceKey = '';
        contextNotice = 'A saved service choice is no longer available. Choose a current service below.';
      }
      if (requestedBranch) {
        const branchAvailable = requestedBranch === 'general' || branches.some((item) => branchKeyFromRecord(item) === requestedBranch);
        if (branchMeta(requestedBranch) && branchAvailable) next.branch = requestedBranch;
        else { next.branch = ''; next.serviceKey = ''; contextNotice = 'The requested service branch is unavailable. Choose one below.'; }
      }
      const available = servicesForBranch(next.branch, branches);
      if (requestedService) {
        const requestedKey = canonicalServiceKey(next.branch, requestedService);
        if (available.some((service) => service.key === requestedKey)) next.serviceKey = requestedKey;
        else { next.serviceKey = ''; contextNotice = 'The requested service is unavailable. Choose an available service.'; }
      }
      if (requestedCreative) {
        const creative = creatives.find((item) => item.slug === requestedCreative || item.id === requestedCreative);
        if (creative) next.creativeSlug = creative.slug;
        else { next.creativeSlug = ''; contextNotice = 'The requested creative is unavailable. You can choose another creative or the general team.'; }
      }
      return next;
    });
    setNotice(contextNotice);
  }, [branches, creatives, loadingChoices, queryContext]);

  useEffect(() => {
    try { window.sessionStorage.setItem(INQUIRY_DRAFT_KEY, JSON.stringify(draft)); } catch { }
  }, [draft]);

  const availableServices = useMemo(() => servicesForBranch(draft.branch, branches), [branches, draft.branch]);
  const selectedBranch = branchMeta(draft.branch);
  const selectedService = availableServices.find((service) => service.key === draft.serviceKey) || null;
  const selectedCreative = creatives.find((creative) => creative.slug === draft.creativeSlug) || null;

  function update(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => { const next = { ...current }; delete next[key]; return next; });
  }

  function updateBranchDetails(key, value) {
    setDraft((current) => ({ ...current, branchDetails: { ...current.branchDetails, [key]: value } }));
  }

  function goNext() {
    const nextErrors = validateInquiryStep(step, draft, availableServices, creatives);
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    setErrors({}); setNotice(''); setStep((current) => Math.min(current + 1, INQUIRY_STEPS.length - 1)); window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function goBack() { setErrors({}); setNotice(''); setStep((current) => Math.max(current - 1, 0)); window.scrollTo({ top: 0, behavior: 'auto' }); }

  async function submit() {
    if (submitting) return;
    const validationByStep = [0, 1, 2, 3].map((index) => validateInquiryStep(index, draft, availableServices, creatives));
    const finalErrors = Object.assign({}, ...validationByStep);
    if (Object.keys(finalErrors).length) {
      setErrors(finalErrors);
      setStep(Math.max(0, validationByStep.findIndex((result) => Object.keys(result).length > 0)));
      return;
    }
    setSubmitting(true); setNotice(''); setErrors({});
    try {
      const { data, error } = await supabase.functions.invoke('submit-service-request', {
        body: { action: 'submit', request: draft, sourcePath: `${location.pathname}${location.search}` },
      });
      if (error) throw error;
      if (!data?.success || !data.reference) throw new Error(data?.message || 'The inquiry could not be submitted.');
      const confirmation = { reference: data.reference, branch: selectedBranch?.label || 'General inquiry', service: selectedService?.name || 'General inquiry', creative: selectedCreative?.name || '', submittedAt: data.submittedAt || new Date().toISOString() };
      try {
        window.sessionStorage.removeItem(INQUIRY_DRAFT_KEY);
        window.sessionStorage.setItem(`lahat-liwa-inquiry-confirmation:${data.reference}`, JSON.stringify(confirmation));
      } catch { }
      navigate(`/inquiry/confirmation/${data.reference}`, { replace: true, state: confirmation });
    } catch (submitError) {
      setNotice(await functionErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  return <div className="page-shell py-16 sm:py-20" style={{ '--project-accent': content.accentColor, '--project-secondary': content.secondaryTextColor }}>
    <PublicPageHeader eyebrow="Project inquiry" title="Describe what you need, one step at a time." description="Choose the branch and broad category that best fit your request, then share the outcome, context, timeline, and support you need." accentColor={content.accentColor} titleColor={content.primaryTextColor} bodyColor={content.secondaryTextColor} />

    <StepProgress current={step} />
    <div className="grid gap-9 pt-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-12">
      <main aria-live="polite" className="min-w-0 border-y border-white/[0.09] py-7">
        <div className="mb-7 flex items-start justify-between gap-5"><div><p className="text-[10px] uppercase tracking-[0.2em] text-orange-300">Step {step + 1} of {INQUIRY_STEPS.length}</p><h1 className="mt-2 text-2xl font-medium text-white">{INQUIRY_STEPS[step]}</h1></div>{step > 0 && <button type="button" onClick={goBack} className="inline-flex min-h-10 items-center gap-2 border-b border-white/[0.12] text-sm text-zinc-400 hover:text-white"><ArrowLeft size={15} />Back</button>}</div>
        {(notice || choiceLoadError) && <div role="alert" className="mb-6 flex items-start gap-3 border-y border-amber-300/20 bg-amber-300/[0.05] px-3 py-3 text-sm leading-6 text-amber-100"><CircleAlert size={17} className="mt-0.5 shrink-0" />{notice || choiceLoadError}</div>}
        {Object.keys(errors).length > 0 && <div role="alert" className="mb-6 border-y border-red-300/20 bg-red-300/[0.04] px-3 py-3 text-sm text-red-100"><p className="font-medium">Check the highlighted information.</p><ul className="mt-2 list-disc space-y-1 pl-5">{Object.values(errors).map((error) => <li key={error}>{error}</li>)}</ul></div>}

        {step === 0 && <ServiceStep draft={draft} branches={branches} availableServices={availableServices} update={update} loading={loadingChoices} />}
        {step === 1 && <CreativeStep creatives={creatives} selected={draft.creativeSlug} update={update} loading={loadingChoices} error={errors.creativeSlug} />}
        {step === 2 && <DetailsStep draft={draft} update={update} updateBranchDetails={updateBranchDetails} errors={errors} />}
        {step === 3 && <ContactStep draft={draft} update={update} errors={errors} />}
        {step === 4 && <ReviewStep draft={draft} branch={selectedBranch} service={selectedService} creative={selectedCreative} />}

        <div className="mt-8 flex flex-col-reverse gap-3 border-t border-white/[0.08] pt-6 sm:flex-row sm:items-center sm:justify-end">
          {step < INQUIRY_STEPS.length - 1 ? <button type="button" onClick={goNext} className="inline-flex min-h-12 items-center justify-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 hover:bg-orange-200">Continue<ArrowRight size={16} /></button> : <button type="button" onClick={submit} disabled={submitting} className="inline-flex min-h-12 items-center justify-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-60"><Send size={16} />{submitting ? 'Submitting securely...' : 'Submit request'}</button>}
        </div>
      </main>

      <aside className="h-fit border-t border-white/[0.09] pt-5 lg:sticky lg:top-24"><p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Request summary</p><SummaryLine label="Branch" value={selectedBranch?.label} /><SummaryLine label="Service category" value={selectedService?.name} /><SummaryLine label="Creative" value={selectedCreative?.name || 'General team'} /><p className="mt-5 text-xs leading-6 text-zinc-600">Services are matched according to your requirements, location, schedule, and the availability of suitable creatives or specialists. Submitting a request does not confirm a booking, schedule, or final quotation.</p></aside>
    </div>
  </div>;
}

function servicesForBranch(branch, rows) {
  const row = rows.find((item) => branchKeyFromRecord(item) === branch);
  return serviceCategoriesForBranch(branch, row?.included_services || []);
}

function StepProgress({ current }) {
  return <ol className="public-filter-scroll mt-10 flex min-w-0 gap-0 overflow-x-auto border-y border-white/[0.08]" aria-label="Inquiry progress">{INQUIRY_STEPS.map((label, index) => <li key={label} aria-current={index === current ? 'step' : undefined} className={`flex min-h-14 min-w-[9rem] flex-1 items-center gap-2 border-b px-3 text-xs ${index === current ? 'border-orange-300 text-white' : index < current ? 'border-emerald-300/40 text-emerald-100' : 'border-transparent text-zinc-600'}`}>{index < current ? <Check size={14} /> : <span>{String(index + 1).padStart(2, '0')}</span>}<span>{label}</span></li>)}</ol>;
}

function ServiceStep({ draft, branches, availableServices, update, loading }) {
  if (loading) return <p className="py-8 text-sm text-zinc-500">Loading available services...</p>;
  const availableKeys = new Set(branches.map(branchKeyFromRecord));
  return <div className="grid gap-8"><fieldset><legend className="text-sm font-medium text-zinc-200">Choose a branch</legend><div className="mt-4 grid gap-3 sm:grid-cols-2">{[...SERVICE_BRANCHES.filter((branch) => availableKeys.has(branch.key)), branchMeta('general')].map((branch) => <ChoiceButton key={branch.key} selected={draft.branch === branch.key} onClick={() => { update('branch', branch.key); update('serviceKey', ''); }} title={branch.label} detail={branch.description} />)}</div></fieldset>{draft.branch && <fieldset><legend className="text-sm font-medium text-zinc-200">Choose a broad service category</legend><p className="mt-2 text-sm leading-6 text-zinc-500">Choose the closest fit. You can explain the exact work or support you need in the next step.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{availableServices.map((service) => <ChoiceButton key={service.key} selected={draft.serviceKey === service.key} onClick={() => update('serviceKey', service.key)} title={service.name} compact />)}</div></fieldset>}</div>;
}

function CreativeStep({ creatives, selected, update, loading, error }) {
  return <fieldset><legend className="text-sm font-medium text-zinc-200">Who should receive this request?</legend><p className="mt-2 text-sm leading-6 text-zinc-500">Choose an eligible public creative or let the collective assign the best person.</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><ChoiceButton selected={!selected} onClick={() => update('creativeSlug', '')} title="General team" detail="Let the collective review and assign the request." icon={<UserRound size={17} />} />{!loading && creatives.map((creative) => <ChoiceButton key={creative.id} selected={selected === creative.slug} onClick={() => update('creativeSlug', creative.slug)} title={creative.name} detail={creative.role} image={creative.profile_image_url} />)}</div>{error && <p className="mt-3 text-sm text-red-200">{error}</p>}</fieldset>;
}

function DetailsStep({ draft, update, updateBranchDetails, errors }) {
  return <div className="grid gap-6"><Field label="Project summary" value={draft.summary} onChange={(value) => update('summary', value)} error={errors.summary} maxLength={160} placeholder="A short description of the outcome you need" /><TextArea label="What do you need help with?" value={draft.details} onChange={(value) => update('details', value)} error={errors.details} maxLength={5000} placeholder="Describe the project, expected result, current situation, and useful context." hint="Describe the project, expected result, current situation, and any details that can help us match you with the right creative or specialist." /><BranchFields branch={draft.branch} details={draft.branchDetails} update={updateBranchDetails} /><label className="sr-only" aria-hidden="true">Company website<input tabIndex="-1" autoComplete="off" value={draft.honeypot} onChange={(event) => update('honeypot', event.target.value)} /></label></div>;
}

function BranchFields({ branch, details, update }) {
  if (branch === 'tech') return <div className="grid gap-5"><div className="flex items-start gap-3 border-y border-red-300/20 bg-red-300/[0.04] px-3 py-3 text-sm leading-6 text-red-100"><ShieldAlert size={18} className="mt-0.5 shrink-0" /><span>Never submit passwords, one-time codes, banking details, confidential files, or access credentials. For home visits, provide only a general location until the team confirms arrangements.</span></div><Field label="Device or platform (optional)" value={details.device || ''} onChange={(value) => update('device', value)} /><Field label="Issue category (optional)" value={details.issueCategory || ''} onChange={(value) => update('issueCategory', value)} /><Select label="Support mode (optional)" value={details.supportMode || ''} onChange={(value) => update('supportMode', value)} options={['', 'Virtual assistance', 'Consultation', 'Drop-off', 'Home visit']} /></div>;
  if (branch === 'studio') return <div className="grid gap-5 sm:grid-cols-2"><Field label="Event or project type (optional)" value={details.eventType || ''} onChange={(value) => update('eventType', value)} /><Field label="Estimated duration (optional)" value={details.duration || ''} onChange={(value) => update('duration', value)} /><Field label="Expected deliverables (optional)" value={details.deliverables || ''} onChange={(value) => update('deliverables', value)} className="sm:col-span-2" /><Field label="Existing files or assets (optional)" value={details.existingAssets || ''} onChange={(value) => update('existingAssets', value)} className="sm:col-span-2" /></div>;
  if (branch === 'digital') return <div className="grid gap-5 sm:grid-cols-2"><Field label="Project goal (optional)" value={details.projectGoal || ''} onChange={(value) => update('projectGoal', value)} /><Field label="Target users (optional)" value={details.targetUsers || ''} onChange={(value) => update('targetUsers', value)} /><Field label="Required features (optional)" value={details.features || ''} onChange={(value) => update('features', value)} className="sm:col-span-2" /><Field label="Existing website or system (optional)" value={details.existingSystem || ''} onChange={(value) => update('existingSystem', value)} className="sm:col-span-2" /><CheckField label="Request a meeting" checked={Boolean(details.meetingRequested)} onChange={(value) => update('meetingRequested', value)} /></div>;
  if (branch === 'social') return <div className="grid gap-5 sm:grid-cols-2"><Field label="Platforms (optional)" value={details.platforms || ''} onChange={(value) => update('platforms', value)} /><Field label="Campaign or account goal (optional)" value={details.campaignGoal || ''} onChange={(value) => update('campaignGoal', value)} /><Field label="Posting needs or frequency (optional)" value={details.postingNeeds || ''} onChange={(value) => update('postingNeeds', value)} /><Field label="Available brand assets (optional)" value={details.brandAssets || ''} onChange={(value) => update('brandAssets', value)} /><Field label="Campaign dates (optional)" value={details.campaignDates || ''} onChange={(value) => update('campaignDates', value)} /><Field label="Preferred arrangement (optional)" value={details.arrangement || ''} onChange={(value) => update('arrangement', value)} /></div>;
  return null;
}

function ContactStep({ draft, update, errors }) {
  return <div className="grid gap-5 sm:grid-cols-2"><Field label="Client or organization contact" value={draft.clientName} onChange={(value) => update('clientName', value)} error={errors.clientName} /><Field label="Organization (optional)" value={draft.organization} onChange={(value) => update('organization', value)} /><Field label="Email" type="email" value={draft.clientEmail} onChange={(value) => update('clientEmail', value)} error={errors.clientEmail} /><Field label="Phone or messaging contact (optional)" value={draft.clientPhone} onChange={(value) => update('clientPhone', value)} /><Select label="Preferred communication" value={draft.preferredContactMethod} onChange={(value) => update('preferredContactMethod', value)} options={contactMethods} /><Field label="Preferred date or timeline" value={draft.preferredSchedule} onChange={(value) => update('preferredSchedule', value)} placeholder="Preferred date, range, or timing" /><Select label="Service mode (optional)" value={draft.serviceMode} onChange={(value) => update('serviceMode', value)} options={['', 'Remote', 'On-site', 'Hybrid', 'To be discussed']} /><Field label="General location (optional)" value={draft.generalLocation} onChange={(value) => update('generalLocation', value)} placeholder="City or general area only" /><Select label="Approximate budget (optional)" value={draft.budgetRange} onChange={(value) => update('budgetRange', value)} options={budgetRanges} className="sm:col-span-2" /><CheckField label="I consent to being contacted about this request." checked={draft.consent} onChange={(value) => update('consent', value)} error={errors.consent} className="sm:col-span-2" /></div>;
}

function ReviewStep({ draft, branch, service, creative }) {
  return <div className="grid gap-6"><div className="grid gap-4 sm:grid-cols-2"><ReviewItem label="Branch" value={branch?.label} /><ReviewItem label="Service category" value={service?.name} /><ReviewItem label="Creative" value={creative ? `${creative.name} — ${creative.role}` : 'General team'} /><ReviewItem label="Preferred contact" value={`${draft.preferredContactMethod}${draft.clientPhone ? ` · ${draft.clientPhone}` : ''}`} /><ReviewItem label="Schedule" value={draft.preferredSchedule || 'To be discussed'} /><ReviewItem label="Service mode" value={draft.serviceMode || 'To be discussed'} /></div><div className="border-t border-white/[0.08] pt-5"><p className="text-[10px] uppercase tracking-[0.17em] text-zinc-600">What you need help with</p><p className="mt-2 text-lg text-white">{draft.summary}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-400">{draft.details}</p></div><div className="flex items-start gap-3 border-y border-white/[0.08] py-4 text-xs leading-6 text-zinc-500"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-300" /><span>Services are matched according to your requirements, location, schedule, and the availability of suitable creatives or specialists. Submitting a request does not confirm a booking, schedule, or final quotation.</span></div></div>;
}

function ChoiceButton({ selected, onClick, title, detail, image, icon, compact = false }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`group min-w-0 border px-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${compact ? 'min-h-14 py-3' : 'min-h-24 py-4'} ${selected ? 'border-orange-300/60 bg-orange-300/[0.08]' : 'border-white/[0.09] bg-white/[0.018] hover:border-white/[0.18]'}`}><div className="flex items-start gap-3">{image ? <img src={image} alt="" width="40" height="40" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : icon ? <span className="mt-0.5 text-orange-200">{icon}</span> : null}<div className="min-w-0 flex-1"><span className="block font-medium text-white">{title}</span>{detail && <span className="mt-1 block text-xs leading-5 text-zinc-500">{detail}</span>}</div>{selected && <Check size={16} className="shrink-0 text-orange-300" />}</div></button>;
}

function Field({ label, value, onChange, error, type = 'text', maxLength = 240, placeholder = '', className = '' }) { return <label className={`grid gap-2 text-sm text-zinc-300 ${className}`}><span>{label}</span><input type={type} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} className="min-h-12 w-full rounded-sm border border-white/[0.11] bg-black/20 px-3.5 text-white outline-none placeholder:text-zinc-700 hover:border-white/[0.2] focus:border-orange-300/60 aria-[invalid=true]:border-red-300/60" />{error && <span className="text-xs text-red-200">{error}</span>}</label>; }
function TextArea({ label, value, onChange, error, maxLength, placeholder, hint }) { return <label className="grid gap-2 text-sm text-zinc-300"><span>{label}</span>{hint && <span className="text-xs leading-5 text-zinc-500">{hint}</span>}<textarea value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} className="min-h-48 w-full resize-y rounded-sm border border-white/[0.11] bg-black/20 px-3.5 py-3 text-white outline-none placeholder:text-zinc-700 hover:border-white/[0.2] focus:border-orange-300/60 aria-[invalid=true]:border-red-300/60" />{error && <span className="text-xs text-red-200">{error}</span>}</label>; }
function Select({ label, value, onChange, options, className = '' }) { return <label className={`grid gap-2 text-sm text-zinc-300 ${className}`}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="dark-select min-h-12 w-full rounded-sm border border-white/[0.11] bg-black/20 px-3.5 text-white outline-none hover:border-white/[0.2] focus:border-orange-300/60">{options.map((option) => <option key={option || 'empty'} value={option}>{option || 'Choose an option'}</option>)}</select></label>; }
function CheckField({ label, checked, onChange, error, className = '' }) { return <label className={`flex min-h-12 items-start gap-3 border-y border-white/[0.08] py-3 text-sm text-zinc-300 ${className}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 h-4 w-4 accent-orange-300" /><span>{label}{error && <span className="mt-1 block text-xs text-red-200">{error}</span>}</span></label>; }
function SummaryLine({ label, value }) { return <div className="border-b border-white/[0.07] py-4"><p className="text-[10px] uppercase tracking-[0.16em] text-zinc-700">{label}</p><p className="mt-1 text-sm text-zinc-300">{value || 'Not selected'}</p></div>; }
function ReviewItem({ label, value }) { return <div className="border-t border-white/[0.08] pt-3"><p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</p><p className="mt-2 text-sm text-zinc-300">{value || 'Not specified'}</p></div>; }
