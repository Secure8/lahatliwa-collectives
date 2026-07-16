import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminNotice, AdminPageHeader, ResponsiveFormSection, StickyMobileActions } from '../../components/admin/AdminUI';
import { mergePublicContent, settingsFormFromRow, settingsFromSiteContent, updateSiteSettings, uploadSiteAsset, usePublicContent } from '../../lib/contentApi';
import { uploadStatusText } from '../../lib/imageCompression';
import { createHeroBackgroundRender } from '../../lib/heroBackground';
import UnsavedChangesGuard from '../../components/admin/UnsavedChangesGuard';
import { useAdminConfirmation } from '../../components/admin/AdminDialog';

const lineInput = 'w-full rounded-md border border-white/[0.14] bg-zinc-950 px-3 py-2.5 text-white outline-none transition placeholder:text-zinc-700 hover:border-white/[0.22] focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/15';
const lineTextarea = `${lineInput} min-h-28 resize-y leading-6`;

const socialFields = [
  { key: 'githubUrl', label: 'GitHub URL', placeholder: 'https://github.com/username' },
  { key: 'facebookUrl', label: 'Facebook URL', placeholder: 'https://facebook.com/username' },
  { key: 'instagramUrl', label: 'Instagram URL', placeholder: 'https://instagram.com/username' },
  { key: 'linkedinUrl', label: 'LinkedIn URL', placeholder: 'https://linkedin.com/in/username' },
  { key: 'youtubeUrl', label: 'YouTube URL', placeholder: 'https://youtube.com/@username' },
  { key: 'tiktokUrl', label: 'TikTok URL', placeholder: 'https://tiktok.com/@username' },
];

const settingsSections = [
  ['brand-identity', 'Brand identity'],
  ['logos-and-brand-media', 'Brand media'],
  ['global-colors', 'Global colors'],
  ['contact-or-global-links', 'Global links'],
  ['save-actions', 'Save actions'],
];

function isValidHexColor(value = '') {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(String(value).trim());
}

function normalizeHexColor(value = '') {
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!isValidHexColor(withHash)) return trimmed;
  const hex = withHash.slice(1);
  if (hex.length === 3) return `#${hex.split('').map((char) => `${char}${char}`).join('')}`.toLowerCase();
  return withHash.toLowerCase();
}

function isValidUrl(value = '') {
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  return /^(https?:\/\/|mailto:|\/)/i.test(trimmed);
}

