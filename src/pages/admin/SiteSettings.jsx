import { useEffect, useRef, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminNotice, AdminPageHeader, AdminSurface } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { mergePublicContent, settingsFromSiteContent, updateSiteSettings, uploadSiteAsset, usePublicContent } from '../../lib/contentApi';

export default function SiteSettings() {
  const { content } = usePublicContent([]);
  const draftKey = 'hevv-site-settings-draft-v2';
  const [form, setForm] = useState(() => settingsFromSiteContent(mergePublicContent()));
  const [loading, setLoading] = useState(true);
  const [draftReady, setDraftReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const skipNextDraftSave = useRef(false);

  useEffect(() => {
    if (dirty) return;
    let draft = null;
    try {
      draft = JSON.parse(window.localStorage.getItem(draftKey) || 'null');
    } catch {
      draft = null;
    }
    const hasDraft = Boolean(draft);
    setForm({ ...settingsFromSiteContent(content), ...(draft || {}) });
    setDirty(hasDraft);
    setDraftReady(true);
    setLoading(false);
  }, [content]);

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
  }, [dirty, draftReady, form]);

  useEffect(() => {
    if (!draftReady || !dirty) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty, draftReady]);

  function update(name, value) {
    setDirty(true);
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function uploadImage(field, file, folder = 'site') {
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      const url = await uploadSiteAsset(file, folder);
      update(field, url);
    } catch (uploadError) {
      setError(uploadError.message || 'Image upload failed.');
    } finally {
      setSaving(false);
    }
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const { id, skippedColumns = [] } = await updateSiteSettings(form);
      skipNextDraftSave.current = true;
      update('settingsId', id);
      setDirty(false);
      const migrationNote = skippedColumns.length
        ? ` Some newer visual settings were skipped because your Supabase table is missing: ${skippedColumns.join(', ')}. Run supabase/visual_cms_update.sql to enable them.`
        : '';
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
      }
      setMessage(`Site settings saved.${migrationNote}`);
    } catch (saveError) {
      setError(saveError.message || 'Unable to save site settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <AdminLayout><LoadingState label="Loading settings" /></AdminLayout>;

  return (
    <AdminLayout>
      <AdminPageHeader eyebrow="Website CMS" title="Site Settings" description="Edit the logo, portrait, home background, social links, and global website text. Images upload to the existing project-media bucket." />

      <AdminSurface as="form" onSubmit={save} className="grid gap-5">
        {message && <AdminNotice tone="success">{message}</AdminNotice>}
        {error && <AdminNotice>{error}</AdminNotice>}

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Brand name" value={form.displayName} onChange={(value) => update('displayName', value)} />
          <Field label="Personal name" value={form.legalName} onChange={(value) => update('legalName', value)} />
          <Field label="Tagline" value={form.tagline || ''} onChange={(value) => update('tagline', value)} />
          <Field label="Contact email" type="email" value={form.email || ''} onChange={(value) => update('email', value)} />
          <Field label="Logo alt text" value={form.logoAlt || ''} onChange={(value) => update('logoAlt', value)} />
          <Field label="Portrait image alt text" value={form.heroImageAlt || ''} onChange={(value) => update('heroImageAlt', value)} />
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <UploadField label="Upload logo" hint="SVG, PNG, WebP, or JPG. Raster images over 5 MB are compressed automatically." value={form.logoUrl} onFile={(file) => uploadImage('logoUrl', file, 'logos')} onClear={() => update('logoUrl', '')} />
          <div className="rounded-2xl bg-zinc-950/45 p-4 ring-1 ring-white/[0.07]">
            <UploadField compact label="Portrait / Profile Photo" hint="Raster images over 5 MB are compressed automatically." value={form.heroImageUrl} onFile={(file) => uploadImage('heroImageUrl', file, 'heroes')} onClear={() => update('heroImageUrl', '')} />
            <label className="mt-4 flex items-center gap-3 pt-4 text-sm text-zinc-300">
              <input type="checkbox" checked={form.showHeroPortrait === true} onChange={(event) => update('showHeroPortrait', event.target.checked)} className="accent-amber-300" />
              Show portrait on homepage
            </label>
          </div>
          <UploadField label="Home Background Image" hint="Optional home background. Raster images over 5 MB are compressed automatically." value={form.defaultBackgroundImageUrl} onFile={(file) => uploadImage('defaultBackgroundImageUrl', file, 'backgrounds')} onClear={() => update('defaultBackgroundImageUrl', '')} />
          <label className="grid gap-2 text-sm text-zinc-300">
            Default background overlay opacity
            <input type="number" min="0" max="1" step="0.05" value={form.defaultBackgroundOverlayOpacity ?? 0.55} onChange={(event) => update('defaultBackgroundOverlayOpacity', event.target.value)} className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" />
          </label>
        </div>

        <section className="grid gap-4 py-5 md:grid-cols-2 lg:grid-cols-5">
          <ColorField label="Primary text" value={form.primaryTextColor || '#f5f5f4'} onChange={(value) => update('primaryTextColor', value)} />
          <ColorField label="Secondary text" value={form.secondaryTextColor || '#d4d4d8'} onChange={(value) => update('secondaryTextColor', value)} />
          <ColorField label="Muted text" value={form.mutedTextColor || '#a1a1aa'} onChange={(value) => update('mutedTextColor', value)} />
          <ColorField label="Accent" value={form.accentColor || '#f6d58b'} onChange={(value) => update('accentColor', value)} />
          <ColorField label="Divider lines" value={form.dividerLineColor || '#f6d58b'} onChange={(value) => update('dividerLineColor', value)} />
        </section>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="GitHub URL" value={form.githubUrl || ''} onChange={(value) => update('githubUrl', value)} />
          <Field label="Facebook URL" value={form.facebookUrl || ''} onChange={(value) => update('facebookUrl', value)} />
          <Field label="Instagram URL" value={form.instagramUrl || ''} onChange={(value) => update('instagramUrl', value)} />
          <Field label="LinkedIn URL" value={form.linkedinUrl || ''} onChange={(value) => update('linkedinUrl', value)} />
          <Field label="YouTube URL" value={form.youtubeUrl || ''} onChange={(value) => update('youtubeUrl', value)} />
          <Field label="TikTok URL" value={form.tiktokUrl || ''} onChange={(value) => update('tiktokUrl', value)} />
        </div>

        <label className="grid gap-2 text-sm text-zinc-300">
          Footer text
          <textarea className="min-h-28 rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" value={form.footerText || ''} onChange={(event) => update('footerText', event.target.value)} />
        </label>

        <AdminButton disabled={saving} type="submit" variant="primary" className="w-fit">
          {saving ? 'Saving...' : 'Save settings'}
        </AdminButton>
      </AdminSurface>
    </AdminLayout>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45" />
    </label>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <div className="flex items-center gap-3 rounded-xl bg-zinc-950/55 px-3 py-2 ring-1 ring-white/[0.08]">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-12 bg-transparent" />
        <span className="font-mono text-xs text-zinc-400">{value}</span>
      </div>
    </label>
  );
}

function UploadField({ label, hint, value, onFile, onClear, compact = false }) {
  return (
    <div className={compact ? '' : 'rounded-2xl bg-zinc-950/45 p-4 ring-1 ring-white/[0.07]'}>
      <p className="text-sm text-zinc-300">{label}</p>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      {value && <img src={value} alt="" className="mt-3 h-20 max-w-full object-contain" />}
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="cursor-pointer rounded-full bg-white/[0.055] px-3 py-2 text-sm text-zinc-200 ring-1 ring-white/[0.08] hover:bg-white/[0.085]">
          Choose image
          <input className="sr-only" type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} />
        </label>
        {value && <button type="button" onClick={onClear} className="rounded-full bg-white/[0.055] px-3 py-2 text-sm text-zinc-400 ring-1 ring-white/[0.08] hover:text-white">Remove</button>}
      </div>
    </div>
  );
}
