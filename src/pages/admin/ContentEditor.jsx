import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminNotice, AdminPageHeader, AdminSurface } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { defaultPageContent } from '../../data/siteContent';
import { fetchPageContent, updatePageContent, uploadSiteAsset } from '../../lib/contentApi';
import { uploadStatusText } from '../../lib/imageCompression';

const titles = {
  home: 'Home Content',
  about: 'About Content',
  services: 'Services Content',
  contact: 'Contact Content',
};

export default function ContentEditor() {
  const { pageKey } = useParams();
  const fallback = useMemo(() => defaultPageContent[pageKey] || {}, [pageKey]);
  const draftKey = useMemo(() => `hevv-content-editor-draft-v2:${pageKey}`, [pageKey]);
  const [content, setContent] = useState(fallback);
  const [jsonText, setJsonText] = useState(JSON.stringify(fallback, null, 2));
  const [loading, setLoading] = useState(true);
  const [draftReady, setDraftReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const skipNextDraftSave = useRef(false);

  useEffect(() => {
    let active = true;
    async function loadContent() {
      setLoading(true);
      setDraftReady(false);
      setDirty(false);
      setError('');
      try {
        const remoteContent = await fetchPageContent(pageKey).catch(() => null);
        let draft = null;
        try {
          draft = JSON.parse(window.localStorage.getItem(draftKey) || 'null');
        } catch {
          draft = null;
        }
        const hasDraft = Boolean(draft);
        const mergedContent = { ...fallback, ...(remoteContent || {}) };
        const nextJsonText = draft?.jsonText || JSON.stringify(draft?.content || mergedContent, null, 2);
        let nextContent = draft?.content || mergedContent;
        try {
          nextContent = JSON.parse(nextJsonText);
        } catch {
        }
        if (!active) return;
        setContent(nextContent);
        setJsonText(nextJsonText);
        setDraftReady(true);
        setDirty(hasDraft);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadContent();
    return () => {
      active = false;
    };
  }, [pageKey, fallback, draftKey]);

  useEffect(() => {
    if (!draftReady || !dirty) return;
    if (skipNextDraftSave.current) {
      skipNextDraftSave.current = false;
      return;
    }
    try {
      window.localStorage.setItem(draftKey, JSON.stringify({ content, jsonText }));
    } catch {
    }
  }, [content, dirty, draftKey, draftReady, jsonText]);

  useEffect(() => {
    if (!draftReady || !dirty) return undefined;
    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [dirty, draftReady]);

  function patch(updates) {
    setContent((current) => {
      const next = { ...current, ...updates };
      setJsonText(JSON.stringify(next, null, 2));
      setMessage('');
      setDirty(true);
      return next;
    });
  }

  function updateList(key, value) {
    patch({ [key]: value.split(',').map((item) => item.trim()).filter(Boolean) });
  }

  function patchServiceGroup(index, updates) {
    setContent((current) => {
      const groups = [...(current.groups || [])];
      groups[index] = { ...(groups[index] || {}), ...updates };
      const next = { ...current, groups };
      setJsonText(JSON.stringify(next, null, 2));
      setMessage('');
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
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const parsed = JSON.parse(jsonText);
      await updatePageContent(pageKey, parsed);
      skipNextDraftSave.current = true;
      setContent(parsed);
      setJsonText(JSON.stringify(parsed, null, 2));
      setDirty(false);
      try {
        window.localStorage.removeItem(draftKey);
      } catch {
      }
      setMessage('Page content saved.');
    } catch (saveError) {
      setError(saveError.message || 'Unable to save page content. Check that the JSON is valid.');
    } finally {
      setSaving(false);
    }
  }

  if (!defaultPageContent[pageKey]) {
    return <AdminLayout><AdminNotice>Unknown page content key.</AdminNotice></AdminLayout>;
  }

  return (
    <AdminLayout>
      <AdminPageHeader eyebrow="Website CMS" title={titles[pageKey]} description="Use the form for normal edits. The JSON editor is available on desktop for advanced structure changes." />

      {loading ? <LoadingState label="Loading content" /> : (
        <form onSubmit={save} className="grid gap-5">
          {message && <AdminNotice tone="success">{message}</AdminNotice>}
          {uploadStatus && <AdminNotice tone="success">{uploadStatus}</AdminNotice>}
          {error && <AdminNotice>{error}</AdminNotice>}

          <div className={`grid gap-5 ${advancedOpen ? 'xl:grid-cols-[0.9fr_1.1fr]' : ''}`}>
            <AdminSurface className="grid gap-5">
              <StructuredFields pageKey={pageKey} content={content} patch={patch} updateList={updateList} uploadHomeBackground={uploadHomeBackground} patchServiceGroup={patchServiceGroup} uploadServiceLogo={uploadServiceLogo} />
            </AdminSurface>

            {advancedOpen ? <AdminSurface className="min-w-0 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm text-zinc-300">Advanced JSON editor</p>
                  <p className="mt-1 text-xs text-zinc-500">Advanced edits are optional. The standard fields stay usable if this editor fails.</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const parsed = JSON.parse(jsonText);
                        setContent(parsed);
                        setJsonText(JSON.stringify(parsed, null, 2));
                        setDirty(true);
                        setError('');
                      } catch (parseError) {
                        setError(parseError.message || 'Invalid JSON. Fix the JSON before applying it to the form.');
                      }
                    }}
                    className="rounded-md bg-white/[0.055] px-3 py-2 text-xs text-zinc-300 ring-1 ring-white/[0.08] hover:text-white"
                  >
                    Apply JSON to form
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen(false)}
                    className="rounded-md bg-white/[0.035] px-3 py-2 text-xs text-zinc-500 ring-1 ring-white/[0.06] hover:text-zinc-200"
                  >
                    Close
                  </button>
                </div>
              </div>
              <AdvancedEditorLoader
                jsonText={jsonText}
                onChange={(value) => {
                  setJsonText(value);
                  setMessage('');
                  setDirty(true);
                }}
              />
            </AdminSurface> : (
              <AdminSurface className="grid gap-4 border border-dashed border-white/[0.08] bg-transparent">
                <div>
                  <p className="text-sm font-medium text-zinc-200">Advanced JSON editor</p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">Closed by default so the content editor loads quickly. Open it only when you need to edit the raw page structure.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAdvancedOpen(true)}
                  className="w-fit rounded-md bg-white/[0.055] px-4 py-2.5 text-sm font-medium text-zinc-200 ring-1 ring-white/[0.08] transition hover:bg-white/[0.085] hover:text-white"
                >
                  Open Advanced JSON Editor
                </button>
              </AdminSurface>
            )}
          </div>

          <AdminButton disabled={saving} type="submit" variant="primary" className="w-fit">
            {saving ? 'Saving...' : 'Save page content'}
          </AdminButton>
        </form>
      )}
    </AdminLayout>
  );
}

function AdvancedEditorLoader({ jsonText, onChange }) {
  const [EditorComponent, setEditorComponent] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    const slowTimer = window.setTimeout(() => {
      if (active) {
        setLoadError('Advanced editor failed to load. You can still use the standard fields.');
      }
    }, 15000);

    setEditorComponent(null);
    setLoadError('');

    import('../../components/admin/AdvancedJsonEditor')
      .then((module) => {
        window.clearTimeout(slowTimer);
        if (!active) return;
        setEditorComponent(() => module.default);
        setLoadError('');
      })
      .catch(() => {
        window.clearTimeout(slowTimer);
        if (!active) return;
        setLoadError('Advanced editor failed to load. You can still use the standard fields.');
      });

    return () => {
      active = false;
      window.clearTimeout(slowTimer);
    };
  }, [retryKey]);

  if (loadError) {
    return (
      <div className="grid min-h-64 place-items-center rounded-md bg-zinc-950/45 p-6 text-center ring-1 ring-white/[0.07]">
        <div className="max-w-sm">
          <p className="text-sm font-medium text-zinc-200">{loadError}</p>
          <p className="mt-2 text-xs leading-5 text-zinc-500">Your standard content fields are still active, and saving from the standard form will continue to work.</p>
          <button
            type="button"
            onClick={() => setRetryKey((current) => current + 1)}
            className="mt-4 rounded-md bg-white/[0.055] px-3 py-2 text-xs text-zinc-300 ring-1 ring-white/[0.08] hover:text-white"
          >
            Retry loading editor
          </button>
        </div>
      </div>
    );
  }

  if (!EditorComponent) {
    return (
      <div className="grid h-[620px] place-items-center rounded-md bg-zinc-950/45 text-sm text-zinc-500 ring-1 ring-white/[0.07]">
        Loading advanced JSON editor...
      </div>
    );
  }

  return (
    <AdvancedEditorErrorBoundary key={retryKey} onRetry={() => setRetryKey((current) => current + 1)}>
      <EditorComponent value={jsonText} onChange={onChange} />
    </AdvancedEditorErrorBoundary>
  );
}

class AdvancedEditorErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-64 place-items-center rounded-md bg-zinc-950/45 p-6 text-center ring-1 ring-white/[0.07]">
          <div className="max-w-sm">
            <p className="text-sm font-medium text-zinc-200">Advanced editor failed to load. You can still use the standard fields.</p>
            <p className="mt-2 text-xs leading-5 text-zinc-500">The visual/content fields are still available and safe to save.</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                this.props.onRetry?.();
              }}
              className="mt-4 rounded-md bg-white/[0.055] px-3 py-2 text-xs text-zinc-300 ring-1 ring-white/[0.08] hover:text-white"
            >
              Retry loading editor
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function StructuredFields({ pageKey, content, patch, updateList, uploadHomeBackground, patchServiceGroup, uploadServiceLogo }) {
  if (pageKey === 'home') {
    return (
      <>
        <Field label="Hero eyebrow" value={content.heroEyebrow || ''} onChange={(value) => patch({ heroEyebrow: value })} />
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
    const groups = content.groups || [];
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
        <div className="grid gap-4">
          {groups.map((group, index) => (
            <div key={`${group.name || 'service'}-${index}`} className="grid gap-4 rounded-lg bg-zinc-950/45 p-4 ring-1 ring-white/[0.07]">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-zinc-200">Service {index + 1}</p>
                <button
                  type="button"
                  onClick={() => patch({ groups: groups.filter((_, groupIndex) => groupIndex !== index) })}
                  className="text-xs text-zinc-500 hover:text-red-200"
                >
                  Remove
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Service name" value={group.name || ''} onChange={(value) => patchServiceGroup(index, { name: value })} />
                <Field label="Lucide icon name" value={group.iconName || ''} onChange={(value) => patchServiceGroup(index, { iconName: value })} />
              </div>
              <Textarea label="Description" value={group.description || ''} onChange={(value) => patchServiceGroup(index, { description: value })} />
              <Textarea
                label="Items, comma-separated"
                value={group.itemsText ?? (group.items || []).join(', ')}
                onChange={(value) => patchServiceGroup(index, { itemsText: value })}
                onBlur={() => patchServiceGroup(index, {
                  items: (group.itemsText ?? '').split(',').map((item) => item.trim()).filter(Boolean),
                  itemsText: undefined,
                })}
              />
              <UploadRow
                label="Service logo"
                value={group.serviceLogoUrl || ''}
                onFile={(file) => uploadServiceLogo(index, file)}
                onClear={() => patchServiceGroup(index, { serviceLogoUrl: '' })}
              />
              <Field label="Icon image URL" value={group.customIconUrl || group.iconUrl || ''} onChange={(value) => patchServiceGroup(index, { customIconUrl: value, iconUrl: '' })} />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => patch({ groups: [...groups, { name: 'New Service', description: '', items: [], iconName: 'Circle', iconUrl: '', customIconUrl: '', serviceLogoUrl: '' }] })}
          className="w-fit rounded-md bg-white/[0.055] px-3 py-2 text-sm text-zinc-200 ring-1 ring-white/[0.08] hover:bg-white/[0.085]"
        >
          Add service
        </button>
        <p className="text-xs leading-5 text-zinc-500">The service logo appears on the left side of the icon on the public Services page. Icon image URLs can still be copied from Icons / Media.</p>
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
      <input type={type} value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45" />
    </label>
  );
}

function Textarea({ label, value, onChange, onBlur, rows = 4 }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45" />
    </label>
  );
}

function Select({ label, value, options, onChange }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45">
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <div className="flex items-center gap-3 rounded-md bg-zinc-950/55 px-3 py-2 ring-1 ring-white/[0.08]">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-12 bg-transparent" />
        <span className="font-mono text-xs text-zinc-400">{value}</span>
      </div>
    </label>
  );
}

function UploadRow({ label, value, onFile, onClear }) {
  return (
    <div className="rounded-lg bg-zinc-950/45 p-4 ring-1 ring-white/[0.07]">
      <p className="text-sm text-zinc-300">{label}</p>
      <p className="mt-1 text-xs text-zinc-500">Large raster images are resized and optimized automatically. Hero images target 1 MB; service logos target 300 KB.</p>
      {value && <img src={value} alt="" className="mt-3 max-h-28 max-w-full object-cover" />}
      <div className="mt-4 flex flex-wrap gap-3">
        <label className="cursor-pointer rounded-md bg-white/[0.055] px-3 py-2 text-sm text-zinc-200 ring-1 ring-white/[0.08] hover:bg-white/[0.085]">
          Choose image
          <input className="sr-only" type="file" accept="image/*" onChange={(event) => onFile(event.target.files?.[0])} />
        </label>
        {value && <button type="button" onClick={onClear} className="rounded-md bg-white/[0.055] px-3 py-2 text-sm text-zinc-400 ring-1 ring-white/[0.08] hover:text-white">Remove</button>}
      </div>
    </div>
  );
}

