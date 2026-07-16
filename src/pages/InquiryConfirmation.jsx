import { ArrowRight, CheckCircle2, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import PublicPageHeader from '../components/PublicPageHeader';
import { copyText } from '../lib/clipboard';
import { branchKeyFromRecord, inquiryCopy, referenceIsValid } from '../lib/serviceRequest';
import { usePublicContent } from '../lib/contentApi';

function readConfirmation(reference, state) {
  if (state?.reference === reference) return state;
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(`lahat-liwa-inquiry-confirmation:${reference}`) || 'null');
    return stored?.reference === reference ? stored : null;
  } catch {
    return null;
  }
}

export default function InquiryConfirmation() {
  const { reference = '' } = useParams();
  const { state } = useLocation();
  const { content } = usePublicContent([]);
  const confirmation = useMemo(() => readConfirmation(reference, state), [reference, state]);
  const [copied, setCopied] = useState(false);

  if (!referenceIsValid(reference) || !confirmation) return <Navigate to="/inquiry" replace />;

  const branchKey = confirmation.branchKey || branchKeyFromRecord({ name: confirmation.branch }) || 'general';
  const copy = inquiryCopy(branchKey);

  async function copyReference() {
    await copyText(reference);
    setCopied(true);
  }

  return <div className="page-shell py-16 sm:py-20">
    <PublicPageHeader eyebrow="Inquiry received" title={copy.confirmationTitle} description={copy.confirmationDescription} accentColor={content.accentColor} titleColor={content.primaryTextColor} bodyColor={content.secondaryTextColor} />
    <section className="mt-10 grid gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div>
        <CheckCircle2 size={30} className="text-emerald-300" aria-hidden="true" />
        <p className="mt-5 text-[10px] uppercase tracking-[0.2em] text-zinc-600">Public reference</p>
        <div className="mt-2 flex flex-wrap items-center gap-4"><p className="text-2xl font-semibold tracking-[0.04em] text-white sm:text-3xl">{reference}</p><button type="button" onClick={copyReference} className="inline-flex min-h-11 items-center gap-2 border-b border-white/[0.15] text-sm text-zinc-300 hover:border-orange-300/60 hover:text-white"><Copy size={15} />{copied ? 'Copied' : 'Copy reference'}</button></div>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400">{copy.matchingCopy} You may be contacted through the selected method if more context is needed. If another branch or creative is more suitable, the inquiry may be redirected. Submission begins a review and does not confirm a booking, agreement, schedule, support appointment, or final quotation.</p>
      </div>
      <dl className="border-t border-orange-300/60">
        <Summary label="Branch" value={confirmation.branch} />
        <Summary label={copy.serviceSelectionHeading} value={confirmation.service} hint={copy.serviceSelectionDescription} />
        {confirmation.creative && <Summary label={copy.recipientLabel} value={confirmation.creative} />}
      </dl>
    </section>
    <div className="mt-8 flex flex-wrap gap-5"><Link to="/services" className="inline-flex min-h-11 items-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 hover:bg-orange-200">Explore services <ArrowRight size={15} /></Link><Link to="/creatives" className="inline-flex min-h-11 items-center border-b border-white/[0.15] text-sm text-zinc-300 hover:text-white">{copy.directoryLabel}</Link></div>
  </div>;
}

function Summary({ label, value, hint = '' }) { return <div className="border-b border-white/[0.08] py-4"><dt className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</dt>{hint && <dd className="mt-1 text-xs leading-5 text-zinc-500">{hint}</dd>}<dd className="mt-2 text-sm text-zinc-300">{value}</dd></div>; }
