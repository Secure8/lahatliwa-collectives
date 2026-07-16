import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminNotice, AdminPageHeader, ResponsiveFormSection, StickyMobileActions } from '../../components/admin/AdminUI';
import ServiceTaxonomyPreview from '../../components/admin/ServiceTaxonomyPreview';
import LoadingState from '../../components/LoadingState';
import { defaultPageContent } from '../../data/siteContent';
import { fetchPageContent, updatePageContent, uploadSiteAsset } from '../../lib/contentApi';
import { uploadStatusText } from '../../lib/imageCompression';
import { branchKeyFromRecord } from '../../lib/serviceRequest';
import UnsavedChangesGuard from '../../components/admin/UnsavedChangesGuard';
import { useAdminConfirmation } from '../../components/admin/AdminDialog';

const pageMeta = {
  home: {
    title: 'Edit Home Page',
    publicPath: '/',
    helper: 'Update the home hero, featured content, services preview, and hero background settings.',
  },
  about: {
    title: 'Edit About Page',
    publicPath: '/about',
    helper: 'Update the About page heading, introduction, and purpose copy. The supporting platform relationship sections remain consistent site-wide.',
  },
  services: {
    title: 'Edit Services Page',
    publicPath: '/services',
    helper: 'Update the Services page heading, intro copy, theme colors, and fallback service categories.',
  },
  contact: {
    title: 'Edit Contact Page',
    publicPath: '/contact',
    helper: 'Update the Contact page heading, description, CTA text, notes, and theme colors.',
  },
};

const lineInput = 'w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-2.5 text-white outline-none transition placeholder:text-zinc-700 focus:border-amber-200/60';
const lineTextarea = `${lineInput} min-h-28 resize-y leading-6`;

function LineButton({ children, to, href, onClick, subtle = false, external = false, disabled = false, ...props }) {
  const classes = `inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${subtle ? 'border-white/[0.1] bg-transparent text-zinc-400 shadow-none hover:border-white/[0.18] hover:bg-white/[0.05] hover:text-white' : 'border-white/[0.15] bg-zinc-800/80 text-zinc-100 hover:border-amber-200/35 hover:bg-zinc-700/80 hover:text-white'}`;
  if (to) return <Link to={to} className={classes} {...props}>{children}</Link>;
  if (href && !external) return <Link to={href} className={classes} {...props}>{children}</Link>;
  if (href) return <a href={href} target="_blank" rel="noreferrer noopener" className={classes} {...props}>{children}</a>;
  return <button type="button" onClick={onClick} disabled={disabled} className={classes} {...props}>{children}</button>;
}

function Section({ title, description, children }) {
  return <ResponsiveFormSection title={title} description={description}>{children}</ResponsiveFormSection>;
}

