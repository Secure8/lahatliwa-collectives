import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, Send, ShieldAlert, UserRound } from 'lucide-react';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ActionFeedback, FieldError } from '../components/FieldFeedback';
import LoadingState from '../components/LoadingState';
import PublicPageHeader from '../components/PublicPageHeader';
import { usePublicContent } from '../lib/contentApi';
import { branchKeyFromRecord, branchMeta, buildInquirySubmissionRequest, changeInquiryBranchSelection, emptyInquiryDraft, INQUIRY_DRAFT_KEY, INQUIRY_SELECTION_STEP, INQUIRY_SPECIALIST_STEP, inquiryCopy, mergeInquiryContext, resolveInquiryEntry, safeInquiryDraft, SERVICE_BRANCHES, serviceCategoriesForBranch, validateInquiryStep } from '../lib/serviceRequest';
import { supabase } from '../lib/supabaseClient';
import useStepScroll, { motionSafeScrollBehavior } from '../lib/useStepScroll';
import useProgressiveNavigation from '../lib/useProgressiveNavigation';
import { defaultTourismInquiryCategory, INQUIRY_PATHS, inquiryContextFromSearchParams, TOURISM_INQUIRY_CATEGORIES } from '../lib/inquiryContext.js';
import { branchesFromWebsiteContent } from '../lib/websiteStudio.js';

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
  const queryContext = useMemo(() => {
    const navigationSelection = location.state?.inquirySelection || {};
    const relatedContext = inquiryContextFromSearchParams(searchParams) || navigationSelection.context || null;
    const editorialContext = relatedContext?.type === 'project' ? null : relatedContext;
    const projectContext = relatedContext?.type === 'project' ? relatedContext : null;
    const path = searchParams.get('path') || navigationSelection.path || (editorialContext ? 'tourism' : projectContext ? 'service' : '');
    return {
      path,
      branch: searchParams.get('branch') || navigationSelection.branch || projectContext?.branch || (path === 'tourism' ? 'tech' : path === 'general' ? 'general' : ''),
      service: searchParams.get('service') || navigationSelection.service || projectContext?.service || (path === 'tourism' ? defaultTourismInquiryCategory(editorialContext?.type) : path === 'general' ? 'general-inquiry' : ''),
      creative: searchParams.get('creative') || navigationSelection.creative || projectContext?.creative || '',
      inquiryKind: path || 'service',
      inquiryCategory: searchParams.get('inquiryCategory') || editorialContext?.inquiryCategory || '',
      editorialContext,
      projectContext,
    };
  }, [location.state, searchParams]);
  const [draft, setDraft] = useState(() => readDraft(queryContext));
  const [inquiryPath, setInquiryPath] = useState(queryContext.path || '');
  const [step, setStep] = useState(0);
  const [branches, setBranches] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [loadingChoices, setLoadingChoices] = useState(true);
  const [choiceLoadError, setChoiceLoadError] = useState('');
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [focusTarget, setFocusTarget] = useState({ key: '', request: 0 });
  const [focusStepHeadingRequest, setFocusStepHeadingRequest] = useState(0);
  const [stepScrollRequest, setStepScrollRequest] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const stepHeadingRef = useRef(null);
  const inquiryContainerRef = useRef(null);
  const serviceCategoryRef = useRef(null);
  const recipientSelectionRef = useRef('');
  const { navigateToNextStep } = useProgressiveNavigation({ routeKey: location.key });
  useStepScroll({ containerRef: inquiryContainerRef, request: stepScrollRequest });

  useEffect(() => {
    const websiteBranches = branchesFromWebsiteContent(content);
    setBranches(websiteBranches.length ? websiteBranches : SERVICE_BRANCHES.map((branch) => ({ ...branch, name: branch.label, slug: branch.key, included_services: serviceCategoriesForBranch(branch.key) })));
  }, [content.websiteBranches, content.websiteServices]);

  useEffect(() => {
    let active = true;
    let settled = false;
    const finishWithFallback = () => {
      if (!active || settled) return;
      settled = true;
      setCreatives([]);
      setChoiceLoadError('Specialist choices could not be verified. You can still continue with a general branch request.');
      setLoadingChoices(false);
    };
    const timeout = window.setTimeout(finishWithFallback, 6000);
    supabase.functions.invoke('inquiry-public-options', { body: { action: 'list' } }).then((creativeResult) => {
      if (!active || settled) return;
      settled = true;
      window.clearTimeout(timeout);
      setCreatives(creativeResult.data?.creatives || []);
      if (creativeResult.error) setChoiceLoadError('Some current specialist choices could not be verified. Unavailable options have been hidden for safety.');
      setLoadingChoices(false);
    }).catch(finishWithFallback);
    return () => { active = false; window.clearTimeout(timeout); };
  }, []);

  useEffect(() => {
    if (loadingChoices) return;
    setInquiryPath(queryContext.path || '');
    const requestedBranch = queryContext.branch;
    const requestedService = queryContext.service;
    const entry = resolveInquiryEntry(queryContext, branches.map(branchKeyFromRecord).filter(Boolean), creatives);
    let contextNotice = '';
    setDraft((current) => {
      const next = mergeInquiryContext(current, queryContext);
      if (next.branch && next.branch !== 'general' && !branches.some((item) => branchKeyFromRecord(item) === next.branch)) {
        next.branch = '';
        next.serviceKey = '';
        next.branchDetails = {};
        next.serviceMode = '';
        contextNotice = 'A saved service choice is no longer available. Choose a current service below.';
      }
      if (requestedBranch) {
        const selectionDraft = changeInquiryBranchSelection(next, entry.branch);
        Object.assign(next, selectionDraft, { serviceKey: entry.serviceKey });
        if (entry.status === 'invalid-branch') contextNotice = 'The requested service branch is unavailable. Choose one below.';
        if (entry.status === 'invalid-service') contextNotice = 'The requested service is unavailable. Choose an available service.';
      } else if (requestedService) {
        next.serviceKey = '';
        contextNotice = 'Choose a service branch before selecting a service.';
      }
      if (entry.status === 'ready-specialist' || entry.status === 'ready-team') next.creativeSlug = entry.creativeSlug;
      if (entry.status === 'invalid-specialist') {
        const recipientCopy = inquiryCopy(next.branch);
        next.creativeSlug = '';
        contextNotice = `The requested ${recipientCopy.recipientLabel.toLowerCase()} is unavailable. Choose another published creative or ${recipientCopy.teamOption}.`;
      }
      return next;
    });
    if ((queryContext.path === 'tourism' || queryContext.path === 'general') && entry.serviceKey) moveToStep(INQUIRY_SPECIALIST_STEP + 1);
    else if (entry.status === 'specialist' || entry.status === 'invalid-specialist' || entry.status === 'ready-specialist' || entry.status === 'ready-team') moveToStep(entry.step);
    else setStep(INQUIRY_SELECTION_STEP);
    setNotice(contextNotice);
  }, [branches, creatives, loadingChoices, queryContext]);

  useEffect(() => {
    try { window.sessionStorage.setItem(INQUIRY_DRAFT_KEY, JSON.stringify(draft)); } catch { }
  }, [draft]);

  useEffect(() => {
    if (!focusTarget.key) return undefined;
    const timer = window.setTimeout(() => {
      const field = document.querySelector(`[data-inquiry-field="${focusTarget.key}"]`);
      if (!field) return;
      field.scrollIntoView({ behavior: motionSafeScrollBehavior(), block: 'center' });
      const focusable = field.matches('input, textarea, select, button, [tabindex]')
        ? field
        : field.querySelector('input, textarea, select, button, [tabindex]');
      focusable?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusTarget, step]);

  useEffect(() => {
    if (!focusStepHeadingRequest) return undefined;
    const timer = window.setTimeout(() => stepHeadingRef.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(timer);
  }, [focusStepHeadingRequest, step]);

  const availableServices = useMemo(() => servicesForBranch(draft.branch, branches), [branches, draft.branch]);
  const selectedBranchRow = branches.find((item) => branchKeyFromRecord(item) === draft.branch);
  const selectedBranch = selectedBranchRow ? { ...branchMeta(draft.branch), label: selectedBranchRow.name || selectedBranchRow.label || branchMeta(draft.branch)?.label, description: selectedBranchRow.longDescription || selectedBranchRow.shortDescription || selectedBranchRow.description || branchMeta(draft.branch)?.description } : branchMeta(draft.branch);
  const selectedService = availableServices.find((service) => service.key === draft.serviceKey) || null;
  const selectedCreative = creatives.find((creative) => creative.slug === draft.creativeSlug) || null;
  const copy = inquiryCopy(draft.branch);
  const steps = copy.steps;

  function update(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => { const next = { ...current }; delete next[key]; return next; });
    setSubmitError('');
  }

  function updateBranchDetails(key, value) {
    setDraft((current) => ({ ...current, branchDetails: { ...current.branchDetails, [key]: value } }));
  }

  function moveToStep(nextStep) {
    setStep(nextStep);
    setFocusStepHeadingRequest((current) => current + 1);
    setStepScrollRequest((current) => current + 1);
  }

  function selectBranch(branch) {
    if (draft.branch === branch) return;
    setDraft((current) => changeInquiryBranchSelection(current, branch));
    recipientSelectionRef.current = '';
    setErrors({});
    setSubmitError('');
    setNotice('');
    navigateToNextStep({ targetRef: serviceCategoryRef, selectionKey: `branch:${branch}` });
  }

  function selectService(serviceKey) {
    if (draft.serviceKey === serviceKey) return;
    update('serviceKey', serviceKey);
    recipientSelectionRef.current = '';
    moveToStep(INQUIRY_SPECIALIST_STEP);
  }

  function selectRecipient(creativeSlug) {
    if (draft.creativeSlug === creativeSlug && recipientSelectionRef.current === creativeSlug) return;
    update('creativeSlug', creativeSlug);
    recipientSelectionRef.current = creativeSlug;
    moveToStep(INQUIRY_SPECIALIST_STEP + 1);
  }

  function changeSelection() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('branch');
    nextParams.delete('service');
    nextParams.delete('creative');
    const nextState = { ...(location.state || {}) };
    delete nextState.inquirySelection;
    setErrors({});
    setSubmitError('');
    setNotice('');
    moveToStep(INQUIRY_SELECTION_STEP);
    navigate({ pathname: location.pathname, search: nextParams.toString() ? `?${nextParams}` : '' }, { replace: true, state: nextState });
  }

  function changeSpecialist() {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('creative');
    const nextState = { ...(location.state || {}) };
    if (nextState.inquirySelection) {
      nextState.inquirySelection = { ...nextState.inquirySelection };
      delete nextState.inquirySelection.creative;
    }
    setErrors({});
    setSubmitError('');
    setNotice('');
    moveToStep(INQUIRY_SPECIALIST_STEP);
    navigate({ pathname: location.pathname, search: nextParams.toString() ? `?${nextParams}` : '' }, { replace: true, state: nextState });
  }

  function chooseInquiryPath(path) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('path', path);
    setInquiryPath(path);
    setErrors({}); setNotice(''); setSubmitError('');
    if (path === 'service') {
      setDraft((current) => ({ ...changeInquiryBranchSelection(current, ''), inquiryKind: 'service', inquiryCategory: '', editorialContext: null }));
      moveToStep(INQUIRY_SELECTION_STEP);
    } else {
      const tourism = path === 'tourism';
      const branch = tourism ? 'tech' : 'general';
      const serviceKey = tourism ? defaultTourismInquiryCategory(draft.editorialContext?.type) : 'general-inquiry';
      setDraft((current) => ({ ...changeInquiryBranchSelection(current, branch), branch, serviceKey, inquiryKind: path, inquiryCategory: tourism ? (current.inquiryCategory || serviceKey) : '', editorialContext: tourism ? current.editorialContext : null }));
      nextParams.set('branch', branch);
      nextParams.set('service', serviceKey);
      moveToStep(INQUIRY_SPECIALIST_STEP + 1);
    }
    navigate({ pathname: location.pathname, search: `?${nextParams}` }, { replace: true, state: location.state });
  }

  function changeInquiryPath() {
    const nextParams = new URLSearchParams(searchParams);
    for (const key of ['path', 'branch', 'service', 'creative']) nextParams.delete(key);
    setInquiryPath('');
    moveToStep(INQUIRY_SELECTION_STEP);
    navigate({ pathname: location.pathname, search: nextParams.toString() ? `?${nextParams}` : '' }, { replace: true, state: {} });
  }

  function goNext() {
    const nextErrors = validateInquiryStep(step, draft, availableServices, creatives);
    if (Object.keys(nextErrors).length) {
      const firstKey = Object.keys(nextErrors)[0];
      setErrors(nextErrors);
      setFocusTarget((current) => ({ key: firstKey, request: current.request + 1 }));
      return;
    }
    setErrors({}); setNotice(''); moveToStep(Math.min(step + 1, steps.length - 1));
  }

  function goBack() { setErrors({}); setNotice(''); setSubmitError(''); moveToStep(Math.max(step - 1, 0)); }

  async function submit() {
    if (submitting) return;
    const validationByStep = [0, 1, 2, 3].map((index) => validateInquiryStep(index, draft, availableServices, creatives));
    const finalErrors = Object.assign({}, ...validationByStep);
    if (Object.keys(finalErrors).length) {
      const firstStep = Math.max(0, validationByStep.findIndex((result) => Object.keys(result).length > 0));
      const firstKey = Object.keys(validationByStep[firstStep])[0];
      setErrors(finalErrors);
      moveToStep(firstStep);
      setFocusTarget((current) => ({ key: firstKey, request: current.request + 1 }));
      return;
    }
    setSubmitting(true); setNotice(''); setSubmitError(''); setErrors({});
    try {
      const { data, error } = await supabase.functions.invoke('submit-service-request', {
        body: { action: 'submit', request: buildInquirySubmissionRequest(draft), sourcePath: `${location.pathname}${location.search}` },
      });
      if (error) throw error;
      if (!data?.success || !data.reference) throw new Error(data?.message || 'The inquiry could not be submitted.');
      const confirmation = { reference: data.reference, branchKey: draft.branch || 'general', branch: selectedBranch?.label || 'General inquiry', service: selectedService?.name || 'General inquiry', creative: selectedCreative?.name || '', submittedAt: data.submittedAt || new Date().toISOString() };
      try {
        window.sessionStorage.removeItem(INQUIRY_DRAFT_KEY);
        window.sessionStorage.setItem(`lahat-liwa-inquiry-confirmation:${data.reference}`, JSON.stringify(confirmation));
      } catch { }
      navigate(`/inquiry/confirmation/${data.reference}`, { replace: true, state: confirmation });
    } catch (submitError) {
      setSubmitError(await functionErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  if (!inquiryPath) return <InquiryPathLanding content={content} onChoose={chooseInquiryPath} />;

  return <div className="public-inquiry-flow page-shell py-16 sm:py-20" style={{ '--project-accent': content.accentColor, '--project-secondary': content.secondaryTextColor }}>
    <PublicPageHeader eyebrow={copy.pageEyebrow} title={step === 0 ? copy.serviceSelectionHeading : copy.pageTitle} description={step === 0 ? copy.serviceSelectionDescription : copy.pageDescription} accentColor={content.accentColor} titleColor={content.primaryTextColor} bodyColor={content.secondaryTextColor} />

    {step > INQUIRY_SELECTION_STEP && selectedBranch && selectedService && <SelectionSummary branch={selectedBranch.label} service={selectedService.name} specialist={selectedCreative?.name || (step > INQUIRY_SPECIALIST_STEP ? copy.teamOption : '')} onChange={inquiryPath === 'service' ? changeSelection : changeInquiryPath} onChangeSpecialist={inquiryPath === 'service' && step > INQUIRY_SPECIALIST_STEP ? changeSpecialist : null} />}

    <section ref={inquiryContainerRef} className="inquiry-step-shell scroll-mt-20" aria-label="Active inquiry step">
    <StepProgress current={step} steps={steps} />
    <div className="grid gap-9 pt-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-12">
      <section aria-labelledby="inquiry-step-heading" className="min-w-0 py-7">
        <div className="mb-7 flex items-start justify-between gap-5"><div><p className="hidden text-[10px] uppercase tracking-[0.2em] text-orange-300 sm:block">Step {step + 1} of {steps.length}</p><h1 id="inquiry-step-heading" ref={stepHeadingRef} tabIndex="-1" className="text-2xl font-medium text-white outline-none sm:mt-2">{steps[step]}</h1></div>{step > 0 && <button type="button" onClick={goBack} className="inline-flex min-h-11 items-center gap-2 border-b border-white/[0.12] text-sm text-zinc-400 hover:border-orange-300/45 hover:text-white"><ArrowLeft size={15} />Back to {steps[step - 1]}</button>}</div>
        {choiceLoadError && <div role="status" className="mb-6 flex items-start gap-3 border-y border-amber-300/20 bg-amber-300/[0.05] px-3 py-3 text-sm leading-6 text-amber-100"><CircleAlert size={17} className="mt-0.5 shrink-0" />{choiceLoadError}</div>}
        {notice && <div role="status" className="mb-6 flex items-start gap-3 border-y border-amber-300/20 bg-amber-300/[0.05] px-3 py-3 text-sm leading-6 text-amber-100"><CircleAlert size={17} className="mt-0.5 shrink-0" />{notice}</div>}

        {step === 0 && <ServiceStep draft={draft} branches={branches} availableServices={availableServices} selectBranch={selectBranch} selectService={selectService} serviceCategoryRef={serviceCategoryRef} loading={loadingChoices} errors={errors} copy={copy} />}
        {step === 1 && <RecipientStep creatives={creatives} selected={draft.creativeSlug} selectRecipient={selectRecipient} loading={loadingChoices} error={errors.creativeSlug} copy={copy} />}
        {step === 2 && inquiryPath === 'tourism' && <TourismInquiryContext draft={draft} update={update} error={errors.inquiryCategory} />}
        {step === 2 && draft.projectContext && <ProjectInquiryContext context={draft.projectContext} />}
        {step === 2 && <DetailsStep draft={draft} update={update} updateBranchDetails={updateBranchDetails} errors={errors} copy={copy} inquiryPath={inquiryPath} />}
        {step === 3 && <ContactStep draft={draft} update={update} errors={errors} copy={copy} />}
        {step === 4 && <ReviewStep draft={draft} branch={selectedBranch} service={selectedService} creative={selectedCreative} copy={copy} />}

        <div className="mt-8 border-t border-white/[0.08] pt-6">
          <ActionFeedback error={submitError || (Object.keys(errors).length ? 'Please fix the highlighted information before continuing.' : '')} className="mb-4" />
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
            {step < steps.length - 1 ? <button type="button" onClick={goNext} className="inline-flex min-h-12 items-center justify-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 hover:bg-orange-200">Next: {steps[step + 1]}<ArrowRight size={16} /></button> : <button type="button" onClick={submit} disabled={submitting} className="inline-flex min-h-12 items-center justify-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 hover:bg-orange-200 disabled:cursor-not-allowed disabled:opacity-60"><Send size={16} />{submitting ? 'Sending securely...' : copy.submitLabel}</button>}
          </div>
        </div>
      </section>

      <aside className="h-fit pt-5 lg:sticky lg:top-24"><p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Request summary</p><SummaryLine label="Branch" value={selectedBranch?.label} /><SummaryLine label={copy.serviceSelectionHeading} value={selectedService?.name} hint={copy.serviceSelectionDescription} /><SummaryLine label={copy.recipientLabel} value={selectedCreative?.name || copy.teamOption} /><p className="mt-5 text-xs leading-6 text-zinc-600">{copy.matchingCopy} Sending a request does not confirm a booking, schedule, support appointment, or final quotation.</p></aside>
    </div>
    </section>
  </div>;
}

function InquiryPathLanding({ content, onChoose }) {
  const choices = [
    [INQUIRY_PATHS.service, 'Photography, video, websites, applications, social media, and other collective services.'],
    [INQUIRY_PATHS.tourism, 'Destinations, events, activities, local products, corrections, and questions about exploring Aklan.'],
    [INQUIRY_PATHS.general, 'Partnerships, platform questions, public concerns, and anything that does not fit the other paths.'],
  ];
  const page = content.contactPage || {};
  return <div className="page-shell py-16 sm:py-20"><PublicPageHeader eyebrow={page.landingEyebrow || `Contact ${content.displayName}`} title={page.landingHeading || 'How can we help?'} description={page.landingDescription || 'Choose one path first. We’ll show only the questions that apply to your request.'} accentColor={content.accentColor} titleColor={content.primaryTextColor} bodyColor={content.secondaryTextColor} /><div className="mt-10 grid gap-4 lg:grid-cols-3">{choices.map(([choice, detail]) => <button key={choice.key} type="button" onClick={() => onChoose(choice.key)} className="group min-h-52 border border-white/[0.1] bg-white/[0.02] p-6 text-left transition hover:border-orange-300/45 hover:bg-orange-300/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><p className="text-lg font-semibold text-[var(--site-primary-text)]">{choice.label}</p><p className="mt-4 text-sm leading-6 text-[var(--site-secondary-text)]">{detail}</p><span className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-[var(--site-accent-text)]">Continue <ArrowRight size={16} /></span></button>)}</div><div className="mt-8 flex items-start gap-3 border-y border-white/[0.1] py-5 text-sm leading-6 text-[var(--site-secondary-text)]"><ShieldAlert size={18} className="mt-0.5 shrink-0 text-orange-200" /><p>{page.disclaimer || `${content.displayName} is an independent creative collective and information platform. It is not an official tourism office, emergency service, travel agency, booking authority, transportation provider, or tour operator.`}</p></div></div>;
}

function servicesForBranch(branch, rows) {
  const row = rows.find((item) => branchKeyFromRecord(item) === branch);
  const configured = Array.isArray(row?.included_services) ? row.included_services : [];
  return configured.length && typeof configured[0] === 'object' ? configured : serviceCategoriesForBranch(branch, configured);
}

function SelectionSummary({ branch, service, specialist = '', onChange, onChangeSpecialist }) {
  return <section aria-label="Inquiry selections" className="mt-8 flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div aria-live="polite" aria-atomic="true"><p className="text-[10px] uppercase tracking-[0.18em] text-orange-300">Selected service</p><p className="mt-1 text-sm font-medium text-white">{branch} <span aria-hidden="true" className="text-zinc-600">·</span> {service}</p>{specialist && <p className="mt-2 text-xs text-zinc-400"><span className="text-zinc-600">Preferred creative:</span> {specialist}</p>}</div><div className="flex flex-wrap gap-4">{onChangeSpecialist && <button type="button" onClick={onChangeSpecialist} className="inline-flex min-h-11 w-fit items-center border-b border-white/[0.16] text-sm font-medium text-zinc-300 transition hover:border-orange-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200">Change creative</button>}<button type="button" onClick={onChange} className="inline-flex min-h-11 w-fit items-center border-b border-orange-300/45 text-sm font-medium text-orange-100 transition hover:border-orange-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-200">Change service</button></div></section>;
}

function StepProgress({ current, steps }) {
  return <>
    <div className="mt-9 py-4 sm:hidden" role="progressbar" aria-label="Inquiry progress" aria-valuemin="1" aria-valuemax={steps.length} aria-valuenow={current + 1} aria-valuetext={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}>
      <div className="flex items-center justify-between gap-4"><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-orange-300">Step {current + 1} of {steps.length}</p><p className="text-xs tabular-nums text-zinc-500">{Math.round(((current + 1) / steps.length) * 100)}% complete</p></div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-300/20"><span className="block h-full rounded-full bg-orange-300 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${((current + 1) / steps.length) * 100}%` }} /></div>
    </div>
    <ol className="public-filter-scroll mt-10 hidden min-w-0 gap-0 overflow-x-auto sm:flex" aria-label="Inquiry progress">{steps.map((label, index) => <li key={label} aria-current={index === current ? 'step' : undefined} className={`flex min-h-14 min-w-[9rem] flex-1 items-center gap-2 border-b px-3 text-xs ${index === current ? 'border-orange-300 text-white' : index < current ? 'border-emerald-300/40 text-emerald-100' : 'border-transparent text-zinc-600'}`}>{index < current ? <Check size={14} /> : <span>{String(index + 1).padStart(2, '0')}</span>}<span>{label}</span></li>)}</ol>
  </>;
}

function ServiceStep({ draft, branches, availableServices, selectBranch, selectService, serviceCategoryRef, loading, errors, copy }) {
  if (loading) return <LoadingState label="Loading available services" compact />;
  const availableBranches = branches.map((branch) => ({ key: branchKeyFromRecord(branch), label: branch.name || branch.label, description: branch.longDescription || branch.shortDescription || branch.description })).filter((branch) => branch.key);
  return <div className="grid gap-8"><ChoiceGroup fieldKey="branch" legend="Choose a Liwa branch" error={errors.branch}><div data-flow-step="branch" className="mt-4 grid gap-3 sm:grid-cols-2">{[...availableBranches, branchMeta('general')].map((branch) => <ChoiceButton key={branch.key} selected={draft.branch === branch.key} onClick={() => selectBranch(branch.key)} title={branch.label} detail={branch.description} />)}</div></ChoiceGroup>{draft.branch && <div ref={serviceCategoryRef} data-flow-step="category" aria-live="polite"><ChoiceGroup fieldKey="serviceKey" legend={copy.serviceSelectionHeading} error={errors.serviceKey}><p className="mt-2 text-sm leading-6 text-zinc-400">{copy.serviceSelectionDescription}</p><p className="mt-2 text-xs leading-5 text-zinc-600">{copy.serviceHelper}</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{availableServices.map((service) => <ChoiceButton key={service.key} selected={draft.serviceKey === service.key} onClick={() => selectService(service.key)} title={service.name} compact />)}</div></ChoiceGroup></div>}</div>;
}

function RecipientStep({ creatives, selected, selectRecipient, loading, error, copy }) {
  return <div data-flow-step="specialist"><ChoiceGroup fieldKey="creativeSlug" legend={copy.recipientLegend} error={error}><p className="mt-2 text-sm leading-6 text-zinc-500">{copy.recipientHelper}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><ChoiceButton selected={!selected} onClick={() => selectRecipient('')} title={copy.teamOption} detail={copy.teamOptionDetail} icon={<UserRound size={17} />} />{!loading && creatives.map((creative) => <ChoiceButton key={creative.id} selected={selected === creative.slug} onClick={() => selectRecipient(creative.slug)} title={creative.name} detail={copy.recipientLabel} image={creative.profile_image_url} />)}</div></ChoiceGroup></div>;
}

function DetailsStep({ draft, update, updateBranchDetails, errors, copy, inquiryPath }) {
  return <div className="grid gap-6"><Field fieldKey="summary" label={copy.summaryLabel} hint={copy.summaryHelper} value={draft.summary} onChange={(value) => update('summary', value)} error={errors.summary} maxLength={160} placeholder={copy.summaryPlaceholder} /><TextArea fieldKey="details" label={copy.detailsLabel} value={draft.details} onChange={(value) => update('details', value)} error={errors.details} maxLength={5000} placeholder={copy.detailsPlaceholder} hint={copy.detailsHelper} />{copy.examples.length > 0 && <div className="border-l border-orange-300/30 pl-4 text-xs leading-6 text-zinc-500"><p className="uppercase tracking-[0.14em] text-zinc-600">Examples</p>{copy.examples.map((example) => <p key={example} className="mt-1">“{example}”</p>)}</div>}<BranchFields branch={draft.branch} details={draft.branchDetails} update={updateBranchDetails} /><label className="sr-only" aria-hidden="true">Company website<input tabIndex="-1" autoComplete="off" value={draft.honeypot} onChange={(event) => update('honeypot', event.target.value)} /></label></div>;
}

function TourismInquiryContext({ draft, update, error }) {
  const context = draft.editorialContext;
  return <div className="mb-6 grid gap-5"><label data-inquiry-field="inquiryCategory" className="grid gap-2 text-sm text-zinc-300"><span>Inquiry topic</span><select value={draft.inquiryCategory || ''} onChange={(event) => update('inquiryCategory', event.target.value)} aria-invalid={Boolean(error)} className="dark-select min-h-12 w-full rounded-sm border border-white/[0.11] bg-black/20 px-3.5 text-white outline-none focus:border-orange-300/60"><option value="">Choose a topic</option>{TOURISM_INQUIRY_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><FieldError>{error}</FieldError></label>{context && <div className="border-l-2 border-orange-300/60 bg-orange-300/[0.04] px-4 py-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-200">You’re asking about</p><p className="mt-2 font-medium text-white">{context.title || context.slug}</p>{context.municipality && <p className="mt-1 text-sm text-zinc-400">{context.municipality}</p>}<p className="mt-3 text-xs leading-5 text-zinc-500">This published page will be verified again when your inquiry is submitted.</p></div>}<div className="flex items-start gap-3 border-y border-white/[0.08] py-4 text-sm leading-6 text-zinc-400"><ShieldAlert size={17} className="mt-0.5 shrink-0 text-orange-200" /><p>For emergencies, contact the appropriate local authority or emergency service. Lahat Liwa cannot provide reservations, transport, accommodation, tours, or official government information.</p></div></div>;
}

function ProjectInquiryContext({ context }) {
  return <div className="mb-6 border-l-2 border-orange-300/60 bg-orange-300/[0.04] px-4 py-4"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-200">You’re asking about this project</p><p className="mt-2 font-medium text-white">{context.title || context.slug}</p><p className="mt-3 text-xs leading-5 text-zinc-500">The published project and its contributor credits will be verified again when your inquiry is submitted.</p></div>;
}

function BranchFields({ branch, details, update }) {
  if (branch === 'tech') return null;
  if (branch === 'studio') return <div className="grid gap-5 sm:grid-cols-2"><Field label="Shoot, event, or editing request (optional)" value={details.eventType || ''} onChange={(value) => update('eventType', value)} placeholder="Event coverage, portrait shoot, raw-footage editing…" /><Field label="Shoot date and coverage hours (optional)" value={details.duration || ''} onChange={(value) => update('duration', value)} placeholder="June 20 · 4 hours of coverage" /><Field label="Required visual outputs and quantity (optional)" value={details.deliverables || ''} onChange={(value) => update('deliverables', value)} placeholder="80 edited photos, raw files, 2-minute highlight video, SDE…" className="sm:col-span-2" /><Field label="Visual style, references, or existing files (optional)" value={details.existingAssets || ''} onChange={(value) => update('existingAssets', value)} placeholder="Documentary style, reference links, existing raw photos or footage…" className="sm:col-span-2" /></div>;
  if (branch === 'digital') return <div className="grid gap-5 sm:grid-cols-2"><Field label="Product or system goal (optional)" value={details.projectGoal || ''} onChange={(value) => update('projectGoal', value)} placeholder="Launch a café website, automate reports, improve a dashboard…" /><Field label="Users or audience (optional)" value={details.targetUsers || ''} onChange={(value) => update('targetUsers', value)} placeholder="Customers, staff, administrators, members…" /><Field label="Required features and integrations (optional)" value={details.features || ''} onChange={(value) => update('features', value)} placeholder="User accounts, CMS, payments, dashboard, API integration…" className="sm:col-span-2" /><Field label="Current platform, website, hosting, or domain (optional)" value={details.existingSystem || ''} onChange={(value) => update('existingSystem', value)} placeholder="Existing URL, platform, prototype, hosting, or current system…" className="sm:col-span-2" /><CheckField label="Request a development consultation" checked={Boolean(details.meetingRequested)} onChange={(value) => update('meetingRequested', value)} /></div>;
  if (branch === 'social') return <div className="grid gap-5 sm:grid-cols-2"><Field label="Platforms or pages (optional)" value={details.platforms || ''} onChange={(value) => update('platforms', value)} placeholder="Facebook, Instagram, TikTok…" /><Field label="Audience and campaign goal (optional)" value={details.campaignGoal || ''} onChange={(value) => update('campaignGoal', value)} placeholder="Reach local customers, launch a product, improve engagement…" /><Field label="Content and posting frequency (optional)" value={details.postingNeeds || ''} onChange={(value) => update('postingNeeds', value)} placeholder="Content calendar, 3 posts per week, captions, page management…" /><Field label="Available assets and brand direction (optional)" value={details.brandAssets || ''} onChange={(value) => update('brandAssets', value)} placeholder="Logo, photos, brand voice, existing promotional materials…" /><Field label="Campaign dates or preferred start (optional)" value={details.campaignDates || ''} onChange={(value) => update('campaignDates', value)} placeholder="Launch date, campaign period, or monthly arrangement…" /><Field label="Strategy, management, or consultation (optional)" value={details.arrangement || ''} onChange={(value) => update('arrangement', value)} placeholder="Full page management, campaign support, analytics review…" /></div>;
  return null;
}

function ContactStep({ draft, update, errors, copy }) {
  return <div className="grid gap-5 sm:grid-cols-2"><Field fieldKey="clientName" label="Client or organization contact" value={draft.clientName} onChange={(value) => update('clientName', value)} error={errors.clientName} /><Field label="Organization (optional)" value={draft.organization} onChange={(value) => update('organization', value)} /><Field fieldKey="clientEmail" label="Email" type="email" value={draft.clientEmail} onChange={(value) => update('clientEmail', value)} error={errors.clientEmail} /><Field label="Phone or messaging contact (optional)" value={draft.clientPhone} onChange={(value) => update('clientPhone', value)} /><Select label="Preferred communication" value={draft.preferredContactMethod} onChange={(value) => update('preferredContactMethod', value)} options={contactMethods} /><Field label={copy.scheduleLabel} value={draft.preferredSchedule} onChange={(value) => update('preferredSchedule', value)} placeholder={copy.schedulePlaceholder} /><Select label={copy.serviceModeLabel} value={draft.serviceMode} onChange={(value) => update('serviceMode', value)} options={copy.serviceModes} /><Field label={copy.locationLabel} value={draft.generalLocation} onChange={(value) => update('generalLocation', value)} placeholder={copy.locationPlaceholder} /><Select label="Approximate budget (optional)" value={draft.budgetRange} onChange={(value) => update('budgetRange', value)} options={budgetRanges} className="sm:col-span-2" /><CheckField fieldKey="consent" label="I consent to being contacted about this request." checked={draft.consent} onChange={(value) => update('consent', value)} error={errors.consent} className="sm:col-span-2" /></div>;
}

function ReviewStep({ draft, branch, service, creative, copy }) {
  const branchReviewItems = copy.reviewFields
    .map(([key, label]) => ({ label, value: typeof draft.branchDetails[key] === 'boolean' ? (draft.branchDetails[key] ? 'Yes' : '') : draft.branchDetails[key] }))
    .filter((item) => item.value);
  return <div className="grid gap-6"><div className="grid gap-4 sm:grid-cols-2"><ReviewItem label="Branch" value={branch?.label} /><ReviewItem label={copy.serviceSelectionHeading} value={service?.name} hint={copy.serviceSelectionDescription} /><ReviewItem label={copy.recipientLabel} value={creative?.name || copy.teamOption} /><ReviewItem label="Preferred contact" value={`${draft.preferredContactMethod}${draft.clientPhone ? ` · ${draft.clientPhone}` : ''}`} /><ReviewItem label={copy.scheduleLabel} value={draft.preferredSchedule || 'To be discussed'} /><ReviewItem label={copy.serviceModeLabel.replace(' (optional)', '')} value={draft.serviceMode || 'To be discussed'} /></div><div className="border-t border-white/[0.08] pt-5"><p className="text-[10px] uppercase tracking-[0.17em] text-zinc-600">{copy.reviewLabel}</p><p className="mt-2 text-lg text-white">{draft.summary}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-400">{draft.details}</p></div>{branchReviewItems.length > 0 && <div className="grid gap-4 border-t border-white/[0.08] pt-5 sm:grid-cols-2">{branchReviewItems.map((item) => <ReviewItem key={item.label} label={item.label} value={item.value} />)}</div>}<div className="flex items-start gap-3 py-4 text-xs leading-6 text-zinc-500"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-300" /><span>{copy.matchingCopy} Sending a request does not confirm a booking, schedule, support appointment, or final quotation.</span></div></div>;
}

function ChoiceButton({ selected, onClick, title, detail, image, icon, compact = false }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`group min-w-0 border px-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 ${compact ? 'min-h-14 py-3' : 'min-h-24 py-4'} ${selected ? 'border-orange-300/60 bg-orange-300/[0.08]' : 'border-white/[0.09] bg-white/[0.018] hover:border-white/[0.18]'}`}><div className="flex items-start gap-3">{image ? <img src={image} alt="" width="40" height="40" className="h-10 w-10 shrink-0 rounded-full object-cover" /> : icon ? <span className="mt-0.5 text-orange-200">{icon}</span> : null}<div className="min-w-0 flex-1"><span className="block font-medium text-white">{title}</span>{detail && <span className="mt-1 block text-xs leading-5 text-zinc-500">{detail}</span>}</div>{selected && <Check size={16} className="shrink-0 text-orange-300" />}</div></button>;
}

function ChoiceGroup({ fieldKey, legend, error, children }) { const id = useId(); const errorId = `${id}-error`; return <fieldset data-inquiry-field={fieldKey} tabIndex="-1" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className={error ? 'border-l-2 border-red-300/60 pl-4 outline-none' : 'outline-none'}><legend className="text-sm font-medium text-zinc-200">{legend}</legend>{children}<FieldError id={errorId} className="mt-3">{error}</FieldError></fieldset>; }
function Field({ fieldKey, label, value, onChange, error, hint, type = 'text', maxLength = 240, placeholder = '', className = '' }) { const id = useId(); const hintId = `${id}-hint`; const errorId = `${id}-error`; const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined; return <label data-inquiry-field={fieldKey} className={`grid gap-2 text-sm text-zinc-300 ${className}`}><span>{label}</span>{hint && <span id={hintId} className="text-xs leading-5 text-zinc-500">{hint}</span>}<input id={id} type={type} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={describedBy} className="min-h-12 w-full rounded-sm border border-white/[0.11] bg-black/20 px-3.5 text-white outline-none placeholder:text-zinc-700 hover:border-white/[0.2] focus:border-orange-300/60 aria-[invalid=true]:border-red-300/60 aria-[invalid=true]:focus:ring-2 aria-[invalid=true]:focus:ring-red-300/20" /><FieldError id={errorId}>{error}</FieldError></label>; }
function TextArea({ fieldKey, label, value, onChange, error, maxLength, placeholder, hint }) { const id = useId(); const hintId = `${id}-hint`; const errorId = `${id}-error`; const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined; return <label data-inquiry-field={fieldKey} className="grid gap-2 text-sm text-zinc-300"><span>{label}</span>{hint && <span id={hintId} className="text-xs leading-5 text-zinc-500">{hint}</span>}<textarea id={id} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={describedBy} className="min-h-48 w-full resize-y rounded-sm border border-white/[0.11] bg-black/20 px-3.5 py-3 text-white outline-none placeholder:text-zinc-700 hover:border-white/[0.2] focus:border-orange-300/60 aria-[invalid=true]:border-red-300/60 aria-[invalid=true]:focus:ring-2 aria-[invalid=true]:focus:ring-red-300/20" /><FieldError id={errorId}>{error}</FieldError></label>; }
function Select({ label, value, onChange, options, className = '' }) { return <label className={`grid gap-2 text-sm text-zinc-300 ${className}`}><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="dark-select min-h-12 w-full rounded-sm border border-white/[0.11] bg-black/20 px-3.5 text-white outline-none hover:border-white/[0.2] focus:border-orange-300/60">{options.map((option) => <option key={option || 'empty'} value={option}>{option || 'Choose an option'}</option>)}</select></label>; }
function CheckField({ fieldKey, label, checked, onChange, error, className = '' }) { const id = useId(); const errorId = `${id}-error`; return <label data-inquiry-field={fieldKey} className={`flex min-h-12 items-start gap-3 border-y py-3 text-sm text-zinc-300 ${error ? 'border-red-300/40 bg-red-300/[0.03]' : 'border-white/[0.08]'} ${className}`}><input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className="mt-0.5 h-4 w-4 accent-orange-300" /><span>{label}<FieldError id={errorId} className="mt-1">{error}</FieldError></span></label>; }
function SummaryLine({ label, value, hint = '' }) { return <div className="border-b border-white/[0.07] py-4"><p className="text-[10px] uppercase tracking-[0.16em] text-zinc-700">{label}</p>{hint && <p className="mt-1 text-[11px] leading-5 text-zinc-600">{hint}</p>}<p className="mt-1 text-sm text-zinc-300">{value || 'Not selected'}</p></div>; }
function ReviewItem({ label, value, hint = '' }) { return <div className="border-t border-white/[0.08] pt-3"><p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</p>{hint && <p className="mt-1 text-xs leading-5 text-zinc-500">{hint}</p>}<p className="mt-2 text-sm text-zinc-300">{value || 'Not specified'}</p></div>; }
