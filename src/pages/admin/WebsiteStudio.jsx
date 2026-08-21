import { ArrowLeft, ChevronDown, ChevronRight, ExternalLink, Save, Search, Send, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import LoadingState from '../../components/LoadingState.jsx';
import UnsavedChangesGuard from '../../components/admin/UnsavedChangesGuard.jsx';
import { useAdminAccess } from '../../lib/adminAccess.jsx';
import {
  discardWebsiteDraft, fetchWebsiteStudioEntries,
  publishWebsiteEntry, liveWebsiteFieldValue, saveWebsiteDraft,
  validateWebsiteEntry, WEBSITE_STUDIO_SECTIONS, websiteEntryState, websiteImpact,
} from '../../lib/websiteStudio.js';
import { uploadSiteAsset } from '../../lib/contentApi.js';
import { PUBLIC_NAVIGATION_ICON_OPTIONS } from '../../lib/publicNavigation.js';

const pageRoutes = { 'page.home': '/', 'page.explore': '/work', 'page.creatives': '/creatives', 'page.projects': '/projects', 'page.about': '/about', 'page.inquiries': '/inquiry', 'page.privacy': '/privacy' };
const pageGroupOrder = ['Shared across the website', 'Public pages'];
const pageGroupDescriptions = {
  'Shared across the website': 'Edit a value once and every connected area updates together.',
  'Public pages': 'Edit the words for one public page. Project and profile images remain connected to their own records.',
};

function labelFromKey(key = '') { return key.replace(/^page\.|^global\.|^service\./, '').replaceAll('.', ' · ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function fieldsFromData(data = {}) { return Object.entries(data).filter(([, value]) => ['string','number','boolean'].includes(typeof value)).map(([key, value]) => [key, labelFromKey(key), typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : key.toLowerCase().includes('url') ? 'url' : String(value).length > 100 ? 'textarea' : 'text']); }
function friendlyError(error) {
  const message = error?.message || 'The action could not be completed.';
  if (/FORBIDDEN|42501/i.test(message)) return 'Your account does not have permission for that Website Studio action.';
  if (/INVALID_CONTENT|unsafe|script/i.test(message)) return 'The content contains an unsupported value or unsafe URL.';
  if (/NO_DRAFT/i.test(message)) return 'Save a draft before publishing.';
  return message;
}
function studioPlacement(key, entryType = '') {
  if (key === 'overview') return ['Public pages', 'Website editing home'];
  if (key === 'global.brand') return ['Shared across the website', 'Logo, brand name, and tagline used throughout the site'];
  if (key === 'global.navigation') return ['Shared across the website', 'Labels and visibility for the top and mobile menus'];
  if (key === 'global.appearance') return ['Shared across the website', 'Website-wide colors, buttons, text, and borders'];
  if (key === 'page.home') return ['Public pages', 'Creative Feed introduction; posts, projects, and profile images stay automatic'];
  if (key === 'page.explore') return ['Public pages', 'Active Work introduction'];
  if (key === 'page.creatives') return ['Public pages', 'Creative directory descriptions'];
  if (key === 'page.projects') return ['Public pages', 'Portfolio introduction'];
  if (key === 'page.about') return ['Public pages', 'About page content and information cards'];
  if (key === 'page.inquiries') return ['Shared content', 'Footer contact, social links, and inquiry wording'];
  if (key === 'page.privacy') return ['Public pages', 'Privacy Policy headings, sections, and effective date'];
  return ['Public pages', 'Public website content'];
}
function groupNavigation(items) {
  const groups = items.reduce((result, item) => ({ ...result, [item.group]: [...(result[item.group] || []), item] }), {});
  return Object.entries(groups).sort(([first], [second]) => pageGroupOrder.indexOf(first) - pageGroupOrder.indexOf(second));
}
function fieldIsAdvanced([key, , type]) { return type === 'boolean' || type === 'route' || /Alt$/.test(key); }

export default function WebsiteStudio() {
  const { role } = useAdminAccess();
  const [params, setParams] = useSearchParams();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState('');
  const [uploading, setUploading] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [desktopEditing, setDesktopEditing] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches);
  const sectionKey = params.get('section') || 'overview';
  const selected = entries.find((entry) => entry.entry_key === sectionKey && !['branch', 'service'].includes(entry.entry_type)) || null;

  useEffect(() => { const media = window.matchMedia('(min-width: 1024px)'); const sync = () => setDesktopEditing(media.matches); sync(); media.addEventListener('change', sync); return () => media.removeEventListener('change', sync); }, []);

  async function load() {
    setLoading(true); setError('');
    try {
      setEntries(await fetchWebsiteStudioEntries());
    } catch (loadError) { setError(friendlyError(loadError)); }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!selected) { setForm({}); setDirty(false); return; }
    setForm(structuredClone(selected.draft_data || selected.published_data || {}));
    setDirty(false);
  }, [selected?.entry_key, selected?.updated_at]);

  const navigation = useMemo(() => {
    const fixed = WEBSITE_STUDIO_SECTIONS.map((item) => { const [group, part] = studioPlacement(item.key); return { ...item, group, part, name: item.label }; });
    const query = search.trim().toLowerCase();
    return fixed.filter((item) => !query || `${item.name} ${item.group} ${item.part}`.toLowerCase().includes(query));
  }, [entries, search]);

  const config = WEBSITE_STUDIO_SECTIONS.find((item) => item.key === sectionKey);
  const fields = config?.fields?.length ? config.fields : fieldsFromData(form);
  const state = selected ? websiteEntryState(selected) : '';

  function selectSection(key) { if (dirty) { setError('Save or discard the current changes before opening another section.'); return; } setNotice(''); setError(''); setParams(key === 'overview' ? {} : { section: key }); }
  function updateField(key, value, type) {
    try {
      const safe = liveWebsiteFieldValue(value, type);
      setForm((current) => ({ ...current, [key]: safe }));
      setDirty(true);
      setError('');
      setNotice('');
    } catch (fieldError) { setError(fieldError.message); }
  }
  function replaceEntry(row) { setEntries((current) => current.map((item) => item.entry_key === row.entry_key ? row : item)); setForm(structuredClone(row.draft_data || row.published_data || {})); setDirty(false); }
  async function run(action, callback) {
    if (!selected || working) return;
    setWorking(action); setError(''); setNotice('');
    try { const row = await callback(); replaceEntry(row); setNotice(action === 'save' ? 'Draft saved. Publish it to update every connected public page.' : action === 'publish' ? 'Published. Connected public pages are refreshing now.' : 'Draft changes discarded.'); }
    catch (actionError) { setError(friendlyError(actionError)); }
    setWorking('');
  }
  async function save() { const validated = validateWebsiteEntry(form, fields); await run('save', () => saveWebsiteDraft(selected.entry_key, validated)); }
  async function uploadImage(fieldKey, file) {
    if (!file || uploading) return;
    setUploading(fieldKey); setError(''); setNotice('');
    try {
      const url = await uploadSiteAsset(file, 'brand', 'siteLogo');
      updateField(fieldKey, url, 'image');
      setNotice('Logo uploaded. Save the draft, then publish it to update its connected placement.');
    } catch (uploadError) { setError(friendlyError(uploadError)); }
    setUploading('');
  }
  async function publish() { if (dirty) { setError('Save the draft before publishing.'); return; } if (!selected?.draft_data) { setError('There are no unpublished changes to publish.'); return; } await run('publish', () => publishWebsiteEntry(selected.entry_key)); }
  if (!['super_admin','owner','admin'].includes(role)) return <Navigate to="/admin/dashboard" replace />;
  if (!desktopEditing) return <main className="ll-desktop-admin-required"><section><h1>Desktop editing only</h1><p>Website editing is intentionally unavailable on small screens. Open Lahat Liwa on a desktop or laptop to edit public content safely.</p><Link to="/">Return to the website</Link></section></main>;
  const returnRoute = pageRoutes[sectionKey] || '/';
  if (loading) return <main className="ll-site-editor-loading"><LoadingState label="Loading website editor" /></main>;

  return <div className="ll-site-editor-layer">
    <iframe className="ll-site-editor-preview" src={returnRoute} title="Live website preview" />
    <div className="ll-site-editor-scrim" aria-hidden="true" />
    <section className="ll-site-editor-panel" role="dialog" aria-modal="true" aria-label="Edit public website">
    <UnsavedChangesGuard dirty={dirty && !working} />
    <header className="ll-site-editor-heading">
      <div><p className="ll-kicker">Website editor</p><h1>Edit the public website</h1><p>Change platform-owned words and shared brand settings while keeping Creative work untouched.</p></div>
      <Link to={returnRoute} className="ll-secondary-action"><ArrowLeft size={16}/>Close</Link>
    </header>
    {error && <div role="alert" className="mb-4 border border-red-300/25 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">{error}</div>}
    {notice && <div role="status" className="mb-4 border border-emerald-300/25 bg-emerald-300/[0.06] px-4 py-3 text-sm text-emerald-100">{notice}</div>}
    <main className="min-w-0">
      {sectionKey === 'overview' ? <SectionChooser navigation={navigation} entries={entries} search={search} setSearch={setSearch} onSelect={selectSection} /> : <>
        <button type="button" onClick={() => selectSection('overview')} className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-zinc-300 transition hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60"><ArrowLeft size={16}/>All website sections</button>
        <StudioContent sectionKey={sectionKey} selected={selected} form={form} fields={fields} config={config} state={state} dirty={dirty} working={working} uploading={uploading} uploadImage={uploadImage} updateField={updateField} save={save} publish={publish} discard={() => run('discard', () => discardWebsiteDraft(selected.entry_key))} />
      </>}
    </main>
    </section>
  </div>;
}