function Field({ label, value, onChange, placeholder, type = 'text', error, hint, onBlur, required = false, min, max, step, disabled = false }) {
  return (
    <label className="grid gap-1.5 text-sm text-zinc-300">
      <span>{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        className={`${lineInput} disabled:cursor-not-allowed disabled:text-zinc-500`}
      />
      {error ? <span className="text-xs text-red-200">{error}</span> : hint ? <span className="text-xs text-zinc-600">{hint}</span> : null}
    </label>
  );
}

function Textarea({ label, value, onChange, placeholder, rows = 4, error, hint, onBlur, required = false }) {
  return (
    <label className="grid gap-1.5 text-sm text-zinc-300">
      <span>{label}</span>
      <textarea
        required={required}
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={lineTextarea}
      />
      {error ? <span className="text-xs text-red-200">{error}</span> : hint ? <span className="text-xs text-zinc-600">{hint}</span> : null}
    </label>
  );
}

function Select({ label, value, options, onChange, error, hint }) {
  return (
    <label className="grid gap-1.5 text-sm text-zinc-300">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={lineInput} aria-invalid={Boolean(error)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
      {error ? <span className="text-xs text-red-200">{error}</span> : hint ? <span className="text-xs text-zinc-600">{hint}</span> : null}
    </label>
  );
}

function ColorField({ label, value, onChange, hint }) {
  return (
    <label className="grid gap-1.5 text-sm text-zinc-300">
      <span>{label}</span>
      <div className="flex items-center gap-3 border-b border-white/[0.12] py-2.5 text-zinc-300">
        <input type="color" value={value || '#000000'} onChange={(event) => onChange(event.target.value)} className="h-8 w-10 bg-transparent" />
        <span className="font-mono text-xs text-zinc-400">{value || '—'}</span>
      </div>
      {hint && <span className="text-xs text-zinc-600">{hint}</span>}
    </label>
  );
}

function UploadRow({ label, value, onFile, onClear, hint, error, disabled = false }) {
  return (
    <div className="grid gap-3 border-t border-white/[0.07] pt-4">
      <div className="grid gap-1.5 text-sm text-zinc-300">
        <span>{label}</span>
        {hint && <span className="text-xs text-zinc-600">{hint}</span>}
        {error && <span className="text-xs text-red-200">{error}</span>}
      </div>
      {value ? <img src={value} alt="" className="max-h-28 max-w-full object-cover" /> : <div className="grid h-20 place-items-center border-b border-white/[0.06] text-xs text-zinc-600">No image selected</div>}
      <div className="flex flex-wrap items-center gap-3">
        <label className={`inline-flex h-10 cursor-pointer items-center gap-2 border-b px-2 text-sm text-zinc-300 transition hover:border-amber-200/40 hover:text-white ${disabled ? 'pointer-events-none opacity-50' : 'border-white/[0.12]'}`}>
          Choose image
          <input className="sr-only" type="file" accept="image/*" disabled={disabled} onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        {value && <button type="button" onClick={onClear} className="inline-flex h-10 items-center border-b border-white/[0.12] px-2 text-sm text-zinc-400 transition hover:border-red-300/35 hover:text-red-100">Remove</button>}
      </div>
    </div>
  );
}

function getFallback(pageKey) {
  return defaultPageContent[pageKey] || {};
}

function normalizeString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseListText(value = '') {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function listText(value) {
  return normalizeArray(value).join(', ');
}

function buildInitialState(pageKey, remoteContent, draft) {
  const merged = { ...getFallback(pageKey), ...(remoteContent || {}) };
  if (!draft) return merged;
  return { ...merged, ...draft };
}

function validateUrl(value = '') {
  if (!value) return true;
  return /^(https?:\/\/|\/)/i.test(value);
}

function validateContent(pageKey, content) {
  const errors = {};

  if (pageKey === 'home') {
    if (!normalizeString(content.heroTitle).trim()) errors.heroTitle = 'Hero title is required.';
    if (!normalizeString(content.heroEyebrow).trim()) errors.heroEyebrow = 'Hero eyebrow is required.';
    if (!normalizeString(content.featuredHeading).trim()) errors.featuredHeading = 'Featured heading is required.';
    if (!normalizeString(content.servicesHeading).trim()) errors.servicesHeading = 'Services heading is required.';
    if (normalizeString(content.heroDescription).trim().length > 260) errors.heroDescription = 'Keep the hero description concise.';
    if (normalizeString(content.servicesIntro).trim().length > 260) errors.servicesIntro = 'Keep the services intro concise.';
    if (content.heroBackgroundImageUrl && !validateUrl(content.heroBackgroundImageUrl)) errors.heroBackgroundImageUrl = 'Enter a valid public image URL.';
  }

  if (pageKey === 'about') {
    if (!normalizeString(content.title).trim()) errors.title = 'Page title is required.';
    if (normalizeString(content.intro).trim().length > 260) errors.intro = 'Keep the intro concise.';
    if (normalizeString(content.journey).trim().length > 700) errors.journey = 'Keep the story section readable and balanced.';
  }

  if (pageKey === 'services') {
    if (!normalizeString(content.title).trim()) errors.title = 'Page title is required.';
    if (normalizeString(content.intro).trim().length > 260) errors.intro = 'Keep the intro concise.';
    if ((content.groups || []).some((group) => !normalizeString(group?.name).trim())) errors.groups = 'Each service group needs a name.';
    (content.groups || []).forEach((group, index) => {
      if (normalizeString(group?.description).trim().length > 260) {
        errors[`groupDescription-${index}`] = 'Keep each service description concise.';
      }
      if (group?.iconUrl && !validateUrl(group.iconUrl)) errors[`groupIconUrl-${index}`] = 'Enter a valid icon URL.';
      if (group?.customIconUrl && !validateUrl(group.customIconUrl)) errors[`groupCustomIconUrl-${index}`] = 'Enter a valid custom icon URL.';
      if (group?.serviceLogoUrl && !validateUrl(group.serviceLogoUrl)) errors[`groupServiceLogoUrl-${index}`] = 'Enter a valid service logo URL.';
    });
  }

  if (pageKey === 'contact') {
    if (!normalizeString(content.heading).trim()) errors.heading = 'Heading is required.';
    if (!normalizeString(content.ctaText).trim()) errors.ctaText = 'CTA text is required.';
    if (normalizeString(content.description).trim().length > 260) errors.description = 'Keep the description concise.';
    if (normalizeString(content.notes).trim().length > 240) errors.notes = 'Keep the notes concise.';
  }

  return errors;
}

function updateGroup(content, index, patch) {
  const groups = [...normalizeArray(content.groups)];
  groups[index] = { ...(groups[index] || {}), ...patch };
  return { ...content, groups };
}

export default function ContentEditor() {
  const { pageKey } = useParams();
  const meta = pageMeta[pageKey];
  const fallback = useMemo(() => getFallback(pageKey), [pageKey]);
  const draftKey = useMemo(() => `hevv-content-editor-draft-v3:${pageKey}`, [pageKey]);
  const [content, setContent] = useState(fallback);
  const [loading, setLoading] = useState(true);
  const [draftReady, setDraftReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { requestConfirmation, confirmationDialog } = useAdminConfirmation();
  const [saving, setSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const skipNextDraftSave = useRef(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    let active = true;

    async function loadContent() {
      setLoading(true);
      setDraftReady(false);
      setDirty(false);
      setError('');
      setFieldErrors({});

      try {
        const remoteContent = await fetchPageContent(pageKey).catch(() => null);
        let draft = null;
        try {
          draft = JSON.parse(window.localStorage.getItem(draftKey) || 'null');
        } catch {
          draft = null;
        }

        const nextContent = buildInitialState(pageKey, remoteContent, draft?.content);
        if (!active) return;
        setContent(nextContent);
        setDraftReady(true);
        setDirty(Boolean(draft));
      } finally {
        if (active) setLoading(false);
      }
    }

    loadContent();

    return () => {
      active = false;
    };
  }, [pageKey, draftKey]);

  useEffect(() => {
    if (!draftReady || !dirty) return;
    if (skipNextDraftSave.current) {
      skipNextDraftSave.current = false;
      return;
    }
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ content }));
    } catch {
    }
  }, [content, dirty, draftKey, draftReady]);

  function patch(updates) {
    setContent((current) => {
      const next = { ...current, ...updates };
      setMessage('');
      setError('');
      setFieldErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        Object.keys(updates).forEach((key) => delete nextErrors[key]);
        return nextErrors;
      });
      setDirty(true);
      return next;
    });
  }

  function patchServiceGroup(index, updates) {
    setContent((current) => {
      const next = updateGroup(current, index, updates);
      setMessage('');
      setError('');
      setFieldErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        const errorKeys = {
          name: 'groups',
          description: `groupDescription-${index}`,
          serviceLogoUrl: `groupServiceLogoUrl-${index}`,
          customIconUrl: `groupCustomIconUrl-${index}`,
          iconUrl: `groupIconUrl-${index}`,
        };
        Object.keys(updates).forEach((key) => delete nextErrors[errorKeys[key]]);
        return nextErrors;
      });
      setDirty(true);
      return next;
    });
  }

  async function uploadHomeBackground(file) {
    if (!file) return;
    setSaving(true);
    setError('');
    setUploadStatus('');
    let optimizedMessage = '';
    try {
      const url = await uploadSiteAsset(file, 'backgrounds', 'siteImage', {
        onStatus(status) {
          setUploadStatus(uploadStatusText(status));
          if (status?.message) optimizedMessage = status.message;
        },
      });
      patch({ heroBackgroundImageUrl: url });
      setUploadStatus(optimizedMessage || 'Background image uploaded.');
    } catch (uploadError) {
      setError(uploadError.message || 'Background upload failed.');
    } finally {
      setSaving(false);
    }
  }

  async function uploadServiceLogo(index, file) {
    if (!file) return;
    setSaving(true);
    setError('');
    setUploadStatus('');
    let optimizedMessage = '';
    try {
      const url = await uploadSiteAsset(file, 'service-logos', 'serviceMedia', {
        onStatus(status) {
          setUploadStatus(uploadStatusText(status));
          if (status?.message) optimizedMessage = status.message;
        },
      });
      patchServiceGroup(index, { serviceLogoUrl: url });
      setUploadStatus(optimizedMessage || 'Service logo uploaded.');
    } catch (uploadError) {
      setError(uploadError.message || 'Service logo upload failed.');
    } finally {
      setSaving(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;
    const formElement = event.currentTarget;
    setSaving(true);
    setError('');
    setMessage('');
    setFieldErrors({});

    try {
      const validationErrors = validateContent(pageKey, content);
      if (Object.keys(validationErrors).length > 0) {
        setFieldErrors(validationErrors);
        setError('Fix the highlighted fields before saving.');
        setSaving(false);
        window.requestAnimationFrame(() => {
          const firstInvalid = formElement.querySelector('[aria-invalid="true"]');
          firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          firstInvalid?.focus({ preventScroll: true });
        });
        return;
      }

      await updatePageContent(pageKey, content);
      skipNextDraftSave.current = true;
      setDirty(false);
      setMessage('Page content saved.');
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
      }
    } catch (saveError) {
      setError(saveError.message || 'Unable to save page content.');
    } finally {
      setSaving(false);
    }
  }

  function discardDraft() {
    requestConfirmation({
      title: 'Discard unsaved page content?',
      description: 'The editor will reload the last saved page content. Your current changes will be lost.',
      confirmLabel: 'Discard changes',
      destructive: true,
      onConfirm: performDiscardDraft,
    });
  }

  function performDiscardDraft() {
    const next = fallback;
    setContent(next);
    setDirty(false);
    setFieldErrors({});
    setMessage('Unsaved changes discarded.');
    setError('');
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
    }
  }

  if (!meta) {
    return (
      <AdminLayout>
        <AdminNotice>Unknown page content key.</AdminNotice>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <UnsavedChangesGuard dirty={draftReady && dirty && !saving} />
      <AdminPageHeader
        eyebrow="Website CMS"
        title={meta.title}
        description={meta.helper}
        action={
          <>
            <LineButton to="/admin/content" subtle>Back</LineButton>
            <LineButton to={meta.publicPath} subtle>Preview</LineButton>
            <LineButton href={meta.publicPath} subtle external aria-label="Open public page">Open</LineButton>
          </>
        }
      />

      {loading ? (
        <LoadingState label="Loading content" />
      ) : (
        <form onSubmit={save} className="grid gap-5">
          <div className="grid gap-6">
            <Section title="Content Fields" description="Edit the structured page fields below.">
              <div className="grid gap-6">
                <PageFields
                  pageKey={pageKey}
                  content={content}
                  patch={patch}
                  patchServiceGroup={patchServiceGroup}
                  uploadHomeBackground={uploadHomeBackground}
                  uploadServiceLogo={uploadServiceLogo}
                  fieldErrors={fieldErrors}
                />
              </div>
            </Section>

            <Section
              title="Save Actions"
              description="Save updates this page only. Discard reloads the saved content without leaving the editor."
            >
              {message && <AdminNotice tone="success" role="status">{message}</AdminNotice>}
              {uploadStatus && <AdminNotice tone="success" role="status">{uploadStatus}</AdminNotice>}
              {error && <AdminNotice role="alert">{error}</AdminNotice>}
              <StickyMobileActions>
                <AdminButton type="submit" variant="primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</AdminButton>
                <AdminButton type="button" variant="ghost" onClick={discardDraft} disabled={!dirty || saving}>Discard Changes</AdminButton>
                <LineButton to={meta.publicPath} subtle>Preview</LineButton>
                <LineButton href={meta.publicPath} subtle external aria-label="Open public page">Open</LineButton>
              </StickyMobileActions>
            </Section>
          </div>
        </form>
      )}
      {confirmationDialog}
    </AdminLayout>
  );
}

