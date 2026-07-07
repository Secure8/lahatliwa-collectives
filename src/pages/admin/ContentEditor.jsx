import Editor from '@monaco-editor/react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import LoadingState from '../../components/LoadingState';
import { defaultPageContent } from '../../data/siteContent';
import { fetchPageContent, updatePageContent, uploadSiteAsset } from '../../lib/contentApi';

const titles = {
  home: 'Home Content',
  about: 'About Content',
  services: 'Services Content',
  contact: 'Contact Content',
};

export default function ContentEditor() {
  const { pageKey } = useParams();
  const fallback = useMemo(() => defaultPageContent[pageKey] || {}, [pageKey]);
  const [content, setContent] = useState(fallback);
  const [jsonText, setJsonText] = useState(JSON.stringify(fallback, null, 2));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadContent() {
      setLoading(true);
      setError('');
      try {
        const remoteContent = await fetchPageContent(pageKey).catch(() => null);
        const nextContent = { ...fallback, ...(remoteContent || {}) };
        if (!active) return;
        setContent(nextContent);
        setJsonText(JSON.stringify(nextContent, null, 2));
      } finally {
        if (active) setLoading(false);
      }
    }
    loadContent();
    return () => {
      active = false;
    };
  }, [pageKey, fallback]);

  function patch(updates) {
    setContent((current) => {
      const next = { ...current, ...updates };
      setJsonText(JSON.stringify(next, null, 2));
      setMessage('');
      return next;
    });
  }

  function updateList(key, value) {
    patch({ [key]: value.split(',').map((item) => item.trim()).filter(Boolean) });
  }

  async function uploadHomeBackground(file) {
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      const url = await uploadSiteAsset(file, 'backgrounds');
      patch({ heroBackgroundImageUrl: url });
    } catch (uploadError) {
      setError(uploadError.message || 'Background upload failed.');
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
      const parsed = JSON.parse(jsonText);
      await updatePageContent(pageKey, parsed);
      setContent(parsed);
      setJsonText(JSON.stringify(parsed, null, 2));
      setMessage('Page content saved.');
    } catch (saveError) {
      setError(saveError.message || 'Unable to save page content. Check that the JSON is valid.');
    } finally {
      setSaving(false);
    }
  }

  if (!defaultPageContent[pageKey]) {
    return <AdminLayout><div className="rounded-lg border border-red-400/30 bg-red-500/10 p-4 text-red-100">Unknown page content key.</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="mb-8">
        <p className="text-sm text-amber-200">Website CMS</p>
        <h1 className="mt-2 text-3xl font-bold">{titles[pageKey]}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Use the form for normal edits. The JSON editor is available on desktop for advanced structure changes.</p>
      </div>

      {loading ? <LoadingState label="Loading content" /> : (
        <form onSubmit={save} className="grid gap-5">
          {message && <div className="rounded-md border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">{message}</div>}
          {error && <div className="rounded-md border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}

          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="grid gap-5 rounded-lg border border-white/10 bg-zinc-900/70 p-5">
              <StructuredFields pageKey={pageKey} content={content} patch={patch} updateList={updateList} uploadHomeBackground={uploadHomeBackground} />
            </section>

            <section className="hidden min-w-0 rounded-lg border border-white/10 bg-zinc-950 p-3 xl:block">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm text-zinc-300">Advanced JSON editor</p>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(jsonText);
                      setContent(parsed);
                      setJsonText(JSON.stringify(parsed, null, 2));
                      setError('');
                    } catch (parseError) {
                      setError(parseError.message);
                    }
                  }}
                  className="rounded-md border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:text-white"
                >
                  Apply JSON to form
                </button>
              </div>
              <Editor
                height="620px"
                defaultLanguage="json"
                theme="vs-dark"
                value={jsonText}
                onChange={(value) => setJsonText(value || '')}
                options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on', tabSize: 2, formatOnPaste: true, scrollBeyondLastLine: false }}
              />
            </section>
          </div>

          <button disabled={saving} className="w-fit rounded-md bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 disabled:opacity-60">
            {saving ? 'Saving...' : 'Save page content'}
          </button>
        </form>
      )}
    </AdminLayout>
  );
}

