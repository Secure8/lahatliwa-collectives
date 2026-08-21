import { CheckCircle2, MessageSquareText, Send, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { loadPublicCreativePost } from '../lib/creativePosts';
import { supabase } from '../lib/supabaseClient';

const DRAFT_KEY = 'lahat-liwa-public-inquiry-rail-v1';

function makeContext(work, creative) {
  if (!work) return null;
  const creativeInfo = creative || work.creative_members || {};
  return {
    type: 'work',
    id: work.id,
    slug: work.slug,
    title: work.title || 'Creative work',
    publicUrl: `/work/${work.slug}`,
    creative: creativeInfo.slug || '',
    creativeId: creativeInfo.id || '',
    creativeName: creativeInfo.name || 'the Creative',
    thumbnail: work.creative_post_media?.[0]?.display_url || '',
  };
}

function readDraft(initialContext = null) {
  try {
    const stored = JSON.parse(window.sessionStorage.getItem(DRAFT_KEY) || 'null');
    if (!stored || typeof stored !== 'object') {
      return { clientName: '', clientEmail: '', details: '', creativeSlug: initialContext?.creative || '', context: initialContext || null };
    }
    return { ...{ clientName: '', clientEmail: '', details: '', creativeSlug: initialContext?.creative || '', context: initialContext || null }, ...stored, context: initialContext || stored.context || null };
  } catch {
    return { clientName: '', clientEmail: '', details: '', creativeSlug: initialContext?.creative || '', context: initialContext || null };
  }
}

function responseError(error) {
  const message = error?.message || 'Your inquiry couldn’t be sent. Please try again.';
  if (/Access-Control|origin|400|403/i.test(message)) return 'Your inquiry couldn’t be sent. Please try again.';
  return message;
}

export default function InquiryRail({ context = null, title = 'Inquiry', compact = false }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [creatives, setCreatives] = useState([]);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');
  const [state, setState] = useState(() => readDraft(context));
  const routeWorkSlug = searchParams.get('work');

  const workContext = useMemo(() => {
    if (context?.type === 'work') return context;
    return null;
  }, [context]);

  useEffect(() => {
    if (routeWorkSlug) {
      let active = true;
      loadPublicCreativePost(routeWorkSlug).then((post) => {
        if (!active || !post) return;
        const nextContext = makeContext(post, post.creative_members);
        setState((current) => ({ ...current, context: nextContext, creativeSlug: nextContext?.creative || current.creativeSlug, clientName: current.clientName || '', clientEmail: current.clientEmail || '' }));
      }).catch(() => undefined);
      return () => { active = false; };
    }
  }, [routeWorkSlug]);

  useEffect(() => {
    let active = true;
    supabase.from('creative_members').select('id,name,slug,role,profile_image_url').eq('is_published', true).order('display_order', { ascending: true, nullsFirst: false }).then(({ data }) => {
      if (!active) return;
      setCreatives(data || []);
      if (workContext?.creative) {
        setState((current) => ({ ...current, creativeSlug: workContext.creative }));
      }
    });
    return () => { active = false; };
  }, [workContext]);

  useEffect(() => {
    try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  const validRecipient = (state.context?.creative || state.creativeSlug || '').trim();
  const creativeMatch = creatives.find((creative) => creative.slug === validRecipient) || null;

  function updateField(key, value) {
    setSubmitError('');
    setState((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    if (!validRecipient) {
      setSubmitError('Choose the Creative you want to contact.');
      return;
    }
    if (!state.clientName.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.clientEmail.trim()) || state.details.trim().length < 20) {
      setSubmitError('Please add your name, a valid email, and a message with at least 20 characters.');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const request = {
        clientName: state.clientName.trim(),
        clientEmail: state.clientEmail.trim(),
        clientPhone: '',
        organization: '',
        preferredContactMethod: 'Email',
        summary: state.context?.title ? `Question about ${state.context.title}` : 'General inquiry',
        details: state.details.trim(),
        preferredSchedule: '',
        generalLocation: '',
        budgetRange: '',
        consent: true,
        honeypot: '',
        branch: 'general',
        serviceKey: 'general-inquiry',
        creativeSlug: validRecipient,
        inquiryKind: 'creative',
        inquiryCategory: '',
        serviceMode: '',
        branchDetails: {
          context_type: state.context?.type || 'general',
          work_id: state.context?.id || null,
          work_title: state.context?.title || '',
          work_slug: state.context?.slug || '',
          work_public_path: state.context?.publicUrl || '',
          creative_id: creativeMatch?.id || state.context?.creativeId || null,
          creative_name: creativeMatch?.name || state.context?.creativeName || '',
          creative_slug: validRecipient,
          source_action: state.context ? 'work-detail-inquiry' : 'general-inquiry',
        },
        editorialContext: null,
        projectContext: state.context?.type === 'work' ? state.context : null,
        idempotencyKey: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      };
      const { data, error } = await supabase.functions.invoke('submit-service-request', { body: { action: 'submit', request, sourcePath: `${location.pathname}${location.search}` } });
      if (error) throw error;
      if (!data?.success || !data.reference) throw new Error(data?.message || 'The inquiry couldn’t be sent.');
      setSuccess(`Inquiry sent to ${creativeMatch?.name || state.context?.creativeName || 'the selected Creative'}.`);
      setState((current) => ({ ...current, details: '' }));
      try { window.sessionStorage.removeItem(DRAFT_KEY); } catch {}
    } catch (error) {
      setSubmitError(responseError(error));
    } finally {
      setSubmitting(false);
    }
  }

  function clearContext() {
    setState((current) => ({ ...current, context: null, creativeSlug: current.creativeSlug || '' }));
  }

  return (
    <aside className={`ll-public-inquiry-rail${compact ? ' ll-public-inquiry-rail--compact' : ''}`}>
      <div className="ll-public-inquiry-rail__header">
        <p className="ll-kicker">{title}</p>
        <h3>{state.context ? 'About this work' : 'Start a conversation'}</h3>
      </div>

      {success ? (
        <div className="ll-inquiry-success" role="status" aria-live="polite">
          <CheckCircle2 size={22} className="text-emerald-300" />
          <p>Inquiry sent</p>
          <span>{success}</span>
          <button type="button" onClick={() => { setSuccess(''); setSubmitError(''); setState((current) => ({ ...current, details: '', clientName: '', clientEmail: '' })); }}>Send another message</button>
        </div>
      ) : (
        <form onSubmit={submit} className="ll-public-inquiry-rail__form" aria-label="Public inquiry rail">
          {state.context && (
            <div className="ll-inquiry-context-block">
              <div className="ll-inquiry-context-block__media">
                {state.context.thumbnail ? <img src={state.context.thumbnail} alt="" loading="lazy" /> : <MessageSquareText size={18} />}
              </div>
              <div>
                <p>About this work</p>
                <strong>{state.context.title}</strong>
                <span>by {state.context.creativeName || 'the Creative'}</span>
              </div>
              <button type="button" aria-label="Remove work context" onClick={clearContext}><X size={15} /></button>
            </div>
          )}

          {!state.context && (
            <label className="ll-inquiry-field ll-inquiry-field--wide">
              <span>Who would you like to contact?</span>
              <select value={state.creativeSlug} onChange={(event) => updateField('creativeSlug', event.target.value)} className="dark-select">
                <option value="">Select a Creative</option>
                {creatives.map((creative) => <option key={creative.id} value={creative.slug}>{creative.name}</option>)}
              </select>
            </label>
          )}

          {state.context && (
            <div className="ll-inquiry-recipient-line">
              Recipient: <strong>{creativeMatch?.name || state.context.creativeName || 'Creative'}</strong>
            </div>
          )}

          <label className="ll-inquiry-field">
            <span>Your name</span>
            <input type="text" value={state.clientName} onChange={(event) => updateField('clientName', event.target.value)} placeholder="Your name" />
          </label>

          <label className="ll-inquiry-field">
            <span>Email</span>
            <input type="email" value={state.clientEmail} onChange={(event) => updateField('clientEmail', event.target.value)} placeholder="you@example.com" />
          </label>

          <label className="ll-inquiry-field ll-inquiry-field--wide">
            <span>Message</span>
            <textarea rows={6} value={state.details} onChange={(event) => updateField('details', event.target.value)} placeholder={state.context ? 'I’m interested in creating something similar for my café.' : 'Tell the Creative a little about your idea, project, or question.'} />
          </label>

          {submitError && <p className="ll-inquiry-error" role="alert">{submitError}</p>}

          <button type="submit" className="ll-primary-action ll-public-inquiry-rail__submit" disabled={submitting}>
            <Send size={16} /> {submitting ? 'Sending…' : 'Send inquiry'}
          </button>
        </form>
      )}
    </aside>
  );
}