function PageFields({ pageKey, content, patch, patchServiceGroup, uploadHomeBackground, uploadServiceLogo, fieldErrors }) {
  if (pageKey === 'home') {
    return (
      <>
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Hero eyebrow" value={content.heroEyebrow || ''} onChange={(value) => patch({ heroEyebrow: value })} error={fieldErrors.heroEyebrow} hint="Small text displayed above the main heading." required />
          <Field label="Hero title" value={content.heroTitle || ''} onChange={(value) => patch({ heroTitle: value })} error={fieldErrors.heroTitle} hint="Primary heading shown in the hero section." required />
        </div>
        <Textarea label="Hero description" value={content.heroDescription || ''} onChange={(value) => patch({ heroDescription: value })} error={fieldErrors.heroDescription} hint="Keep this concise for better page balance." rows={4} />
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Primary CTA label" value={content.primaryCta || ''} onChange={(value) => patch({ primaryCta: value })} hint="Displayed as the main action label." />
          <Field label="Secondary CTA label" value={content.secondaryCta || ''} onChange={(value) => patch({ secondaryCta: value })} hint="Displayed beside the main hero action." />
          <Field label="Featured heading" value={content.featuredHeading || ''} onChange={(value) => patch({ featuredHeading: value })} error={fieldErrors.featuredHeading} hint="Section heading shown above featured work." required />
          <Field label="Services heading" value={content.servicesHeading || ''} onChange={(value) => patch({ servicesHeading: value })} error={fieldErrors.servicesHeading} hint="Section heading shown above the services preview." required />
        </div>
        <Textarea label="Services intro" value={content.servicesIntro || ''} onChange={(value) => patch({ servicesIntro: value })} error={fieldErrors.servicesIntro} hint="Short intro text displayed above the service cards." rows={4} />
        <div className="grid gap-6 md:grid-cols-2">
          <ColorField label="Hero title color" value={content.heroTitleColor || ''} onChange={(value) => patch({ heroTitleColor: value })} />
          <ColorField label="Hero description color" value={content.heroDescriptionColor || ''} onChange={(value) => patch({ heroDescriptionColor: value })} />
          <ColorField label="Section heading color" value={content.sectionHeadingColor || ''} onChange={(value) => patch({ sectionHeadingColor: value })} />
          <ColorField label="Accent text color" value={content.accentTextColor || ''} onChange={(value) => patch({ accentTextColor: value })} />
        </div>
        <UploadRow
          label="Hero background image"
          value={content.heroBackgroundImageUrl || ''}
          onFile={uploadHomeBackground}
          onClear={() => patch({ heroBackgroundImageUrl: '' })}
          hint="Recommended for the home hero background. Existing image optimization still applies."
          error={fieldErrors.heroBackgroundImageUrl}
        />
        <div className="grid gap-6 md:grid-cols-2">
          <Field label="Background position" value={content.heroBackgroundPosition || 'center'} onChange={(value) => patch({ heroBackgroundPosition: value })} hint="Controls how the hero image is positioned." />
          <Select label="Background style" value={content.heroBackgroundStyle || 'none'} options={['none', 'soft-cover', 'split-image', 'ambient-blur', 'subtle-texture']} onChange={(value) => patch({ heroBackgroundStyle: value })} hint="Select the visual treatment used on the home hero." />
          <Field label="Overlay opacity" type="number" min="0" max="1" step="0.05" value={content.heroBackgroundOverlayOpacity ?? 0.55} onChange={(value) => patch({ heroBackgroundOverlayOpacity: Number(value) })} hint="Controls how dark the overlay sits over the image." />
          <Field label="Background blur" type="number" min="0" max="24" step="1" value={content.heroBackgroundBlur ?? 0} onChange={(value) => patch({ heroBackgroundBlur: Number(value) })} hint="Only used with blur-based hero treatments." />
        </div>
      </>
    );
  }

  if (pageKey === 'about') {
    return (
      <>
        <Field label="Page title" value={content.title || ''} onChange={(value) => patch({ title: value })} error={fieldErrors.title} hint="Main heading shown on the About page." required />
        <Textarea label="Introduction" value={content.intro || ''} onChange={(value) => patch({ intro: value })} error={fieldErrors.intro} hint="Keep this concise for better page balance." rows={4} />
        <Textarea label="Purpose and journey" value={content.journey || ''} onChange={(value) => patch({ journey: value })} error={fieldErrors.journey} hint="Explain why the platform was built and how it helps organize or credit the work." rows={6} />
        <div className="grid gap-6 md:grid-cols-3">
          <ColorField label="Heading color" value={content.headingColor || ''} onChange={(value) => patch({ headingColor: value })} />
          <ColorField label="Body text color" value={content.bodyTextColor || ''} onChange={(value) => patch({ bodyTextColor: value })} />
          <ColorField label="Accent color" value={content.accentColor || ''} onChange={(value) => patch({ accentColor: value })} />
        </div>
      </>
    );
  }

  if (pageKey === 'services') {
    return (
      <>
        <Field label="Page title" value={content.title || ''} onChange={(value) => patch({ title: value })} error={fieldErrors.title} hint="Main heading shown on the Services page." required />
        <Textarea label="Introduction" value={content.intro || ''} onChange={(value) => patch({ intro: value })} error={fieldErrors.intro} hint="Short intro text shown before the service groups." rows={4} />
        <div className="grid gap-6 md:grid-cols-2">
          <ColorField label="Heading color" value={content.headingColor || ''} onChange={(value) => patch({ headingColor: value })} />
          <ColorField label="Body text color" value={content.bodyTextColor || ''} onChange={(value) => patch({ bodyTextColor: value })} />
          <ColorField label="Service title color" value={content.serviceTitleColor || ''} onChange={(value) => patch({ serviceTitleColor: value })} />
          <ColorField label="Icon color" value={content.iconColor || ''} onChange={(value) => patch({ iconColor: value })} />
        </div>
        <div className="grid gap-5">
          {(content.groups || []).map((group, index) => (
            <section key={`${group.name || 'service'}-${index}`} className="grid gap-5 border-t border-white/[0.07] py-5 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium text-zinc-200">{group.name?.trim() || 'Untitled service group'}</p>
                <button
                  type="button"
                  onClick={() => patch({ groups: (content.groups || []).filter((_, groupIndex) => groupIndex !== index) })}
                  className="inline-flex h-10 items-center border-b border-white/[0.12] px-2 text-sm text-zinc-400 transition hover:border-red-300/35 hover:text-red-100"
                >
                  Remove group
                </button>
              </div>
              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Service name" value={group.name || ''} onChange={(value) => patchServiceGroup(index, { name: value })} error={fieldErrors.groups} required />
                <Field label="Lucide icon name" value={group.iconName || ''} onChange={(value) => patchServiceGroup(index, { iconName: value })} hint="Used when no custom icon image is set." />
              </div>
              <Textarea label="Description" value={group.description || ''} onChange={(value) => patchServiceGroup(index, { description: value })} error={fieldErrors[`groupDescription-${index}`]} hint="Describe flexible support without implying a guaranteed package, schedule, location, or acceptance." rows={4} />
              {branchKeyFromRecord(group) ? (
                <ServiceTaxonomyPreview branchKey={branchKeyFromRecord(group)} />
              ) : (
                <Textarea label="Service categories, comma-separated" value={listText(group.items)} onChange={(value) => patchServiceGroup(index, { items: parseListText(value) })} hint="Choose one of the four standard Liwa branch names to use the shared six-category taxonomy." rows={4} />
              )}
              <div className="grid gap-6 md:grid-cols-2">
                <Field label="Service logo URL" value={group.serviceLogoUrl || ''} onChange={(value) => patchServiceGroup(index, { serviceLogoUrl: value })} error={fieldErrors[`groupServiceLogoUrl-${index}`]} hint="Optional logo shown beside the icon." />
                <Field label="Custom icon URL" value={group.customIconUrl || group.iconUrl || ''} onChange={(value) => patchServiceGroup(index, { customIconUrl: value, iconUrl: '' })} error={fieldErrors[`groupCustomIconUrl-${index}`]} hint="Optional replacement for the Lucide icon." />
              </div>
              <Field label="Fallback icon image URL" value={group.iconUrl || ''} onChange={(value) => patchServiceGroup(index, { iconUrl: value })} error={fieldErrors[`groupIconUrl-${index}`]} hint="Used by the public page if an icon image exists." />
              <UploadRow
                label="Service logo upload"
                value={group.serviceLogoUrl || ''}
                onFile={(file) => uploadServiceLogo(index, file)}
                onClear={() => patchServiceGroup(index, { serviceLogoUrl: '' })}
                hint="Upload a small logo for this service group. Existing optimization stays active."
                error={fieldErrors[`groupServiceLogoUrl-${index}`]}
              />
            </section>
          ))}
          <button
            type="button"
            onClick={() => patch({ groups: [...(content.groups || []), { name: 'New Service', description: '', items: [], iconName: 'Circle', iconUrl: '', customIconUrl: '', serviceLogoUrl: '' }] })}
            className="inline-flex h-10 w-fit items-center gap-2 border-b border-white/[0.12] px-2 text-sm text-zinc-300 transition hover:border-amber-200/40 hover:text-white"
          >
            Add group
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <Field label="Heading" value={content.heading || ''} onChange={(value) => patch({ heading: value })} error={fieldErrors.heading} hint="Main heading shown at the top of the Contact page." required />
      <Textarea label="Description" value={content.description || ''} onChange={(value) => patch({ description: value })} error={fieldErrors.description} hint="Short intro text shown under the heading." rows={4} />
      <Field label="CTA text" value={content.ctaText || ''} onChange={(value) => patch({ ctaText: value })} error={fieldErrors.ctaText} hint="Label used on the contact email button." required />
      <Textarea label="Contact notes" value={content.notes || ''} onChange={(value) => patch({ notes: value })} error={fieldErrors.notes} hint="Extra notes shown below the CTA." rows={4} />
      <div className="grid gap-6 md:grid-cols-3">
        <ColorField label="Heading color" value={content.headingColor || ''} onChange={(value) => patch({ headingColor: value })} />
        <ColorField label="Body text color" value={content.bodyTextColor || ''} onChange={(value) => patch({ bodyTextColor: value })} />
        <ColorField label="Accent color" value={content.accentColor || ''} onChange={(value) => patch({ accentColor: value })} />
      </div>
    </>
  );
}
