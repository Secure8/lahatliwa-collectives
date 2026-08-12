import { ArrowLeft, ChevronDown, ChevronRight, ExternalLink, Save, Search, Send, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import UnsavedChangesGuard from '../../components/admin/UnsavedChangesGuard.jsx';
import { useAdminAccess } from '../../lib/adminAccess.jsx';
import {
  discardWebsiteDraft, fetchWebsiteStudioEntries,
  publishWebsiteEntry, liveWebsiteFieldValue, saveWebsiteDraft, SERVICE_FIELDS,
  validateWebsiteEntry, WEBSITE_STUDIO_SECTIONS, websiteEntryState, websiteImpact,
} from '../../lib/websiteStudio.js';

const pageRoutes = { 'page.home': '/', 'page.explore': '/explore', 'page.creatives': '/creatives', 'page.projects': '/projects', 'page.services': '/services', 'page.about': '/about', 'page.inquiries': '/contact' };
const advancedFieldPattern = /(url|alt|seo|search|social|facebook|instagram|linkedin|youtube|tiktok|github|order|status|visibility|availability|featured|show|enabled|icon|image)/i;
const pageGroupOrder = ['Pages', 'Site settings', 'Services'];
const pageGroupDescriptions = {
  Pages: 'Change the words visitors see on each public page.',
  'Site settings': 'Update your brand, navigation, footer, colors, and sharing details.',
  Services: 'Edit individual services shown on the Services page and inquiry form.',
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
  if (key === 'overview') return ['Pages', 'Website editing home'];
  if (key === 'global.brand') return ['Site settings', 'Website name, logo, contact, and identity'];
  if (key === 'global.navigation') return ['Site settings', 'Links shown in the website menu'];
  if (key === 'global.footer') return ['Site settings', 'Information shown at the bottom of every page'];
  if (key === 'page.search') return ['Site settings', 'Search, sharing image, and social links'];
  if (key === 'global.appearance') return ['Site settings', 'Website colors in light and dark mode'];
  if (key === 'page.home') return ['Pages', 'Homepage'];
  if (key === 'page.explore') return ['Pages', 'Explore Aklan'];
  if (key === 'page.creatives') return ['Pages', 'Creatives'];
  if (key === 'page.projects') return ['Pages', 'Projects'];
  if (key === 'page.services') return ['Pages', 'Services introduction'];
  if (entryType === 'service') return ['Services', 'Service listing and inquiry choice'];
  if (key === 'page.about') return ['Pages', 'About'];
  if (key === 'page.inquiries') return ['Pages', 'Inquiry introduction'];
  return ['Site settings', 'Shared website content'];
}
function groupNavigation(items) {
  const groups = items.reduce((result, item) => ({ ...result, [item.group]: [...(result[item.group] || []), item] }), {});
  return Object.entries(groups).sort(([first], [second]) => pageGroupOrder.indexOf(first) - pageGroupOrder.indexOf(second));
}
function fieldIsAdvanced([key, , type]) { return type === 'status' || type === 'number' || advancedFieldPattern.test(key); }

export default function WebsiteStudio() {
  const { role } = useAdminAccess();
  const [params, setParams] = useSearchParams();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const sectionKey = params.get('section') || 'overview';
  const selected = entries.find((entry) => entry.entry_key === sectionKey && entry.entry_type !== 'branch') || null;

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
    const connected = entries.filter((entry) => entry.entry_type === 'service').map((entry) => { const [group, part] = studioPlacement(entry.entry_key, entry.entry_type); return { key: entry.entry_key, group, part, name: (entry.draft_data || entry.published_data)?.name || labelFromKey(entry.entry_key) }; });
    const query = search.trim().toLowerCase();
    return [...fixed, ...connected].filter((item) => !query || `${item.name} ${item.group} ${item.part}`.toLowerCase().includes(query));
  }, [entries, search]);

  const config = WEBSITE_STUDIO_SECTIONS.find((item) => item.key === sectionKey);
  const fields = selected?.entry_type === 'service' ? SERVICE_FIELDS : (config?.fields?.length ? config.fields : fieldsFromData(form));
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
  async function publish() { if (dirty) { setError('Save the draft before publishing.'); return; } if (!selected?.draft_data) { setError('There are no unpublished changes to publish.'); return; } await run('publish', () => publishWebsiteEntry(selected.entry_key)); }
  if (!['super_admin','owner','admin'].includes(role)) return <Navigate to="/admin/dashboard" replace />;
  if (loading) return <AdminLayout><LoadingState label="Loading Website Studio" /></AdminLayout>;

  return <AdminLayout>
    <UnsavedChangesGuard dirty={dirty && !working} />
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-5">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Website Studio</p><h1 className="mt-2 text-3xl font-semibold text-white">Edit your website</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Choose what you want to change. You will only see the fields needed for that section.</p></div>
      <div className="flex flex-wrap gap-2"><Link to="/admin/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/[0.12] px-4 text-sm font-semibold text-white"><ArrowLeft size={16}/>Admin home</Link><Link to="/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-200 px-4 text-sm font-semibold text-zinc-950"><ExternalLink size={16}/>View live website</Link></div>
    </header>
    {error && <div role="alert" className="mb-4 border border-red-300/25 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">{error}</div>}
    {notice && <div role="status" className="mb-4 border border-emerald-300/25 bg-emerald-300/[0.06] px-4 py-3 text-sm text-emerald-100">{notice}</div>}
    <main className="min-w-0">
      {sectionKey === 'overview' ? <SectionChooser navigation={navigation} entries={entries} search={search} setSearch={setSearch} onSelect={selectSection} /> : <>
        <button type="button" onClick={() => selectSection('overview')} className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-zinc-300 transition hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60"><ArrowLeft size={16}/>All website sections</button>
        <StudioContent sectionKey={sectionKey} selected={selected} form={form} fields={fields} config={config} state={state} dirty={dirty} working={working} updateField={updateField} save={save} publish={publish} discard={() => run('discard', () => discardWebsiteDraft(selected.entry_key))} />
      </>}
    </main>
  </AdminLayout>;
}

