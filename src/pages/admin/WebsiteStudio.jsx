import { ArrowLeft, ChevronDown, ChevronRight, ExternalLink, History, Image, RotateCcw, Save, Search, Send, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import UnsavedChangesGuard from '../../components/admin/UnsavedChangesGuard.jsx';
import { useAdminAccess } from '../../lib/adminAccess.jsx';
import {
  BRANCH_FIELDS, discardWebsiteDraft, fetchWebsiteStudioEntries, fetchWebsiteStudioRevisions,
  publishWebsiteEntry, restoreWebsiteRevision, safeWebsiteValue, saveWebsiteDraft, SERVICE_FIELDS,
  validateWebsiteEntry, WEBSITE_STUDIO_SECTIONS, websiteEntryState, websiteImpact,
} from '../../lib/websiteStudio.js';

const pageRoutes = { 'page.home': '/', 'page.explore': '/explore', 'page.creatives': '/creatives', 'page.projects': '/projects', 'page.services': '/services', 'page.about': '/about', 'page.inquiries': '/contact' };
const advancedFieldPattern = /(url|alt|seo|search|social|facebook|instagram|linkedin|youtube|tiktok|github|order|status|visibility|availability|featured|show|enabled|icon|image)/i;

function labelFromKey(key = '') { return key.replace(/^page\.|^global\.|^branch\.|^service\./, '').replaceAll('.', ' · ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function fieldsFromData(data = {}) { return Object.entries(data).filter(([, value]) => ['string','number','boolean'].includes(typeof value)).map(([key, value]) => [key, labelFromKey(key), typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : key.toLowerCase().includes('url') ? 'url' : String(value).length > 100 ? 'textarea' : 'text']); }
function friendlyError(error) {
  const message = error?.message || 'The action could not be completed.';
  if (/FORBIDDEN|42501/i.test(message)) return 'Your account does not have permission for that Website Studio action.';
  if (/INVALID_CONTENT|unsafe|script/i.test(message)) return 'The content contains an unsupported value or unsafe URL.';
  if (/NO_DRAFT/i.test(message)) return 'Save a draft before publishing.';
  return message;
}
function groupNavigation(items) { return Object.groupBy ? Object.groupBy(items, (item) => item.group) : items.reduce((groups, item) => ({ ...groups, [item.group]: [...(groups[item.group] || []), item] }), {}); }
function fieldIsAdvanced([key, , type]) { return type === 'status' || type === 'number' || advancedFieldPattern.test(key); }

export default function WebsiteStudio() {
  const { role } = useAdminAccess();
  const [params, setParams] = useSearchParams();
  const [entries, setEntries] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({});
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const sectionKey = params.get('section') || 'overview';
  const selected = entries.find((entry) => entry.entry_key === sectionKey) || null;

  async function load() {
    setLoading(true); setError('');
    try {
      const [entryRows, revisionRows] = await Promise.all([fetchWebsiteStudioEntries(), fetchWebsiteStudioRevisions()]);
      setEntries(entryRows); setRevisions(revisionRows);
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
    const fixed = WEBSITE_STUDIO_SECTIONS.map((item) => ({ ...item, name: item.label }));
    const connected = entries.filter((entry) => entry.entry_type === 'branch' || entry.entry_type === 'service').map((entry) => ({ key: entry.entry_key, group: entry.entry_type === 'branch' ? 'Services · Branches' : 'Services · Catalog', name: (entry.draft_data || entry.published_data)?.name || labelFromKey(entry.entry_key) }));
    const query = search.trim().toLowerCase();
    return [...fixed, ...connected].filter((item) => !query || `${item.name} ${item.group}`.toLowerCase().includes(query));
  }, [entries, search]);

  const config = WEBSITE_STUDIO_SECTIONS.find((item) => item.key === sectionKey);
  const fields = selected?.entry_type === 'branch' ? BRANCH_FIELDS : selected?.entry_type === 'service' ? SERVICE_FIELDS : (config?.fields?.length ? config.fields : fieldsFromData(form));
  const state = selected ? websiteEntryState(selected) : '';
  const canRestore = role === 'super_admin' || role === 'owner';

  function selectSection(key) { if (dirty) { setError('Save or discard the current changes before opening another section.'); return; } setNotice(''); setError(''); setParams(key === 'overview' ? {} : { section: key }); }
  function updateField(key, value, type) { try { const safe = type === 'textarea' ? value : safeWebsiteValue(value, type); setForm((current) => ({ ...current, [key]: safe })); setDirty(true); setError(''); setNotice(''); } catch (fieldError) { setError(fieldError.message); } }
  function replaceEntry(row) { setEntries((current) => current.map((item) => item.entry_key === row.entry_key ? row : item)); setForm(structuredClone(row.draft_data || row.published_data || {})); setDirty(false); }
  async function run(action, callback) {
    if (!selected || working) return;
    setWorking(action); setError(''); setNotice('');
    try { const row = await callback(); replaceEntry(row); setNotice(action === 'save' ? 'Draft saved.' : action === 'publish' ? 'Published. Public pages are refreshing now.' : action === 'discard' ? 'Draft changes discarded.' : 'Published version restored.'); setRevisions(await fetchWebsiteStudioRevisions()); }
    catch (actionError) { setError(friendlyError(actionError)); }
    setWorking('');
  }
  async function save() { const validated = validateWebsiteEntry(form, fields); await run('save', () => saveWebsiteDraft(selected.entry_key, validated)); }
  async function publish() { if (dirty) { setError('Save the draft before publishing.'); return; } if (!selected?.draft_data) { setError('There are no unpublished changes to publish.'); return; } await run('publish', () => publishWebsiteEntry(selected.entry_key)); }
  async function restoreRevision(revision) {
    if (!canRestore || working) return;
    setWorking('restore'); setError(''); setNotice('');
    try { await restoreWebsiteRevision(revision.id); await load(); setNotice('Published version restored and public pages are refreshing now.'); }
    catch (restoreError) { setError(friendlyError(restoreError)); }
    setWorking('');
  }

  if (!['super_admin','owner','admin'].includes(role)) return <Navigate to="/admin/dashboard" replace />;
  if (loading) return <AdminLayout><LoadingState label="Loading Website Studio" /></AdminLayout>;

  return <AdminLayout>
    <UnsavedChangesGuard dirty={dirty && !working} />
    <header className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-5">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Website Studio</p><h1 className="mt-2 text-3xl font-semibold text-white">Public website</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Choose a section, update its content, then save and publish when it is ready.</p></div>
      <div className="flex flex-wrap gap-2"><Link to="/admin/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/[0.12] px-4 text-sm font-semibold text-white"><ArrowLeft size={16}/>Back to Admin</Link><Link to="/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-200 px-4 text-sm font-semibold text-zinc-950"><ExternalLink size={16}/>Open live website</Link></div>
    </header>
    {error && <div role="alert" className="mb-4 border border-red-300/25 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">{error}</div>}
    {notice && <div role="status" className="mb-4 border border-emerald-300/25 bg-emerald-300/[0.06] px-4 py-3 text-sm text-emerald-100">{notice}</div>}
    <MobileSectionMenu navigation={navigation} sectionKey={sectionKey} entries={entries} onSelect={selectSection} />
    <div className="grid min-h-[42rem] gap-4 xl:grid-cols-[16rem_minmax(0,1fr)]">
      <StudioNavigation navigation={navigation} sectionKey={sectionKey} entries={entries} search={search} setSearch={setSearch} onSelect={selectSection} />
      <main className="min-w-0 rounded-xl border border-white/[0.08] bg-black/20 p-4 sm:p-6">
        <StudioContent sectionKey={sectionKey} selected={selected} entries={entries} revisions={revisions} form={form} fields={fields} config={config} state={state} dirty={dirty} working={working} selectSection={selectSection} updateField={updateField} save={save} publish={publish} discard={() => run('discard', () => discardWebsiteDraft(selected.entry_key))} canRestore={canRestore} onRestore={restoreRevision} />
      </main>
    </div>
  </AdminLayout>;
}

function SectionButtons({ navigation, sectionKey, entries, onSelect }) { return Object.entries(groupNavigation(navigation)).map(([group, items]) => <div key={group} className="mb-4"><p className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">{group}</p><div className="mt-1 grid gap-0.5">{items.map((item) => <button key={item.key} type="button" onClick={() => onSelect(item.key)} className={`flex min-h-10 items-center justify-between rounded-lg px-2.5 text-left text-sm ${sectionKey === item.key ? 'bg-amber-200/10 text-amber-100' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'}`}><span className="truncate">{item.name}</span>{entries.find((entry) => entry.entry_key === item.key)?.draft_data && <span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-label="Unpublished changes"/>}</button>)}</div></div>); }
function StudioNavigation({ navigation, sectionKey, entries, search, setSearch, onSelect }) { return <aside className="hidden min-h-0 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 xl:block"><label className="relative block"><Search size={15} className="absolute left-3 top-3 text-zinc-500"/><span className="sr-only">Search Website Studio</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a section" className="h-10 w-full rounded-lg border border-white/[0.1] bg-black/20 pl-9 pr-3 text-sm text-white outline-none focus:border-amber-200/50"/></label><nav className="mt-3 max-h-[calc(100vh-16rem)] overflow-y-auto" aria-label="Website Studio sections"><SectionButtons navigation={navigation} sectionKey={sectionKey} entries={entries} onSelect={onSelect}/></nav></aside>; }
function MobileSectionMenu({ navigation, sectionKey, entries, onSelect }) { const active = navigation.find((item) => item.key === sectionKey); return <details className="group mb-4 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3 xl:hidden"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-2 text-sm font-semibold text-white"><span><span className="mr-2 text-zinc-500">Section</span>{active?.name || 'Overview'}</span><ChevronDown size={17} className="transition-transform group-open:rotate-180"/></summary><nav className="mt-3 max-h-[60vh] overflow-y-auto border-t border-white/[0.08] pt-3" aria-label="Website Studio mobile sections"><SectionButtons navigation={navigation} sectionKey={sectionKey} entries={entries} onSelect={onSelect}/></nav></details>; }

function StudioContent(props) {
  const { sectionKey, selected, entries, revisions, form, fields, config, state, dirty, working, selectSection, updateField, save, publish, discard, canRestore, onRestore } = props;
  if (sectionKey === 'overview') return <Overview entries={entries} selectSection={selectSection}/>;
  if (sectionKey === 'media') return <div className="grid min-h-[30rem] place-items-center text-center"><div><Image size={32} className="mx-auto text-amber-200"/><h2 className="mt-4 text-xl font-semibold text-white">Website media</h2><p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">Open the managed media library to upload and choose approved public assets. Private originals stay protected.</p><Link to="/admin/media/icons" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-200 px-4 text-sm font-semibold text-zinc-950">Open media library<ChevronRight size={16}/></Link></div></div>;
  if (sectionKey === 'revisions') return <RevisionList revisions={revisions} canRestore={canRestore} onRestore={onRestore} working={working}/>;
  if (!selected) return <div className="grid min-h-[30rem] place-items-center text-sm text-zinc-500">Choose a Website Studio section.</div>;
  const commonFields = fields.filter((field) => !fieldIsAdvanced(field));
  const advancedFields = fields.filter(fieldIsAdvanced);
  const statusLabel = working ? (working === 'save' ? 'Saving' : working === 'publish' ? 'Publishing' : 'Working') : dirty ? 'Unsaved changes' : state;
  return <div className="mx-auto max-w-4xl">
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[0.08] pb-5"><div><p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{selected.entry_type}</p><h2 className="mt-1 text-2xl font-semibold text-white">{form.name || config?.label || labelFromKey(selected.entry_key)}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Changes here appear in {websiteImpact(selected.entry_key).join(', ')}.</p></div><span className={`text-xs font-semibold ${state === 'Published' && !dirty ? 'text-emerald-200' : 'text-amber-200'}`}>{statusLabel}</span></div>
    {sectionKey === 'global.appearance' && <AppearanceGuide/>}
    <section className="mt-6"><h3 className="text-base font-semibold text-white">Main content</h3><p className="mt-1 text-sm text-zinc-500">These are the details most visitors will notice.</p><div className="mt-5 grid gap-5 sm:grid-cols-2">{commonFields.map(([key,label,type]) => <StudioField key={key} fieldKey={key} label={label} type={type} value={form[key]} onChange={(value) => updateField(key,value,type)}/>)}</div></section>
    {advancedFields.length > 0 && <details className="group mt-8 border-t border-white/[0.08] pt-5"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold text-zinc-200">Advanced settings<ChevronDown size={17} className="transition-transform group-open:rotate-180"/></summary><p className="mt-1 text-sm text-zinc-500">Visibility, links, search details, media references, and display order.</p><div className="mt-5 grid gap-5 sm:grid-cols-2">{advancedFields.map(([key,label,type]) => <StudioField key={key} fieldKey={key} label={label} type={type} value={form[key]} onChange={(value) => updateField(key,value,type)}/>)}</div></details>}
    <div className="sticky bottom-3 mt-10 flex flex-wrap gap-2 rounded-xl border border-white/[0.1] bg-zinc-950/95 p-3 shadow-2xl backdrop-blur-xl"><button type="button" onClick={save} disabled={!dirty || Boolean(working)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-200 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-40"><Save size={15}/>{working === 'save' ? 'Saving' : 'Save draft'}</button><button type="button" onClick={publish} disabled={dirty || !selected.draft_data || Boolean(working)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-300/35 px-4 text-sm font-semibold text-emerald-100 disabled:opacity-40"><Send size={15}/>{working === 'publish' ? 'Publishing' : 'Publish'}</button><button type="button" onClick={discard} disabled={!selected.draft_data || Boolean(working)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.1] px-4 text-sm text-zinc-300 disabled:opacity-40"><Undo2 size={15}/>Discard</button>{pageRoutes[selected.entry_key] && <Link to={pageRoutes[selected.entry_key]} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.1] px-4 text-sm text-zinc-200"><ExternalLink size={15}/>Open this page</Link>}</div>
  </div>;
}

function Overview({ entries, selectSection }) { return <div><p className="text-xs uppercase tracking-[0.18em] text-amber-200">Overview</p><h2 className="mt-2 text-2xl font-semibold text-white">One connected source for the public website</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Shared brand, branch, and service records update every supported public reference. Page wording stays with its page.</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{WEBSITE_STUDIO_SECTIONS.filter((item) => item.key.includes('.')).map((item) => { const row = entries.find((entry) => entry.entry_key === item.key); return <button key={item.key} type="button" onClick={() => selectSection(item.key)} className="flex min-h-24 items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-left"><span><span className="font-medium text-white">{item.label}</span><span className="mt-1 block text-xs text-zinc-500">{row?.draft_data ? 'Unpublished changes' : 'Published'}</span></span><ChevronRight size={17} className="text-zinc-600"/></button>; })}</div></div>; }
function AppearanceGuide() { return <div className="mt-6 rounded-xl border border-amber-200/15 bg-amber-200/[0.035] p-4"><h3 className="text-sm font-semibold text-white">Global theme colors</h3><p className="mt-1 text-sm leading-6 text-zinc-400">These brand colors support both light and dark mode across public pages, including Explore Aklan, buttons, links, body text, and dividers. Publish carefully because this changes the whole website.</p></div>; }
function StudioField({ fieldKey, label, type, value, onChange }) {
  if (type === 'boolean') return <label className="flex min-h-11 items-center justify-between gap-3 border-b border-white/[0.08] py-2 text-sm text-zinc-300"><span>{label}</span><input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-amber-300"/></label>;
  if (type === 'status') return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><select value={value || 'active'} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-lg border border-white/[0.1] bg-zinc-950 px-3 text-white"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>;
  if (type === 'textarea') return <label className="grid gap-1.5 text-sm text-zinc-400 sm:col-span-2"><span>{label}</span><textarea rows="4" value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="rounded-lg border border-white/[0.1] bg-black/20 px-3 py-2.5 leading-6 text-white outline-none focus:border-amber-200/50"/></label>;
  if (type === 'color') return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><span className="flex h-12 items-center gap-3 rounded-lg border border-white/[0.1] bg-black/20 px-2"><input aria-label={`${label} color picker`} type="color" value={value || '#ffffff'} onChange={(event) => onChange(event.target.value)} className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"/><input aria-label={`${label} hex value`} type="text" value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="min-w-0 flex-1 bg-transparent font-mono text-sm uppercase text-white outline-none"/></span></label>;
  return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><input type={type === 'number' ? 'number' : type === 'email' ? 'email' : 'text'} value={value ?? ''} onChange={(event) => onChange(type === 'number' ? event.target.valueAsNumber : event.target.value)} className="h-11 rounded-lg border border-white/[0.1] bg-black/20 px-3 text-white outline-none focus:border-amber-200/50"/></label>;
}
function RevisionList({ revisions, canRestore, onRestore, working }) { return <div><div className="flex items-center gap-3"><History size={20} className="text-amber-200"/><div><h2 className="text-xl font-semibold text-white">Published history</h2><p className="text-sm text-zinc-500">Restore an earlier published version without changing Editorial stories.</p></div></div><div className="mt-6 divide-y divide-white/[0.08]">{revisions.slice(0,50).map((revision) => <div key={revision.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto]"><div><p className="text-sm font-medium text-white">{labelFromKey(revision.entry_key)} · {revision.action.replace('_',' ')}</p><p className="mt-1 text-xs text-zinc-500">{new Date(revision.created_at).toLocaleString()} · {(revision.changed_fields || []).join(', ') || 'No field differences'}</p><p className="mt-1 text-xs text-zinc-600">{(revision.affected_areas || []).join(' · ')}</p></div>{canRestore && revision.after_data && <button type="button" disabled={Boolean(working)} onClick={() => onRestore(revision)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-xs text-zinc-300 disabled:opacity-40"><RotateCcw size={14}/>Restore</button>}</div>)}</div></div>; }
