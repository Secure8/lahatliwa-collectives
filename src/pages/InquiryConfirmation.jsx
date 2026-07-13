import { ArrowRight, CheckCircle2, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import PublicPageHeader from '../components/PublicPageHeader';
import { copyText } from '../lib/clipboard';
import { referenceIsValid } from '../lib/serviceRequest';
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

  async function copyReference() {
    await copyText(reference);
    setCopied(true);
  }

  return <div className="page-shell py-16 sm:py-20">
    <PublicPageHeader eyebrow="Request received" title="Your inquiry is safely with the collective." description="Keep your reference number nearby when following up. The team will review your request before confirming availability, timing, or pricing." accentColor={content.accentColor} titleColor={content.primaryTextColor} bodyColor={content.secondaryTextColor} />
    <section className="mt-10 grid gap-8 border-y border-white/[0.09] py-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div>
        <CheckCircle2 size={30} className="text-emerald-300" aria-hidden="true" />
        <p className="mt-5 text-[10px] uppercase tracking-[0.2em] text-zinc-600">Public reference</p>
        <div className="mt-2 flex flex-wrap items-center gap-4"><p className="text-2xl font-semibold tracking-[0.04em] text-white sm:text-3xl">{reference}</p><button type="button" onClick={copyReference} className="inline-flex min-h-10 items-center gap-2 border-b border-white/[0.15] text-sm text-zinc-300 hover:border-orange-300/60 hover:text-white"><Copy size={15} />{copied ? 'Copied' : 'Copy reference'}</button></div>
        <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400">This is a request for review, not a confirmed booking or meeting. The preferred schedule has been sent for confirmation where provided.</p>
      </div>
      <dl className="border-t border-orange-300/60">
        <Summary label="Branch" value={confirmation.branch} />
        <Summary label="Service" value={confirmation.service} />
        {confirmation.creative && <Summary label="Creative" value={confirmation.creative} />}
      </dl>
    </section>
    <div className="mt-8 flex flex-wrap gap-5"><Link to="/services" className="inline-flex min-h-11 items-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 hover:bg-orange-200">Return to Services <ArrowRight size={15} /></Link><Link to="/creatives" className="inline-flex min-h-11 items-center border-b border-white/[0.15] text-sm text-zinc-300 hover:text-white">Explore Creatives</Link></div>
  </div>;
}

function Summary({ label, value }) { return <div className="border-b border-white/[0.08] py-4"><dt className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">{label}</dt><dd className="mt-1 text-sm text-zinc-300">{value}</dd></div>; }