function SectionChooser({ navigation, entries, search, setSearch, onSelect }) {
  const groups = groupNavigation(navigation.filter((item) => item.key !== 'overview'));
  const renderItems = (items) => <div className="mt-4 grid gap-2 sm:grid-cols-2">{items.map((item) => { const row = entries.find((entry) => entry.entry_key === item.key); return <button key={item.key} type="button" onClick={() => onSelect(item.key)} className="group flex min-h-20 items-center justify-between gap-4 rounded-lg border border-white/[0.09] bg-white/[0.02] px-4 py-3 text-left transition hover:border-amber-200/30 hover:bg-amber-200/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-zinc-100 group-hover:text-amber-100">{item.name}</span><span className="mt-1 block text-xs leading-5 text-zinc-500">{item.part}</span></span><span className="flex shrink-0 items-center gap-2"><span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${row?.draft_data ? 'text-amber-200' : 'text-zinc-600'}`}>{row?.draft_data ? 'Draft' : 'Live'}</span><ChevronRight size={16} className="text-zinc-600 group-hover:text-amber-200"/></span></button>; })}</div>;
  return <section aria-labelledby="website-sections-heading">
    <div className="max-w-2xl"><h2 id="website-sections-heading" className="text-2xl font-semibold text-white">What would you like to change?</h2><p className="mt-2 text-sm leading-6 text-zinc-400">Most updates start under Pages. Site settings affect several pages at once.</p></div>
    <label data-search-shell className="mt-5 flex h-11 max-w-md items-center gap-2 rounded-lg border border-white/[0.1] bg-black/20 px-3"><Search size={15} className="shrink-0 text-zinc-500" aria-hidden="true"/><span className="sr-only">Search website sections</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pages, settings, or services" className="min-w-0 flex-1 border-0 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"/></label>
    <nav className="mt-8 grid gap-8" aria-label="Website Studio sections">{groups.map(([group, items]) => group === 'Services' && !search ? <details key={group} className="group rounded-xl border border-white/[0.09] bg-white/[0.015] p-4 sm:p-5"><summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4"><span><span className="block text-lg font-semibold text-white">{group}</span><span className="mt-1 block text-sm leading-6 text-zinc-500">{pageGroupDescriptions[group]}</span></span><span className="inline-flex shrink-0 items-center gap-2 text-xs text-zinc-500">{items.length} services<ChevronDown size={17} className="transition-transform group-open:rotate-180"/></span></summary>{renderItems(items)}</details> : <section key={group} className="rounded-xl border border-white/[0.09] bg-white/[0.015] p-4 sm:p-5"><div><h3 className="text-lg font-semibold text-white">{group}</h3><p className="mt-1 text-sm leading-6 text-zinc-500">{pageGroupDescriptions[group]}</p></div>{renderItems(items)}</section>)}</nav>
  </section>;
}

function StudioContent(props) {
  const { sectionKey, selected, form, fields, config, state, dirty, working, updateField, save, publish, discard } = props;
  if (!selected) return <div className="grid min-h-[30rem] place-items-center text-sm text-zinc-500">Choose a Website Studio section.</div>;
  const commonFields = fields.filter((field) => !fieldIsAdvanced(field));
  const advancedFields = fields.filter(fieldIsAdvanced);
  const statusLabel = working ? (working === 'save' ? 'Saving' : working === 'publish' ? 'Publishing' : 'Working') : dirty ? 'Unsaved changes' : state;
  return <div className="mx-auto max-w-4xl">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-5"><div><p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{selected.entry_type}</p><h2 className="mt-1 text-2xl font-semibold text-white">{form.name || config?.label || labelFromKey(selected.entry_key)}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Changes here appear in {websiteImpact(selected.entry_key).join(', ')}.</p></div><span className={`text-xs font-semibold ${state === 'Published' && !dirty ? 'text-emerald-200' : 'text-amber-200'}`}>{statusLabel}</span></div>
    {sectionKey === 'global.appearance' && <AppearanceGuide/>}
    <section className="mt-6"><h3 className="text-base font-semibold text-white">Main content</h3><p className="mt-1 text-sm text-zinc-500">These are the details most visitors will notice.</p><div className="mt-5 grid gap-5 sm:grid-cols-2">{commonFields.map(([key,label,type]) => <StudioField key={key} fieldKey={key} label={label} type={type} value={form[key]} onChange={(value) => updateField(key,value,type)}/>)}</div></section>
    {advancedFields.length > 0 && <details className="group mt-8 border-t border-white/[0.08] pt-5"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-zinc-200">Advanced settings<ChevronDown size={17} className="transition-transform group-open:rotate-180"/></summary><p className="mt-1 text-sm text-zinc-500">Visibility, links, search details, media references, and display order.</p><div className="mt-5 grid gap-5 sm:grid-cols-2">{advancedFields.map(([key,label,type]) => <StudioField key={key} fieldKey={key} label={label} type={type} value={form[key]} onChange={(value) => updateField(key,value,type)}/>)}</div></details>}
    <div className="sticky bottom-0 mt-10 flex flex-wrap gap-2 border-t border-white/[0.1] bg-zinc-950 py-3"><p className="basis-full text-xs leading-5 text-zinc-500">Save stores this section privately. Publish applies the saved content everywhere listed above.</p><button type="button" onClick={save} disabled={!dirty || Boolean(working)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-200 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-40"><Save size={15}/>{working === 'save' ? 'Saving' : 'Save draft'}</button><button type="button" onClick={publish} disabled={dirty || !selected.draft_data || Boolean(working)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-300/35 px-4 text-sm font-semibold text-emerald-100 disabled:opacity-40"><Send size={15}/>{working === 'publish' ? 'Publishing' : 'Publish'}</button><button type="button" onClick={discard} disabled={!selected.draft_data || Boolean(working)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.1] px-4 text-sm text-zinc-300 disabled:opacity-40"><Undo2 size={15}/>Discard</button>{pageRoutes[selected.entry_key] && <Link to={pageRoutes[selected.entry_key]} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.1] px-4 text-sm text-zinc-200"><ExternalLink size={15}/>Open this page</Link>}</div>
  </div>;
}

function AppearanceGuide() { return <div className="mt-6 border-l-2 border-amber-200/40 pl-4"><h3 className="text-sm font-semibold text-white">Global theme colors</h3><p className="mt-1 text-sm leading-6 text-zinc-400">These brand colors support both light and dark mode across public pages, including Explore Aklan, buttons, links, body text, and dividers. Publish carefully because this changes the whole website.</p></div>; }
function keepEditorKeysLocal(event) { event.stopPropagation(); }
function StudioField({ fieldKey, label, type, value, onChange }) {
  if (type === 'boolean') return <label className="flex min-h-11 items-center justify-between gap-3 border-b border-white/[0.08] py-2 text-sm text-zinc-300"><span>{label}</span><input type="checkbox" checked={value === true} onKeyDown={keepEditorKeysLocal} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-amber-300"/></label>;
  if (type === 'status') return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><select value={value || 'active'} onKeyDown={keepEditorKeysLocal} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-lg border border-white/[0.1] bg-zinc-950 px-3 text-white"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>;
  if (type === 'textarea') return <label className="grid gap-1.5 text-sm text-zinc-400 sm:col-span-2"><span>{label}</span><textarea rows="4" value={value ?? ''} onKeyDown={keepEditorKeysLocal} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-white/[0.1] bg-black/20 px-3 py-2.5 leading-6 text-white outline-none focus:border-amber-200/50"/></label>;
  if (type === 'color') return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><span className="flex h-12 items-center gap-3 rounded-lg border border-white/[0.1] bg-black/20 px-2"><input aria-label={`${label} color picker`} type="color" value={value || '#ffffff'} onKeyDown={keepEditorKeysLocal} onChange={(event) => onChange(event.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"/><input aria-label={`${label} hex value`} type="text" value={value ?? ''} onKeyDown={keepEditorKeysLocal} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase text-white outline-none"/></span></label>;
  return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><input type={type === 'number' ? 'number' : type === 'email' ? 'email' : 'text'} value={value ?? ''} onKeyDown={keepEditorKeysLocal} onChange={(event) => onChange(type === 'number' ? event.target.valueAsNumber : event.target.value)} className="h-11 rounded-lg border border-white/[0.1] bg-black/20 px-3 text-white outline-none focus:border-amber-200/50"/></label>;
}
