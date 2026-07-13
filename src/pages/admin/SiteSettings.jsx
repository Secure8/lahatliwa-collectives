import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminNotice, AdminPageHeader } from '../../components/admin/AdminUI';
import { mergePublicContent, settingsFormFromRow, settingsFromSiteContent, updateSiteSettings, uploadSiteAsset, usePublicContent } from '../../lib/contentApi';
import { uploadStatusText } from '../../lib/imageCompression';
import { createHeroBackgroundRender } from '../../lib/heroBackground';

const lineInput = 'w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-2.5 text-white outline-none transition placeholder:text-zinc-700 focus:border-amber-200/60';
const lineTextarea = `${lineInput} min-h-28 resize-y leading-6`;

const socialFields = [
  { key: 'githubUrl', label: 'GitHub URL', placeholder: 'https://github.com/username' },
  { key: 'facebookUrl', label: 'Facebook URL', placeholder: 'https://facebook.com/username' },
  { key: 'instagramUrl', label: 'Instagram URL', placeholder: 'https://instagram.com/username' },
  { key: 'linkedinUrl', label: 'LinkedIn URL', placeholder: 'https://linkedin.com/in/username' },
  { key: 'youtubeUrl', label: 'YouTube URL', placeholder: 'https://youtube.com/@username' },
  { key: 'tiktokUrl', label: 'TikTok URL', placeholder: 'https://tiktok.com/@username' },
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
  return `inline-flex h-10 items-center gap-2 border-b px-2 text-sm transition ${subtle ? 'border-white/[0.08] text-zinc-400 hover:border-amber-200/35 hover:text-white' : 'border-white/[0.12] text-zinc-300 hover:border-amber-200/40 hover:text-white'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`;
}

function LineButton({ children, to, href, onClick, subtle = false, external = false, disabled = false, type = 'button' }) {
  const classes = lineButtonClasses({ subtle, disabled });
  if (to) return <Link to={to} className={classes}>{children}</Link>;
  if (href && !external) return <Link to={href} className={classes}>{children}</Link>;
  if (href) return <a href={href} target="_blank" rel="noreferrer noopener" className={classes}>{children}</a>;
  return <button type={type} onClick={onClick} disabled={disabled} className={classes}>{children}</button>;
}

function Section({ title, description, children }) {
  return (
    <section className="grid gap-5 border-t border-white/[0.08] py-7 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">{description}</p>}
      </div>
      {children}
    </section>
  );
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