function isValidEmail(value = '') {
  const trimmed = String(value).trim();
  if (!trimmed) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function lineButtonClasses({ subtle = false, disabled = false } = {}) {
  return `inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition ${subtle ? 'border-white/[0.1] bg-transparent text-zinc-400 hover:border-white/[0.18] hover:bg-white/[0.05] hover:text-white' : 'border-white/[0.15] bg-zinc-800/80 text-zinc-100 hover:border-amber-200/35 hover:bg-zinc-700/80 hover:text-white'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`;
}

function LineButton({ children, to, href, onClick, subtle = false, external = false, disabled = false, type = 'button' }) {
  const classes = lineButtonClasses({ subtle, disabled });
  if (to) return <Link to={to} className={classes}>{children}</Link>;
  if (href && !external) return <Link to={href} className={classes}>{children}</Link>;
  if (href) return <a href={href} target="_blank" rel="noreferrer noopener" className={classes}>{children}</a>;
  return <button type={type} onClick={onClick} disabled={disabled} className={classes}>{children}</button>;
}

function Section({ title, description, children }) {
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return <ResponsiveFormSection id={id} title={title} description={description}>{children}</ResponsiveFormSection>;
}

function Field({ label, value, onChange, placeholder, type = 'text', error, hint, onBlur, required = false, disabled = false, min, max, step, autoComplete }) {
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
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        autoComplete={autoComplete}
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

function ColorField({ label, value, savedValue, onChange, onReset, error, hint }) {
  const swatch = isValidHexColor(value) ? normalizeHexColor(value) : (isValidHexColor(savedValue) ? normalizeHexColor(savedValue) : '#000000');
  return (
    <label className="grid gap-1.5 text-sm text-zinc-300">
      <span>{label}</span>
      <div className="grid gap-2 border-b border-white/[0.12] pb-2.5">
        <div className="flex items-center gap-3">
          <input type="color" value={swatch} onChange={(event) => onChange(event.target.value)} className="h-8 w-10 bg-transparent" />
          <input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={() => {
              if (isValidHexColor(value)) onChange(normalizeHexColor(value));
            }}
            placeholder="#f5f5f4"
            aria-invalid={Boolean(error)}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-mono text-zinc-200 outline-none placeholder:text-zinc-700"
          />
          <span className="h-5 w-5 shrink-0 rounded-sm ring-1 ring-white/[0.12]" style={{ backgroundColor: swatch }} />
        </div>
        <div className="flex items-center justify-between gap-3 text-xs text-zinc-600">
          <span>{hint || 'Enter a hex color value or pick a swatch.'}</span>
          <button type="button" onClick={onReset} className="text-zinc-400 transition hover:text-white">Reset to saved</button>
        </div>
      </div>
      {error && <span className="text-xs text-red-200">{error}</span>}
    </label>
  );
}

function UploadField({ label, hint, value, previewClassName = '', previewAlt = '', renderPreview, onFile, onClear, uploading = false, error }) {
  return (
    <div className="grid gap-3 border-t border-white/[0.07] pt-4">
      <div className="grid gap-1.5 text-sm text-zinc-300">
        <span>{label}</span>
        {hint && <span className="text-xs text-zinc-600">{hint}</span>}
        {error && <span className="text-xs text-red-200">{error}</span>}
      </div>
      {value ? (
        renderPreview ? renderPreview(value) : <img src={value} alt={previewAlt} className={`max-w-full object-contain ${previewClassName}`} />
      ) : (
        <div className="grid h-24 place-items-center border-b border-white/[0.06] text-xs text-zinc-600">No image selected</div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className={`${lineButtonClasses({ subtle: false, disabled: uploading })} cursor-pointer`}>
          Replace image
          <input className="sr-only" type="file" accept="image/*" disabled={uploading} onChange={(event) => { onFile(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        {value && (
          <button
            type="button"
            onClick={onClear}
            className={lineButtonClasses({ subtle: true, disabled: uploading })}
            disabled={uploading}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function SettingsPreview({ form }) {
  const accent = isValidHexColor(form.accentColor) ? normalizeHexColor(form.accentColor) : '#f0c46a';
  const primary = isValidHexColor(form.primaryTextColor) ? normalizeHexColor(form.primaryTextColor) : '#f4f4f5';
  const secondary = isValidHexColor(form.secondaryTextColor) ? normalizeHexColor(form.secondaryTextColor) : '#a1a1aa';
  const muted = isValidHexColor(form.mutedTextColor) ? normalizeHexColor(form.mutedTextColor) : '#71717a';
  return (
    <aside className="hidden xl:block" aria-label="Live brand preview">
      <div className="sticky top-24 rounded-lg border border-white/[0.1] bg-zinc-900 p-4">
        <div className="mb-4"><p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-amber-200/70">Live preview</p><p className="mt-1 text-xs leading-5 text-zinc-500">Updates as you edit. Save to publish.</p></div>
        <div className="overflow-hidden rounded-md border border-white/[0.1] bg-[#0b0c0e]">
          <div className="border-b border-white/[0.08] p-3">
            {form.logoUrl ? <img src={form.logoUrl} alt="" className="h-7 max-w-full object-contain object-left" /> : <span className="text-xs font-bold" style={{ color: accent }}>{String(form.displayName || 'LL').split(/\s+/).map((word) => word[0]).join('').slice(0, 3)}</span>}
          </div>
          <div className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>Creative collective</p>
            <h3 className="mt-2 text-lg font-semibold leading-tight" style={{ color: primary }}>{form.displayName || 'Your brand name'}</h3>
            <p className="mt-2 text-xs leading-5" style={{ color: secondary }}>{form.tagline || 'Your brand tagline appears here.'}</p>
            <span className="mt-4 inline-flex rounded-md px-2.5 py-1.5 text-xs font-semibold text-zinc-950" style={{ backgroundColor: accent }}>Primary action</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2" aria-label="Current color palette">
          {[primary, secondary, muted, accent].map((color, index) => <span key={`${color}-${index}`} className="aspect-square rounded-md border border-white/[0.1]" style={{ backgroundColor: color }} title={color} />)}
        </div>
      </div>
    </aside>
  );
}

function normalizeSettingsForm(content) {
  return settingsFromSiteContent(mergePublicContent(content || {}));
}

export default function SiteSettings() {
  const { content, loading: contentLoading } = usePublicContent([]);
  const draftKey = 'hevv-site-settings-draft-v3';
  const [form, setForm] = useState(() => normalizeSettingsForm(content));
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(normalizeSettingsForm(content)));
  const [draftReady, setDraftReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const skipNextDraftSave = useRef(false);
  const pendingImageActions = useRef({});
  const { requestConfirmation, confirmationDialog } = useAdminConfirmation();

  useEffect(() => {
    if (dirty) return;
    let draft = null;
    try {
      draft = JSON.parse(window.localStorage.getItem(draftKey) || 'null');
    } catch {
      draft = null;
    }
    const base = normalizeSettingsForm(content);
    const nextForm = { ...base, ...(draft || {}) };
    setForm(nextForm);
    setSavedSnapshot(JSON.stringify(base));
    setDirty(Boolean(draft));
    setDraftReady(true);
  }, [content, draftKey, dirty]);

  useEffect(() => {
    if (!draftReady || !dirty) return;
    if (skipNextDraftSave.current) {
      skipNextDraftSave.current = false;
      return;
    }
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(form));
    } catch {
    }
  }, [dirty, draftKey, draftReady, form]);

  const currentSnapshot = JSON.stringify(form);
  const isDirty = dirty && currentSnapshot !== savedSnapshot;
  const canSave = !saving && !uploadingField;

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
    setDirty(true);
    setMessage('');
    setError('');
    setFieldErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function resetColor(key) {
    const saved = normalizeSettingsForm(content)[key];
    update(key, saved || '');
  }

  function validateForm(nextForm) {
    const nextErrors = {};
    if (!String(nextForm.displayName || '').trim()) nextErrors.displayName = 'Brand name is required.';
    if (!String(nextForm.legalName || '').trim()) nextErrors.legalName = 'Personal name is required.';
    if (!String(nextForm.tagline || '').trim()) nextErrors.tagline = 'Tagline is required.';
    if (String(nextForm.footerText || '').trim().length > 260) nextErrors.footerText = 'Keep the footer text concise.';
    if (!isValidEmail(nextForm.email)) nextErrors.email = 'Enter a valid email address.';
    if (String(nextForm.logoAlt || '').trim().length > 120) nextErrors.logoAlt = 'Keep the logo alt text concise.';
    if (String(nextForm.heroImageAlt || '').trim().length > 120) nextErrors.heroImageAlt = 'Keep the portrait alt text concise.';
    ['primaryTextColor', 'secondaryTextColor', 'mutedTextColor', 'accentColor', 'dividerLineColor'].forEach((key) => {
      const value = String(nextForm[key] || '').trim();
      if (value && !isValidHexColor(value)) nextErrors[key] = 'Enter a valid hex color like #f5f5f4.';
    });
    const overlay = Number(nextForm.defaultBackgroundOverlayOpacity);
    if (Number.isNaN(overlay) || overlay < 0 || overlay > 1) nextErrors.defaultBackgroundOverlayOpacity = 'Overlay opacity must be between 0 and 1.';
    socialFields.forEach((field) => {
      if (!isValidUrl(nextForm[field.key])) nextErrors[field.key] = 'Enter a valid URL, a mailto link, or leave it blank.';
    });
    return nextErrors;
  }

  async function uploadImage(field, file, folder = 'site', limitKey = 'siteImage') {
    if (!file) return;
    setUploadingField(field);
    setError('');
    setUploadStatus('');
    let optimizedMessage = '';
    try {
      const url = await uploadSiteAsset(file, folder, limitKey, {
        onStatus(status) {
          setUploadStatus(uploadStatusText(status));
          if (status?.message) optimizedMessage = status.message;
        },
      });
      pendingImageActions.current[field] = 'replace';
      update(field, url);
      setUploadStatus(optimizedMessage || 'Image uploaded.');
    } catch (uploadError) {
      setError(uploadError.message || 'Image upload failed.');
    } finally {
      setUploadingField('');
    }
  }

  async function save(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!canSave) return;
    setSaving(true);
    setError('');
    setMessage('');
    setFieldErrors({});

    const nextForm = {
      ...form,
      displayName: String(form.displayName || '').trim(),
      legalName: String(form.legalName || '').trim(),
      tagline: String(form.tagline || '').trim(),
      footerText: String(form.footerText || '').trim(),
      email: String(form.email || '').trim(),
      logoAlt: String(form.logoAlt || '').trim(),
      heroImageAlt: String(form.heroImageAlt || '').trim(),
      defaultBackgroundOverlayOpacity: Number(form.defaultBackgroundOverlayOpacity ?? 0.55),
      primaryTextColor: normalizeHexColor(form.primaryTextColor || ''),
      secondaryTextColor: normalizeHexColor(form.secondaryTextColor || ''),
      mutedTextColor: normalizeHexColor(form.mutedTextColor || ''),
      accentColor: normalizeHexColor(form.accentColor || ''),
      dividerLineColor: normalizeHexColor(form.dividerLineColor || ''),
      githubUrl: String(form.githubUrl || '').trim(),
      facebookUrl: String(form.facebookUrl || '').trim(),
      instagramUrl: String(form.instagramUrl || '').trim(),
      linkedinUrl: String(form.linkedinUrl || '').trim(),
      youtubeUrl: String(form.youtubeUrl || '').trim(),
      tiktokUrl: String(form.tiktokUrl || '').trim(),
    };

    const validationErrors = validateForm(nextForm);
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

    try {
      const imageActions = { ...pendingImageActions.current };
      const { row, skippedColumns = [] } = await updateSiteSettings(nextForm);
      const confirmedForm = settingsFormFromRow(row);
      skipNextDraftSave.current = true;
      setSavedSnapshot(JSON.stringify(confirmedForm));
      setForm(confirmedForm);
      setDirty(false);
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
      }
      const nextMessages = [];
      if (imageActions.heroImageUrl) {
        nextMessages.push(imageActions.heroImageUrl === 'remove' ? 'Portrait image removed successfully.' : 'Portrait image replaced successfully.');
      }
      if (imageActions.defaultBackgroundImageUrl) {
        nextMessages.push(imageActions.defaultBackgroundImageUrl === 'remove' ? 'Home background image removed successfully.' : 'Home background image replaced successfully.');
      }
      if (skippedColumns.length) {
        nextMessages.push(`Some newer visual settings were skipped because your Supabase table is missing: ${skippedColumns.join(', ')}.`);
      }
      pendingImageActions.current = {};
      setMessage(nextMessages.join(' ') || 'Site settings saved.');
    } catch (saveError) {
      setError(saveError.message || 'Unable to save site settings.');
    } finally {
      setSaving(false);
    }
  }

  function discardChanges() {
    if (!dirty) return;
    requestConfirmation({
      title: 'Discard unsaved site settings?',
      description: 'The form will reload the last saved settings. Your current changes will be lost.',
      confirmLabel: 'Discard changes',
      destructive: true,
      onConfirm: performDiscardChanges,
    });
  }

  function performDiscardChanges() {
    const base = normalizeSettingsForm(content);
    setForm(base);
    setSavedSnapshot(JSON.stringify(base));
    setDirty(false);
    pendingImageActions.current = {};
    setFieldErrors({});
    setMessage('Unsaved changes discarded.');
    setError('');
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
    }
  }

  function confirmImageRemoval(field, label) {
    requestConfirmation({
      title: `Remove the current ${label}?`,
      description: 'The image will be removed when you save these site settings.',
      confirmLabel: 'Remove image',
      destructive: true,
      onConfirm: () => {
        pendingImageActions.current[field] = 'remove';
        update(field, null);
      },
    });
  }

  const headerActions = <LineButton href="/" subtle external>Open Public Site</LineButton>;

  return (
    <AdminLayout>
      <div className="w-full max-w-6xl">
      <UnsavedChangesGuard dirty={draftReady && isDirty && !saving} />
      <AdminPageHeader
        eyebrow="Website CMS"
        title="Site Settings"
        description="Edit global branding, media, colors, and hero appearance without changing the public site structure."
        action={headerActions}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 py-4 text-sm text-zinc-400">
        {isDirty && <span className="text-xs uppercase tracking-[0.18em] text-amber-200">Unsaved changes</span>}
        {contentLoading && <span className="text-xs uppercase tracking-[0.18em] text-zinc-600">Loading settings</span>}
        {!contentLoading && !content.settingsId && <span className="text-xs uppercase tracking-[0.18em] text-zinc-600">Using current site defaults</span>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[11rem_minmax(0,1fr)_15rem] xl:items-start">
      <aside className="hidden xl:block" aria-label="Settings sections">
        <nav className="sticky top-24 grid gap-1 border-l border-white/[0.1] pl-3">
          <p className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-zinc-600">Sections</p>
          {settingsSections.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-md px-2 py-2 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50">{label}</a>)}
        </nav>
      </aside>
      <form onSubmit={save} className="w-full min-w-0">
        <div className="grid min-w-0 gap-4">
          <Section title="Brand Identity" description="These settings define the global brand text and labels used across the public site and admin shell.">
            <div className="grid gap-6 md:grid-cols-2">
              <Field label="Brand name" value={form.displayName || ''} onChange={(value) => update('displayName', value)} error={fieldErrors.displayName} hint="Shown in the navbar and browser-facing branding." required />
              <Field label="Personal / legal name" value={form.legalName || ''} onChange={(value) => update('legalName', value)} error={fieldErrors.legalName} hint="Used in the admin shell and global content defaults." required />
              <Textarea label="Tagline" value={form.tagline || ''} onChange={(value) => update('tagline', value)} error={fieldErrors.tagline} hint={'Keep the approved brand tagline exactly: "Build your presence. Shape your story."'} rows={3} required />
              <Field label="Contact email" type="email" value={form.email || ''} onChange={(value) => update('email', value)} error={fieldErrors.email} hint="Used by the public Contact page and footer." autoComplete="email" />
              <Field label="Logo alt text" value={form.logoAlt || ''} onChange={(value) => update('logoAlt', value)} error={fieldErrors.logoAlt} hint="Used anywhere the logo is rendered as an image." />
              <Field label="Portrait image alt text" value={form.heroImageAlt || ''} onChange={(value) => update('heroImageAlt', value)} error={fieldErrors.heroImageAlt} hint="Used for the homepage portrait image." />
            </div>
          </Section>

          <Section title="Logos and Brand Media" description="Upload and manage the main logo, hero portrait, and background image without changing any saved asset paths unless you remove them explicitly.">
            <div className="grid gap-6">
              <UploadField label="Logo" hint="Large raster logos are optimized to 300 KB. SVG files keep a 300 KB hard limit." value={form.logoUrl || ''} previewAlt={form.logoAlt || 'Logo preview'} previewClassName="h-24 object-contain" onFile={(file) => uploadImage('logoUrl', file, 'logos', 'siteLogo')} onClear={() => confirmImageRemoval('logoUrl', 'logo')} uploading={uploadingField === 'logoUrl'} error={fieldErrors.logoUrl} />

              <div className="grid gap-6 md:grid-cols-2">
                <UploadField label="Portrait / profile photo" hint="Large photos are resized and optimized to 300 KB automatically." value={form.heroImageUrl || ''} previewAlt={form.heroImageAlt || 'Portrait preview'} previewClassName="block h-auto max-h-[320px] w-auto max-w-[240px] object-contain" onFile={(file) => uploadImage('heroImageUrl', file, 'heroes', 'creativeProfile')} onClear={() => confirmImageRemoval('heroImageUrl', 'portrait image')} uploading={uploadingField === 'heroImageUrl'} error={fieldErrors.heroImageUrl} />

                <div className="grid gap-4 border-t border-white/[0.07] pt-4">
                  <label className="flex items-start gap-3 border-b border-white/[0.08] py-3 text-sm text-zinc-300">
                    <input type="checkbox" checked={form.showHeroPortrait === true} onChange={(event) => update('showHeroPortrait', event.target.checked)} className="mt-1 h-4 w-4 accent-amber-300" />
                    <span className="grid gap-1">
                      <span className="text-white">Show portrait on homepage</span>
                      <span className="text-xs leading-5 text-zinc-500">Controls whether the hero portrait appears on the public homepage.</span>
                    </span>
                  </label>

                  <UploadField label="Home background image" hint="Large backgrounds are resized and optimized to 1 MB automatically." value={form.defaultBackgroundImageUrl || ''} previewAlt="Background preview" renderPreview={(imageUrl) => { const background = createHeroBackgroundRender({ imageUrl, overlayOpacity: Number(form.defaultBackgroundOverlayOpacity ?? 0.55) }); return <div className="relative aspect-video w-full max-w-2xl overflow-hidden border border-white/[0.08] bg-zinc-950"><div className="absolute inset-0" style={background.style} aria-hidden="true" /><div className="hero-background-overlay absolute inset-0" style={background.overlayStyle} aria-hidden="true" /></div>; }} onFile={(file) => uploadImage('defaultBackgroundImageUrl', file, 'backgrounds', 'siteImage')} onClear={() => confirmImageRemoval('defaultBackgroundImageUrl', 'background image')} uploading={uploadingField === 'defaultBackgroundImageUrl'} error={fieldErrors.defaultBackgroundImageUrl} />

                  <Field label="Background overlay opacity" type="number" min="0" max="1" step="0.05" value={form.defaultBackgroundOverlayOpacity ?? 0.55} onChange={(value) => update('defaultBackgroundOverlayOpacity', value)} error={fieldErrors.defaultBackgroundOverlayOpacity} hint="Controls how strongly the background image is muted behind the hero." />
                </div>
              </div>
            </div>
          </Section>

          <Section title="Global Colors" description="Edit the global palette used by the public site. Valid hex values are normalized before save, and each control can reset back to the saved value.">
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              <ColorField label="Primary text" value={form.primaryTextColor || ''} savedValue={normalizeSettingsForm(content).primaryTextColor} onChange={(value) => update('primaryTextColor', value)} onReset={() => resetColor('primaryTextColor')} error={fieldErrors.primaryTextColor} />
              <ColorField label="Secondary text" value={form.secondaryTextColor || ''} savedValue={normalizeSettingsForm(content).secondaryTextColor} onChange={(value) => update('secondaryTextColor', value)} onReset={() => resetColor('secondaryTextColor')} error={fieldErrors.secondaryTextColor} />
              <ColorField label="Muted text" value={form.mutedTextColor || ''} savedValue={normalizeSettingsForm(content).mutedTextColor} onChange={(value) => update('mutedTextColor', value)} onReset={() => resetColor('mutedTextColor')} error={fieldErrors.mutedTextColor} />
              <ColorField label="Accent" value={form.accentColor || ''} savedValue={normalizeSettingsForm(content).accentColor} onChange={(value) => update('accentColor', value)} onReset={() => resetColor('accentColor')} error={fieldErrors.accentColor} />
              <ColorField label="Divider lines" value={form.dividerLineColor || ''} savedValue={normalizeSettingsForm(content).dividerLineColor} onChange={(value) => update('dividerLineColor', value)} onReset={() => resetColor('dividerLineColor')} error={fieldErrors.dividerLineColor} />
            </div>
          </Section>

          <Section title="Contact or Global Links" description="Global links stored in Site Settings remain compatible with the public footer and contact surfaces.">
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              {socialFields.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                  value={form[field.key] || ''}
                  onChange={(value) => update(field.key, value)}
                  error={fieldErrors[field.key]}
                  hint="Use a complete URL or leave this blank."
                  placeholder={field.placeholder}
                />
              ))}
              <Textarea label="Footer text" value={form.footerText || ''} onChange={(value) => update('footerText', value)} error={fieldErrors.footerText} hint="Shown across the public footer and should stay concise." rows={4} />
            </div>
          </Section>

          <Section title="Save Actions" description="Save updates only this site settings record. Discard reloads the saved values and clears any draft.">
            {message && <AdminNotice tone="success" role="status">{message}</AdminNotice>}
            {uploadStatus && <AdminNotice tone="success" role="status">{uploadStatus}</AdminNotice>}
            {error && <AdminNotice role="alert">{error}</AdminNotice>}
            <StickyMobileActions>
              <AdminButton disabled={!isDirty || !canSave} type="submit" variant="primary">
                {saving ? 'Saving...' : 'Save Changes'}
              </AdminButton>
              <LineButton onClick={discardChanges} subtle disabled={!isDirty || saving || Boolean(uploadingField)}>Discard Unsaved Changes</LineButton>
            </StickyMobileActions>
          </Section>
        </div>

      </form>
      <SettingsPreview form={form} />
      </div>

      <nav aria-label="Jump to settings section" className="settings-mobile-nav -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-4 xl:hidden">
        {settingsSections.map(([id, label]) => <a key={id} href={`#${id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-white/[0.1] bg-zinc-900 px-4 text-sm font-medium text-zinc-400 transition hover:border-amber-200/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50">{label}</a>)}
      </nav>
      {confirmationDialog}
      </div>
    </AdminLayout>
  );
}