function StructuredFields({ pageKey, content, patch, updateList, uploadHomeBackground }) {
  if (pageKey === 'home') {
    return (
      <>
        <Field label="Hero title" value={content.heroTitle || ''} onChange={(value) => patch({ heroTitle: value })} />
        <Textarea label="Hero description" value={content.heroDescription || ''} onChange={(value) => patch({ heroDescription: value })} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Primary CTA" value={content.primaryCta || ''} onChange={(value) => patch({ primaryCta: value })} />
          <Field label="Secondary CTA" value={content.secondaryCta || ''} onChange={(value) => patch({ secondaryCta: value })} />
          <Field label="Featured heading" value={content.featuredHeading || ''} onChange={(value) => patch({ featuredHeading: value })} />
          <Field label="Services heading" value={content.servicesHeading || ''} onChange={(value) => patch({ servicesHeading: value })} />
        </div>
        <Textarea label="Services intro" value={content.servicesIntro || ''} onChange={(value) => patch({ servicesIntro: value })} />
        <div className="grid gap-4 md:grid-cols-2">
          <ColorField label="Hero title color" value={content.heroTitleColor || '#f5f5f4'} onChange={(value) => patch({ heroTitleColor: value })} />
          <ColorField label="Hero description color" value={content.heroDescriptionColor || '#d4d4d8'} onChange={(value) => patch({ heroDescriptionColor: value })} />
          <ColorField label="Section heading color" value={content.sectionHeadingColor || '#f5f5f4'} onChange={(value) => patch({ sectionHeadingColor: value })} />
          <ColorField label="Accent text color" value={content.accentTextColor || '#f6d58b'} onChange={(value) => patch({ accentTextColor: value })} />
        </div>
        <UploadRow label="Hero background image" value={content.heroBackgroundImageUrl || ''} onFile={uploadHomeBackground} onClear={() => patch({ heroBackgroundImageUrl: '' })} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Background position" value={content.heroBackgroundPosition || 'center'} onChange={(value) => patch({ heroBackgroundPosition: value })} />
          <Select label="Background style" value={content.heroBackgroundStyle || 'none'} options={['none', 'soft-cover', 'split-image', 'ambient-blur', 'subtle-texture']} onChange={(value) => patch({ heroBackgroundStyle: value })} />
          <Field label="Overlay opacity" type="number" min="0" max="1" step="0.05" value={content.heroBackgroundOverlayOpacity ?? 0.55} onChange={(value) => patch({ heroBackgroundOverlayOpacity: Number(value) })} />
          <Field label="Background blur" type="number" min="0" max="24" step="1" value={content.heroBackgroundBlur ?? 0} onChange={(value) => patch({ heroBackgroundBlur: Number(value) })} />
        </div>
      </>
    );
  }

  if (pageKey === 'about') {
    return (
      <>
        <Field label="Page title" value={content.title || ''} onChange={(value) => patch({ title: value })} />
        <Textarea label="Intro" value={content.intro || ''} onChange={(value) => patch({ intro: value })} />
        <Textarea label="Creative journey" value={content.journey || ''} onChange={(value) => patch({ journey: value })} />
        <Textarea label="Skills, comma-separated" value={(content.skills || []).join(', ')} onChange={(value) => updateList('skills', value)} />
        <Textarea label="Tools, comma-separated" value={(content.tools || []).join(', ')} onChange={(value) => updateList('tools', value)} />
        <div className="grid gap-4 md:grid-cols-3">
          <ColorField label="Heading color" value={content.headingColor || '#f5f5f4'} onChange={(value) => patch({ headingColor: value })} />
          <ColorField label="Body text color" value={content.bodyTextColor || '#d4d4d8'} onChange={(value) => patch({ bodyTextColor: value })} />
          <ColorField label="Accent color" value={content.accentColor || '#f6d58b'} onChange={(value) => patch({ accentColor: value })} />
        </div>
      </>
    );
  }

  if (pageKey === 'services') {
    return (
      <>
        <Field label="Page title" value={content.title || ''} onChange={(value) => patch({ title: value })} />
        <Textarea label="Intro" value={content.intro || ''} onChange={(value) => patch({ intro: value })} />
        <div className="grid gap-4 md:grid-cols-2">
          <ColorField label="Heading color" value={content.headingColor || '#f5f5f4'} onChange={(value) => patch({ headingColor: value })} />
          <ColorField label="Body text color" value={content.bodyTextColor || '#d4d4d8'} onChange={(value) => patch({ bodyTextColor: value })} />
          <ColorField label="Service title color" value={content.serviceTitleColor || '#f5f5f4'} onChange={(value) => patch({ serviceTitleColor: value })} />
          <ColorField label="Icon color" value={content.iconColor || '#f6d58b'} onChange={(value) => patch({ iconColor: value })} />
        </div>
        <Textarea label="Service groups JSON" value={JSON.stringify(content.groups || [], null, 2)} onChange={(value) => {
          try {
            patch({ groups: JSON.parse(value) });
          } catch {
            // Leave invalid group JSON in the advanced editor instead of breaking the form.
          }
        }} rows={14} />
        <p className="text-xs leading-5 text-zinc-500">Each group can include iconName or customIconUrl. Uploaded icon URLs can be copied from Icons / Media.</p>
      </>
    );
  }

  return (
    <>
      <Field label="Heading" value={content.heading || ''} onChange={(value) => patch({ heading: value })} />
      <Textarea label="Description" value={content.description || ''} onChange={(value) => patch({ description: value })} />
      <Field label="CTA text" value={content.ctaText || ''} onChange={(value) => patch({ ctaText: value })} />
      <Textarea label="Contact notes" value={content.notes || ''} onChange={(value) => patch({ notes: value })} />
      <div className="grid gap-4 md:grid-cols-3">
        <ColorField label="Heading color" value={content.headingColor || '#f5f5f4'} onChange={(value) => patch({ headingColor: value })} />
        <ColorField label="Body text color" value={content.bodyTextColor || '#d4d4d8'} onChange={(value) => patch({ bodyTextColor: value })} />
        <ColorField label="Accent color" value={content.accentColor || '#f6d58b'} onChange={(value) => patch({ accentColor: value })} />
      </div>
    </>
  );
}

