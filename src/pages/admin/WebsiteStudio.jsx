import { ChevronRight, ExternalLink, History, Image, Monitor, RotateCcw, Save, Search, Send, Smartphone, Tablet, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import UnsavedChangesGuard from '../../components/admin/UnsavedChangesGuard.jsx';
import { useAdminAccess } from '../../lib/adminAccess.jsx';
import {
  BRANCH_FIELDS,
  discardWebsiteDraft,
  fetchWebsiteStudioEntries,
  fetchWebsiteStudioRevisions,
  publishWebsiteEntry,
  restoreWebsiteRevision,
  safeWebsiteValue,
  saveWebsiteDraft,
  SERVICE_FIELDS,
  validateWebsiteEntry,
  WEBSITE_STUDIO_SECTIONS,
  websiteEntryState,
  websiteImpact,
} from '../../lib/websiteStudio.js';

const pageRoutes = { 'page.home': '/', 'page.explore': '/explore', 'page.creatives': '/creatives', 'page.projects': '/projects', 'page.services': '/services', 'page.about': '/about', 'page.inquiries': '/contact' };
const deviceWidths = { desktop: '100%', tablet: '768px', mobile: '390px' };

function labelFromKey(key = '') { return key.replace(/^page\.|^global\.|^branch\.|^service\./, '').replaceAll('.', ' · ').replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function fieldsFromData(data = {}) { return Object.entries(data).filter(([, value]) => ['string','number','boolean'].includes(typeof value)).map(([key, value]) => [key, labelFromKey(key), typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : key.toLowerCase().includes('url') ? 'url' : String(value).length > 100 ? 'textarea' : 'text']); }
function friendlyError(error) {
  const message = error?.message || 'The action could not be completed.';
  if (/FORBIDDEN|42501/i.test(message)) return 'Your account does not have permission for that Website Studio action.';
  if (/INVALID_CONTENT|unsafe|script/i.test(message)) return 'The content contains an unsupported value or unsafe URL.';
  if (/NO_DRAFT/i.test(message)) return 'Save a draft before publishing.';
  return message;
}

export default function WebsiteStudio() {
  const { role } = useAdminAccess();
  const [params, setParams] = useSearchParams();
  const [entries, setEntries] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [device, setDevice] = useState('desktop');
  const [previewMode, setPreviewMode] = useState('draft');
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
    setDirty(false); setNotice(''); setError('');
  }, [selected?.entry_key, selected?.updated_at]);

  const navigation = useMemo(() => {
    const fixed = WEBSITE_STUDIO_SECTIONS.map((item) => ({ ...item, name: item.label }));
    const shared = entries.filter((entry) => entry.entry_type === 'branch' || entry.entry_type === 'service').map((entry) => ({ key: entry.entry_key, group: entry.entry_type === 'branch' ? 'Services · Branches' : 'Services · Catalog', name: (entry.draft_data || entry.published_data)?.name || labelFromKey(entry.entry_key) }));
    const query = search.trim().toLowerCase();
    return [...fixed, ...shared].filter((item) => !query || `${item.name} ${item.group}`.toLowerCase().includes(query));
  }, [entries, search]);

  const config = WEBSITE_STUDIO_SECTIONS.find((item) => item.key === sectionKey);
  const fields = selected?.entry_type === 'branch' ? BRANCH_FIELDS : selected?.entry_type === 'service' ? SERVICE_FIELDS : (config?.fields?.length ? config.fields : fieldsFromData(form));
  const state = selected ? websiteEntryState(selected) : '';
  const canRestore = role === 'super_admin' || role === 'owner';

  function selectSection(key) { if (dirty) { setError('Save or discard the current changes before opening another section.'); return; } setParams(key === 'overview' ? {} : { section: key }); }
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
  async function publish() {
    if (dirty) { setError('Save the draft before publishing.'); return; }
    if (!selected?.draft_data) { setError('There are no unpublished changes to publish.'); return; }
    await run('publish', () => publishWebsiteEntry(selected.entry_key));
  }
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
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-5"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">Website Studio</p><h1 className="mt-2 text-3xl font-semibold text-white">Public website</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Edit shared website content, permanent pages, services, appearance, media, and published versions from one connected workspace.</p></div><Link to="/" target="_blank" className="inline-flex min-h-11 items-center gap-2 border border-white/[0.12] px-4 text-sm text-zinc-200"><ExternalLink size={16}/>View live website</Link></div>
    {error && <div role="alert" className="mb-4 border border-red-300/25 bg-red-300/[0.06] px-4 py-3 text-sm text-red-100">{error}</div>}
    {notice && <div role="status" className="mb-4 border border-emerald-300/25 bg-emerald-300/[0.06] px-4 py-3 text-sm text-emerald-100">{notice}</div>}
    <div className="grid min-h-[44rem] gap-4 xl:grid-cols-[17rem_minmax(0,1fr)_21rem]">
      <aside className="min-h-0 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><label className="relative block"><Search size={15} className="absolute left-3 top-3 text-zinc-500"/><span className="sr-only">Search Website Studio</span><input value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Search website settings" className="h-10 w-full rounded-lg border border-white/[0.1] bg-black/20 pl-9 pr-3 text-sm text-white outline-none focus:border-amber-200/50"/></label><nav className="mt-3 max-h-[calc(100vh-16rem)] overflow-y-auto" aria-label="Website Studio sections">{Object.entries(Object.groupBy ? Object.groupBy(navigation,(item)=>item.group) : navigation.reduce((groups,item)=>({...groups,[item.group]:[...(groups[item.group]||[]),item]}),{})).map(([group,items])=><div key={group} className="mb-4"><p className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">{group}</p><div className="mt-1 grid gap-0.5">{items.map((item)=><button key={item.key} type="button" onClick={()=>selectSection(item.key)} className={`flex min-h-10 items-center justify-between rounded-lg px-2.5 text-left text-sm ${sectionKey===item.key?'bg-amber-200/10 text-amber-100':'text-zinc-400 hover:bg-white/[0.04] hover:text-white'}`}><span className="truncate">{item.name}</span>{entries.find((entry)=>entry.entry_key===item.key)?.draft_data&&<span className="h-1.5 w-1.5 rounded-full bg-amber-300" aria-label="Unpublished changes"/>}</button>)}</div></div>)}</nav></aside>
      <main className="min-w-0 rounded-xl border border-white/[0.08] bg-black/20 p-4"><StudioCenter sectionKey={sectionKey} selected={selected} entries={entries} revisions={revisions} form={form} previewMode={previewMode} setPreviewMode={setPreviewMode} device={device} setDevice={setDevice} selectSection={selectSection} canRestore={canRestore} onRestore={restoreRevision} working={working} /></main>
      <aside className="min-w-0 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">{selected ? <><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{selected.entry_type}</p><h2 className="mt-1 text-lg font-semibold text-white">{(form.name || config?.label || labelFromKey(selected.entry_key))}</h2></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${state==='Published'?'bg-emerald-300/10 text-emerald-200':'bg-amber-300/10 text-amber-100'}`}>{working ? working === 'save' ? 'Saving' : 'Publishing' : dirty ? 'Unsaved' : state}</span></div><p className="mt-4 text-xs leading-5 text-zinc-500">This update affects: {websiteImpact(selected.entry_key).join(', ')}.</p><div className="mt-5 max-h-[calc(100vh-25rem)] space-y-4 overflow-y-auto pr-1">{fields.map(([key,label,type])=><StudioField key={key} fieldKey={key} label={label} type={type} value={form[key]} onChange={(value)=>updateField(key,value,type)} />)}</div><div className="mt-5 grid grid-cols-2 gap-2 border-t border-white/[0.08] pt-4"><button type="button" onClick={save} disabled={!dirty||Boolean(working)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-200 px-3 text-sm font-semibold text-zinc-950 disabled:opacity-40"><Save size={15}/>{working==='save'?'Saving':'Save draft'}</button><button type="button" onClick={publish} disabled={dirty||!selected.draft_data||Boolean(working)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-emerald-300/35 px-3 text-sm font-semibold text-emerald-100 disabled:opacity-40"><Send size={15}/>{working==='publish'?'Publishing':'Publish'}</button><button type="button" onClick={()=>run('discard',()=>discardWebsiteDraft(selected.entry_key))} disabled={!selected.draft_data||Boolean(working)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.1] px-3 text-sm text-zinc-300 disabled:opacity-40"><Undo2 size={15}/>Discard</button>{pageRoutes[selected.entry_key]&&<Link to={pageRoutes[selected.entry_key]} target="_blank" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/[0.1] px-3 text-sm text-zinc-300"><ExternalLink size={15}/>Live page</Link>}</div></> : <StudioSideHelp sectionKey={sectionKey}/>}</aside>
    </div>
  </AdminLayout>;
}

function StudioCenter({ sectionKey, selected, entries, revisions, form, previewMode, setPreviewMode, device, setDevice, selectSection, canRestore, onRestore, working }) {
  if (sectionKey === 'overview') return <div><p className="text-xs uppercase tracking-[0.18em] text-amber-200">Overview</p><h2 className="mt-2 text-2xl font-semibold text-white">One connected source for the public website</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Shared brand, branch, and Service records update every supported public reference. Page-specific wording stays with its page.</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{WEBSITE_STUDIO_SECTIONS.filter((item)=>item.key.includes('.')).map((item)=>{const row=entries.find((entry)=>entry.entry_key===item.key);return <button key={item.key} type="button" onClick={()=>selectSection(item.key)} className="flex min-h-24 items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 text-left"><span><span className="font-medium text-white">{item.label}</span><span className="mt-1 block text-xs text-zinc-500">{row?.draft_data?'Unpublished changes':'Published'}</span></span><ChevronRight size={17} className="text-zinc-600"/></button>})}</div></div>;
  if (sectionKey === 'media') return <div className="grid min-h-[36rem] place-items-center text-center"><div><Image size={32} className="mx-auto text-amber-200"/><h2 className="mt-4 text-xl font-semibold text-white">Website media</h2><p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">Use the existing managed-media library. Website Studio stores references to approved public assets without exposing private originals.</p><Link to="/admin/media/icons" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-200 px-4 text-sm font-semibold text-zinc-950">Open media library<ChevronRight size={16}/></Link></div></div>;
  if (sectionKey === 'revisions') return <RevisionList revisions={revisions} canRestore={canRestore} onRestore={onRestore} working={working} />;
  if (!selected) return <div className="grid min-h-[36rem] place-items-center text-sm text-zinc-500">Choose a Website Studio section.</div>;
  const previewData = previewMode === 'published' ? selected.published_data : form;
  return <><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3"><div className="flex gap-1 rounded-lg bg-black/30 p-1"><button onClick={()=>setPreviewMode('draft')} className={`rounded-md px-3 py-2 text-xs ${previewMode==='draft'?'bg-white/[0.1] text-white':'text-zinc-500'}`}>Draft preview</button><button onClick={()=>setPreviewMode('published')} className={`rounded-md px-3 py-2 text-xs ${previewMode==='published'?'bg-white/[0.1] text-white':'text-zinc-500'}`}>Published</button></div><div className="flex gap-1">{[['desktop',Monitor],['tablet',Tablet],['mobile',Smartphone]].map(([key,Icon])=><button key={key} type="button" onClick={()=>setDevice(key)} aria-label={`${key} preview`} className={`grid h-10 w-10 place-items-center rounded-lg ${device===key?'bg-amber-200/10 text-amber-100':'text-zinc-500'}`}><Icon size={17}/></button>)}</div></div><div className="overflow-x-auto py-5"><div className="mx-auto min-h-[35rem] overflow-hidden rounded-xl border border-white/[0.1] bg-[#0b0b0d] transition-[width]" style={{width:deviceWidths[device],maxWidth:'100%'}}><StudioPreview data={previewData} selected={selected}/></div></div></>;
}

function StudioPreview({ data, selected }) { const title=data.name||data.brandName||data.title||data.directoryTitle||data.heading||labelFromKey(selected.entry_key); const eyebrow=data.eyebrow||data.directoryEyebrow||selected.entry_type; const description=data.shortDescription||data.description||data.intro||data.directoryDescription||data.footerText||data.tagline||data.seoDescription||'Select a field on the right to edit this published website content.'; return <div className="min-h-[35rem] bg-[radial-gradient(circle_at_80%_15%,rgba(251,146,60,.18),transparent_35%),#0b0b0d] p-6 sm:p-10"><div className="flex items-center justify-between border-b border-white/[0.08] pb-4"><span className="font-semibold text-white">Lahat Liwa Collectives</span><span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Website by Liwa Digital</span></div><section className="py-16"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">{eyebrow}</p><h2 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight text-white">{title}</h2><p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300">{description}</p><div className="mt-8 h-11 w-32 rounded-lg bg-amber-200" aria-hidden="true"/></section></div>; }

function StudioField({ fieldKey, label, type, value, onChange }) {
  if (type === 'boolean') return <label className="flex min-h-11 items-center justify-between gap-3 border-b border-white/[0.08] py-2 text-sm text-zinc-300"><span>{label}</span><input type="checkbox" checked={value===true} onChange={(event)=>onChange(event.target.checked)} className="h-4 w-4 accent-amber-300"/></label>;
  if (type === 'status') return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><select value={value||'active'} onChange={(event)=>onChange(event.target.value)} className="h-11 rounded-lg border border-white/[0.1] bg-zinc-950 px-3 text-white"><option value="active">Active</option><option value="inactive">Inactive</option></select></label>;
  if (type === 'textarea') return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><textarea rows="4" value={value??''} onChange={(event)=>onChange(event.target.value)} className="rounded-lg border border-white/[0.1] bg-black/20 px-3 py-2.5 leading-6 text-white outline-none focus:border-amber-200/50"/></label>;
  return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><input type={type==='color'?'color':type==='number'?'number':type==='email'?'email':'text'} value={value??''} onChange={(event)=>onChange(type==='number'?event.target.valueAsNumber:event.target.value)} className={`${type==='color'?'h-12 p-1':'h-11 px-3'} rounded-lg border border-white/[0.1] bg-black/20 text-white outline-none focus:border-amber-200/50`}/></label>;
}

function RevisionList({ revisions, canRestore, onRestore, working }) { return <div><div className="flex items-center gap-3"><History size={20} className="text-amber-200"/><div><h2 className="text-xl font-semibold text-white">Published history</h2><p className="text-sm text-zinc-500">Website Studio history is separate from Editorial stories.</p></div></div><div className="mt-6 divide-y divide-white/[0.08]">{revisions.slice(0,50).map((revision)=><div key={revision.id} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto]"><div><p className="text-sm font-medium text-white">{labelFromKey(revision.entry_key)} · {revision.action.replace('_',' ')}</p><p className="mt-1 text-xs text-zinc-500">{new Date(revision.created_at).toLocaleString()} · {(revision.changed_fields||[]).join(', ')||'No field differences'}</p><p className="mt-1 text-xs text-zinc-600">{(revision.affected_areas||[]).join(' · ')}</p></div>{canRestore&&revision.after_data&&<button type="button" disabled={Boolean(working)} onClick={()=>onRestore(revision)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/[0.1] px-3 text-xs text-zinc-300 disabled:opacity-40"><RotateCcw size={14}/>Restore</button>}</div>)}</div></div>; }
function StudioSideHelp({ sectionKey }) { return <div className="grid min-h-56 place-items-center text-center"><div><RotateCcw size={24} className="mx-auto text-zinc-600"/><p className="mt-3 text-sm text-zinc-400">{sectionKey==='revisions'?'Select a content section before restoring a version.':'Choose an editable section from the left.'}</p></div></div>; }