function SectionChooser({ navigation, entries, search, setSearch, onSelect }) {
  const groups = groupNavigation(navigation.filter((item) => item.key !== 'overview'));
  const renderItems = (items) => <div className="mt-4 grid gap-2 sm:grid-cols-2">{items.map((item) => { const row = entries.find((entry) => entry.entry_key === item.key); return <button key={item.key} type="button" onClick={() => onSelect(item.key)} className="group flex min-h-20 items-center justify-between gap-4 rounded-lg border border-white/[0.09] bg-white/[0.02] px-4 py-3 text-left transition hover:border-amber-200/30 hover:bg-amber-200/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-zinc-100 group-hover:text-amber-100">{item.name}</span><span className="mt-1 block text-xs leading-5 text-zinc-500">{item.part}</span></span><span className="flex shrink-0 items-center gap-2"><span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${row?.draft_data ? 'text-amber-200' : 'text-zinc-600'}`}>{row?.draft_data ? 'Draft' : 'Live'}</span><ChevronRight size={16} className="text-zinc-600 group-hover:text-amber-200"/></span></button>; })}</div>;
  return <section aria-labelledby="website-sections-heading">
    <div className="max-w-2xl"><h2 id="website-sections-heading" className="text-2xl font-semibold text-white">What would you like to change?</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Choose Branding, Navbar, or Colors for synchronized website-wide changes. Choose a public page when only that page's wording needs to change.</p></div>
    <label data-search-shell className="mt-5 flex h-11 max-w-md items-center gap-2 rounded-lg border border-white/[0.1] bg-black/20 px-3"><Search size={15} className="shrink-0 text-zinc-500" aria-hidden="true"/><span className="sr-only">Search website sections</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pages or settings" className="min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"/></label>
    <nav className="mt-8 grid gap-8" aria-label="Website Studio sections">{groups.map(([group, items]) => <section key={group} className="rounded-xl border border-white/[0.09] bg-white/[0.015] p-4 sm:p-5"><div><h3 className="text-lg font-semibold text-white">{group}</h3><p className="mt-1 text-sm leading-6 text-zinc-500">{pageGroupDescriptions[group]}</p></div>{renderItems(items)}</section>)}</nav>
  </section>;
}

function StudioContent(props) {
  const { sectionKey, selected, form, fields, config, state, dirty, working, uploading, uploadImage, updateField, save, publish, discard } = props;
  if (!selected) return <div className="grid min-h-[30rem] place-items-center text-sm text-zinc-500">Choose a Website Studio section.</div>;
  const commonFields = fields.filter((field) => !fieldIsAdvanced(field));
  const advancedFields = fields.filter(fieldIsAdvanced);
  const statusLabel = working ? (working === 'save' ? 'Saving' : working === 'publish' ? 'Publishing' : 'Working') : dirty ? 'Unsaved changes' : state;
  return <div className="ll-studio-content">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-5"><div><p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{selected.entry_type}</p><h2 className="mt-1 text-2xl font-semibold text-white">{form.name || config?.label || labelFromKey(selected.entry_key)}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Changes here appear in {websiteImpact(selected.entry_key).join(', ')}.</p></div><span className={`text-xs font-semibold ${state === 'Published' && !dirty ? 'text-emerald-200' : 'text-amber-200'}`}>{statusLabel}</span></div>
    <div className="ll-studio-commandbar" role="toolbar" aria-label="Website editing commands"><div><button type="button" onClick={save} disabled={!dirty || Boolean(working) || Boolean(uploading)} className="ll-primary-action"><Save size={15}/><span>{working === 'save' ? 'Saving' : 'Save draft'}</span></button><button type="button" onClick={publish} disabled={dirty || !selected.draft_data || Boolean(working) || Boolean(uploading)} className="ll-secondary-action"><Send size={15}/><span>{working === 'publish' ? 'Publishing' : 'Publish live'}</span></button><button type="button" onClick={discard} disabled={!selected.draft_data || Boolean(working) || Boolean(uploading)} className="ll-studio-tool" aria-label="Discard draft"><Undo2 size={15}/><span>Undo draft</span></button></div>{pageRoutes[selected.entry_key] && <Link to={pageRoutes[selected.entry_key]} target="_blank" rel="noreferrer" className="ll-studio-tool" aria-label="Preview page"><ExternalLink size={15}/><span>Preview</span></Link>}</div>
    {sectionKey === 'global.appearance' && <AppearanceGuide/>}
    {sectionKey === 'page.home' && <div className="mt-6 border-l-2 border-sky-300/35 pl-4"><h3 className="text-sm font-semibold text-white">The feed stays connected automatically</h3><p className="mt-1 text-sm leading-6 text-zinc-400">Published Creative posts, project media, names, and profile photos flow into Home automatically. This section edits only the feed introduction.</p></div>}
    {sectionKey === 'global.brand' && <div className="mt-6 border-l-2 border-amber-200/40 pl-4"><h3 className="text-sm font-semibold text-white">One identity, two logo placements</h3><p className="mt-1 text-sm leading-6 text-zinc-400">The navbar uses a compact standalone symbol. The footer uses the complete wordmark. Each image can be replaced independently.</p></div>}
    {sectionKey === 'page.inquiries' && <div className="mt-6 border-l-2 border-emerald-300/35 pl-4"><h3 className="text-sm font-semibold text-white">Contact lives in the footer</h3><p className="mt-1 text-sm leading-6 text-zinc-400">The message action, email, and social links stay available across every public page. Inquiry wording appears in the collaboration form.</p></div>}
    <section className="mt-6"><h3 className="text-base font-semibold text-white">Editable content</h3><p className="mt-1 text-sm text-zinc-500">Use plain, visitor-friendly wording. Every field below has one clear destination.</p><div className="mt-5 grid gap-5 sm:grid-cols-2">{commonFields.map(([key,label,type]) => <StudioField key={key} fieldKey={key} label={label} type={type} value={form[key]} uploading={uploading === key} onUpload={(file) => uploadImage(key,file)} onChange={(value) => updateField(key,value,type)}/>)}</div></section>
    {advancedFields.length > 0 && <details className="group mt-8 border-t border-white/[0.08] pt-5"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-zinc-200">Advanced settings<ChevronDown size={17} className="transition-transform group-open:rotate-180"/></summary><p className="mt-1 text-sm text-zinc-500">Visibility, links, search details, media references, and display order.</p><div className="mt-5 grid gap-5 sm:grid-cols-2">{advancedFields.map(([key,label,type]) => <StudioField key={key} fieldKey={key} label={label} type={type} value={form[key]} onChange={(value) => updateField(key,value,type)}/>)}</div></details>}
    <p className="ll-studio-save-hint"><strong>Save draft</strong> keeps changes private. <strong>Publish live</strong> updates the public website.</p>
  </div>;
}

function AppearanceGuide() { return <div className="mt-6 border-l-2 border-amber-200/40 pl-4"><h3 className="text-sm font-semibold text-white">Global theme colors</h3><p className="mt-1 text-sm leading-6 text-zinc-400">These brand colors support both light and dark mode across public pages, including Current Work, buttons, links, body text, and dividers. Publish carefully because this changes the whole website.</p></div>; }
function keepEditorKeysLocal(event) { event.stopPropagation(); }
function StudioField({ fieldKey, label, type, value, onChange, onUpload, uploading = false }) {
  if (type === 'boolean') return <label className="flex min-h-11 items-center justify-between gap-3 border-b border-white/[0.08] py-2 text-sm text-zinc-300"><span>{label}</span><input type="checkbox" checked={value === true} onKeyDown={keepEditorKeysLocal} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-amber-300"/></label>;
  if (type === 'status') return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><select value={value || 'active'} onKeyDown={keepEditorKeysLocal} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-lg border border-white/[0.1] bg-zinc-950 px-3 text-white"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>;
  if (type === 'textarea') return <label className="grid gap-1.5 text-sm text-zinc-400 sm:col-span-2"><span>{label}</span><textarea rows="4" value={value ?? ''} onKeyDown={keepEditorKeysLocal} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-white/[0.1] bg-black/20 px-3 py-2.5 leading-6 text-white outline-none focus:border-amber-200/50"/></label>;
  if (type === 'color') return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><span className="flex h-12 items-center gap-3 rounded-lg border border-white/[0.1] bg-black/20 px-2"><input aria-label={`${label} color picker`} type="color" value={value || '#ffffff'} onKeyDown={keepEditorKeysLocal} onChange={(event) => onChange(event.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"/><input aria-label={`${label} hex value`} type="text" value={value ?? ''} onKeyDown={keepEditorKeysLocal} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase text-white outline-none"/></span></label>;
  if (type === 'icon') return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><select value={value || ''} onKeyDown={keepEditorKeysLocal} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-lg border border-white/[0.1] bg-zinc-950 px-3 text-white"><option value="">Use default icon</option>{PUBLIC_NAVIGATION_ICON_OPTIONS.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>;
  if (type === 'image') return <div className="grid gap-2 text-sm text-zinc-400 sm:col-span-2"><span>{label}</span><div className="grid gap-4 rounded-xl border border-white/[0.1] bg-black/20 p-4 sm:grid-cols-[10rem_1fr] sm:items-center">{value ? <img src={value} alt={`Current ${label.toLowerCase()}`} className="h-32 w-40 rounded-lg border border-white/10 bg-zinc-900 object-contain p-2"/> : <div className="grid h-32 w-40 place-items-center rounded-lg border border-dashed border-white/15 text-xs text-zinc-600">No logo</div>}<div><label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-amber-200 px-4 font-semibold text-zinc-950"><input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" disabled={uploading} onChange={(event) => { const file=event.target.files?.[0]; if (file) onUpload(file); event.target.value=''; }}/>{uploading ? 'Uploading…' : value ? 'Replace logo' : 'Upload logo'}</label><p className="mt-2 text-xs leading-5 text-zinc-500">PNG with transparency works best. This upload changes only the named placement.</p></div></div></div>;
  return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><input type={type === 'number' ? 'number' : type === 'email' ? 'email' : 'text'} value={value ?? ''} onKeyDown={keepEditorKeysLocal} onChange={(event) => onChange(type === 'number' ? event.target.valueAsNumber : event.target.value)} className="h-11 rounded-lg border border-white/[0.1] bg-black/20 px-3 text-white outline-none focus:border-amber-200/50"/></label>;
}