function Field({ label, value, onChange, type = 'text', min, max, step }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <input type={type} value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" />
    </label>
  );
}

function Textarea({ label, value, onChange, rows = 4 }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70" />
    </label>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md border border-white/10 bg-zinc-950 px-3 py-3 text-white outline-none focus:border-amber-300/70">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <div className="flex items-center gap-3 rounded-md border border-white/10 bg-zinc-950 px-3 py-2">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-12 bg-transparent" />
        <span className="font-mono text-xs text-zinc-400">{value}</span>
      </div>
    </label>
  );
}

function UploadRow({ label, value, onFile, onClear }) {
  return (
    <div className="rounded-md border border-white/10 bg-zinc-950 p-4">
      <p className="text-sm text-zinc-300">{label}</p>
      <p className="mt-1 text-xs text-zinc-500">Recommended under 2 MB. Videos should stay as external links.</p>
      {value && <img src={value} alt="" className="mt-3 max-h-28 max-w-full object-cover" />}
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="cursor-pointer rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-200 hover:border-amber-300/60">
          Choose image
          <input className="sr-only" type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} />
        </label>
        {value && <button type="button" onClick={onClear} className="rounded-md border border-white/10 px-3 py-2 text-sm text-zinc-400 hover:text-white">Remove</button>}
      </div>
    </div>
  );
}