function UploadField({ label, hint, value, previewClassName = '', previewAlt = '', renderPreview, onFile, onClear, confirmText, uploading = false, error }) {
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
            onClick={() => {
              if (!window.confirm(confirmText || 'Remove this image?')) return;
              onClear();
            }}
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

  useEffect(() => {
    if (!draftReady || !dirty) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty, draftReady]);

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
    if (!window.confirm('Discard your unsaved changes and reload the saved site settings?')) return;
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

  const headerActions = <LineButton href="/" subtle external>Open Public Site</LineButton>;

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow="Website CMS"
        title="Site Settings"
        description="Edit global branding, media, colors, and hero appearance without changing the public site structure."
        action={headerActions}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 border-y border-white/[0.08] py-4 text-sm text-zinc-400">
        {isDirty && <span className="text-xs uppercase tracking-[0.18em] text-amber-200">Unsaved changes</span>}
        {contentLoading && <span className="text-xs uppercase tracking-[0.18em] text-zinc-600">Loading settings</span>}
        {!contentLoading && !content.settingsId && <span className="text-xs uppercase tracking-[0.18em] text-zinc-600">Using current site defaults</span>}
      </div>

      {message && <AdminNotice tone="success" className="mb-5">{message}</AdminNotice>}
      {uploadStatus && <AdminNotice tone="success" className="mb-5">{uploadStatus}</AdminNotice>}
      {error && <AdminNotice className="mb-5">{error}</AdminNotice>}

      <form onSubmit={save} className="w-full max-w-5xl">
        <div className="min-w-0">
          <Section title="Brand Identity" description="These settings define the global brand text and labels used across the public site and admin shell.">
            <div className="grid gap-6 md:grid-cols-2">
              <Field label="Brand name" value={form.displayName || ''} onChange={(value) => update('displayName', value)} error={fieldErrors.displayName} hint="Shown in the navbar and browser-facing branding." required />
              <Field label="Personal / legal name" value={form.legalName || ''} onChange={(value) => update('legalName', value)} error={fieldErrors.legalName} hint="Used in the admin shell and global content defaults." required />
              <Textarea label="Tagline" value={form.tagline || ''} onChange={(value) => update('tagline', value)} error={fieldErrors.tagline} hint="Short brand description shown in the footer and shared site surfaces." rows={3} required />
              <Field label="Contact email" type="email" value={form.email || ''} onChange={(value) => update('email', value)} error={fieldErrors.email} hint="Used by the public Contact page and footer." autoComplete="email" />
              <Field label="Logo alt text" value={form.logoAlt || ''} onChange={(value) => update('logoAlt', value)} error={fieldErrors.logoAlt} hint="Used anywhere the logo is rendered as an image." />
              <Field label="Portrait image alt text" value={form.heroImageAlt || ''} onChange={(value) => update('heroImageAlt', value)} error={fieldErrors.heroImageAlt} hint="Used for the homepage portrait image." />
            </div>
          </Section>

          <Section title="Logos and Brand Media" description="Upload and manage the main logo, hero portrait, and background image without changing any saved asset paths unless you remove them explicitly.">
            <div className="grid gap-6">
              <UploadField label="Logo" hint="Large raster logos are optimized to 300 KB. SVG files keep a 300 KB hard limit." value={form.logoUrl || ''} previewAlt={form.logoAlt || 'Logo preview'} previewClassName="h-24 object-contain" onFile={(file) => uploadImage('logoUrl', file, 'logos', 'siteLogo')} onClear={() => { pendingImageActions.current.logoUrl = 'remove'; update('logoUrl', null); }} confirmText="Remove your current logo?" uploading={uploadingField === 'logoUrl'} error={fieldErrors.logoUrl} />

              <div className="grid gap-6 md:grid-cols-2">
                <UploadField label="Portrait / profile photo" hint="Large photos are resized and optimized to 300 KB automatically." value={form.heroImageUrl || ''} previewAlt={form.heroImageAlt || 'Portrait preview'} previewClassName="block h-auto max-h-[320px] w-auto max-w-[240px] object-contain" onFile={(file) => uploadImage('heroImageUrl', file, 'heroes', 'creativeProfile')} onClear={() => { pendingImageActions.current.heroImageUrl = 'remove'; update('heroImageUrl', null); }} confirmText="Remove your current portrait image?" uploading={uploadingField === 'heroImageUrl'} error={fieldErrors.heroImageUrl} />

                <div className="grid gap-4 border-t border-white/[0.07] pt-4">
                  <label className="flex items-start gap-3 border-b border-white/[0.08] py-3 text-sm text-zinc-300">
                    <input type="checkbox" checked={form.showHeroPortrait === true} onChange={(event) => update('showHeroPortrait', event.target.checked)} className="mt-1 h-4 w-4 accent-amber-300" />
                    <span className="grid gap-1">
                      <span className="text-white">Show portrait on homepage</span>
                      <span className="text-xs leading-5 text-zinc-500">Controls whether the hero portrait appears on the public homepage.</span>
                    </span>
                  </label>

                  <UploadField label="Home background image" hint="Large backgrounds are resized and optimized to 1 MB automatically." value={form.defaultBackgroundImageUrl || ''} previewAlt="Background preview" renderPreview={(imageUrl) => <div className="relative aspect-video w-full max-w-2xl overflow-hidden border border-white/[0.08] bg-zinc-950"><div className="absolute inset-0" style={createHeroBackgroundRender({ imageUrl, overlayOpacity: Number(form.defaultBackgroundOverlayOpacity ?? 0.55) }).style} aria-hidden="true" /><div className="absolute inset-0 bg-zinc-950" style={{ opacity: Number(form.defaultBackgroundOverlayOpacity ?? 0.55) }} aria-hidden="true" /></div>} onFile={(file) => uploadImage('defaultBackgroundImageUrl', file, 'backgrounds', 'siteImage')} onClear={() => { pendingImageActions.current.defaultBackgroundImageUrl = 'remove'; update('defaultBackgroundImageUrl', null); }} confirmText="Remove your current background image?" uploading={uploadingField === 'defaultBackgroundImageUrl'} error={fieldErrors.defaultBackgroundImageUrl} />

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

          <Section title="Hero Appearance" description="These controls affect the global hero media look and preserve the current public behavior.">
            <div className="grid gap-6 md:grid-cols-2">
              <Field label="Hero portrait alt text" value={form.heroImageAlt || ''} onChange={(value) => update('heroImageAlt', value)} error={fieldErrors.heroImageAlt} hint="Shown anywhere the portrait is rendered as an image." />
              <Field label="Default background overlay opacity" type="number" min="0" max="1" step="0.05" value={form.defaultBackgroundOverlayOpacity ?? 0.55} onChange={(value) => update('defaultBackgroundOverlayOpacity', value)} error={fieldErrors.defaultBackgroundOverlayOpacity} hint="Same overlay value used on the public hero background." />
            </div>
          </Section>

          <Section title="Image Display and Positioning" description="The current site stores a simple show/hide toggle for the portrait and a default background image. Those values remain compatible here.">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-start gap-3 border-b border-white/[0.08] py-3 text-sm text-zinc-300">
                <input type="checkbox" checked={form.showHeroPortrait === true} onChange={(event) => update('showHeroPortrait', event.target.checked)} className="mt-1 h-4 w-4 accent-amber-300" />
                <span className="grid gap-1">
                  <span className="text-white">Show portrait on homepage</span>
                  <span className="text-xs leading-5 text-zinc-500">This preserves the existing homepage portrait visibility behavior.</span>
                </span>
              </label>
              <Field label="Background image URL" value={form.defaultBackgroundImageUrl || ''} onChange={(value) => update('defaultBackgroundImageUrl', value)} error={fieldErrors.defaultBackgroundImageUrl} hint="Leave blank to fall back to the default site background." />
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
            <div className="flex flex-wrap items-center gap-3">
              <AdminButton disabled={!isDirty || !canSave} type="submit" variant="primary">
                {saving ? 'Saving...' : 'Save Changes'}
              </AdminButton>
              <LineButton onClick={discardChanges} subtle disabled={!isDirty || saving || Boolean(uploadingField)}>Discard Unsaved Changes</LineButton>
            </div>
          </Section>
        </div>

      </form>
    </AdminLayout>
  );
}
