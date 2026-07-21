import { BookOpen, Check, ExternalLink, FileText, Flag, LayoutTemplate, Plus, Save, Settings, Tags, Trash2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout.jsx';
import { AdminButton, AdminCheckbox, AdminEmptyState, AdminInput, AdminNotice, AdminPageHeader, AdminStatusBadge, AdminSurface } from '../../components/admin/AdminUI.jsx';
import LoadingState from '../../components/LoadingState.jsx';
import { CONTENT_TYPES, listEditorialWorkspace, slugifyEditorial } from '../../features/editorial/editorialApi.js';
import { DISABLED_EDITORIAL_FLAGS, normalizeEditorialFlags } from '../../features/editorial/editorialFlags.js';
import { useAdminAccess } from '../../lib/adminAccess.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { editorialPublicPath, TOURISM_SLIDE_SLOTS } from '../../lib/tourismHomepage.js';

const sections = [
  ['Overview', '/admin/editorial', BookOpen], ['Stories', '/admin/editorial/content', FileText], ['Destinations', '/admin/editorial/destinations', LayoutTemplate], ['Review', '/admin/editorial/review', Check],
  ['Homepage slideshow', '/admin/editorial/homepage', LayoutTemplate], ['Categories', '/admin/editorial/categories', Tags], ['Tags', '/admin/editorial/tags', Tags],
  ['Municipalities', '/admin/editorial/municipalities', Tags], ['Contributors', '/admin/editorial/contributors', Users],
  ['Feature flags', '/admin/editorial/settings', Settings], ['Audit history', '/admin/editorial/audit', Flag],
];

export default function AdminEditorial() {
  const location = useLocation();
  const key = location.pathname.replace('/admin/editorial', '').replace(/^\//, '') || 'overview';
  return <AdminLayout><AdminPageHeader eyebrow="Explore Aklan" title="Stories and destinations" description="Create and publish stories, organize destinations, and choose the homepage slideshow." action={<><AdminButton to="/editorial" variant="ghost">Open Studio <ExternalLink size={15} /></AdminButton><AdminButton to="/editorial/new" variant="primary"><Plus size={15} />Create story</AdminButton></>} /><nav className="mb-6 flex gap-1 overflow-x-auto pb-2" aria-label="Explore Aklan administration">{sections.map(([label, href, Icon]) => <Link key={href} to={href} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${location.pathname === href ? 'border-amber-200/25 bg-amber-200/[0.1] text-amber-100' : 'border-white/[0.08] text-zinc-400 hover:text-white'}`}><Icon size={14} />{label}</Link>)}</nav><AdminEditorialSection section={key} /></AdminLayout>;
}

function AdminEditorialSection({ section }) {
  if (section === 'settings') return <EditorialSettings />;
  if (section === 'audit') return <EditorialAudit />;
  if (['categories', 'tags', 'municipalities', 'contributors'].includes(section)) return <TaxonomyManager section={section} />;
  if (section === 'homepage') return <HomepageManager />;
  return <EditorialContent section={section} />;
}

function EditorialContent({ section }) {
  const { user, role } = useAdminAccess(); const [state, setState] = useState({ loading: true, posts: [], error: '' });
  useEffect(() => { let active = true; listEditorialWorkspace({ userId: user.id, role, scope: section === 'review' ? 'review' : 'all', type: section === 'destinations' ? 'place' : '' }).then((posts) => { if (active) setState({ loading: false, posts, error: '' }); }).catch(() => { if (active) setState({ loading: false, posts: [], error: 'Stories could not be loaded right now.' }); }); return () => { active = false; }; }, [role, section, user.id]);
  if (state.loading) return <LoadingState label="Loading editorial content" />;
  if (state.error) return <AdminNotice>{state.error}</AdminNotice>;
  if (!state.posts.length) return <AdminEmptyState title="No stories yet" message="Create a draft, add its source, preview it, and publish when it is ready." action={<AdminButton to="/editorial/new" variant="primary">Create story</AdminButton>} />;
  return <div className="grid gap-3">{state.posts.map((post) => <AdminSurface key={post.id} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs uppercase tracking-[0.16em] text-amber-200/70">{CONTENT_TYPES.find((item) => item.key === post.content_type)?.label}</span><AdminStatusBadge status={post.status} /></div><h2 className="mt-2 font-semibold">{post.title}</h2><p className="mt-1 line-clamp-2 text-sm text-zinc-400">{post.summary || 'No summary yet.'}</p></div><AdminButton to={`/editorial/content/${post.id}/edit`} variant="secondary">Edit</AdminButton></AdminSurface>)}</div>;
}

function EditorialSettings() {
  const [state, setState] = useState({ loading: true, flags: DISABLED_EDITORIAL_FLAGS, error: '', message: '' });
  useEffect(() => { let active = true; supabase.from('editorial_feature_flags').select('*').eq('singleton', true).maybeSingle().then(({ data, error }) => { if (!active) return; if (error || !data) setState({ loading: false, flags: DISABLED_EDITORIAL_FLAGS, error: 'Feature flags are unavailable right now.', message: '' }); else setState({ loading: false, flags: normalizeEditorialFlags(data), error: '', message: '' }); }); return () => { active = false; }; }, []);
  async function save() { const flags = state.flags; const { error } = await supabase.from('editorial_feature_flags').update({ module_enabled: flags.moduleEnabled, public_portal_enabled: flags.publicPortalEnabled, homepage_tourism_enabled: flags.homepageTourismEnabled, editorial_studio_enabled: flags.editorialStudioEnabled, public_inquiries_enabled: flags.publicInquiriesEnabled, editorial_media_uploads_enabled: flags.editorialMediaUploadsEnabled, updated_at: new Date().toISOString() }).eq('singleton', true); setState((current) => ({ ...current, error: error ? 'Feature flags could not be saved.' : '', message: error ? '' : 'Feature flags saved.' })); }
  function setFlag(key, value) { setState((current) => ({ ...current, flags: { ...current.flags, [key]: value, ...(key === 'moduleEnabled' && !value ? DISABLED_EDITORIAL_FLAGS : {}) } })); }
  if (state.loading) return <LoadingState label="Loading release flags" />;
  return <AdminSurface><h2 className="text-lg font-semibold">Feature flags</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">Turn public features on only after their content, uploads, and account access have been checked.</p><div className="mt-6 grid gap-3 sm:grid-cols-2"><AdminCheckbox label="Explore Aklan" checked={state.flags.moduleEnabled} onChange={(value) => setFlag('moduleEnabled', value)} /><AdminCheckbox label="Public portal" checked={state.flags.publicPortalEnabled} onChange={(value) => setFlag('publicPortalEnabled', value)} /><AdminCheckbox label="Tourism on homepage" checked={state.flags.homepageTourismEnabled} onChange={(value) => setFlag('homepageTourismEnabled', value)} /><AdminCheckbox label="Editorial Studio" checked={state.flags.editorialStudioEnabled} onChange={(value) => setFlag('editorialStudioEnabled', value)} /><AdminCheckbox label="Public inquiries" checked={state.flags.publicInquiriesEnabled} onChange={(value) => setFlag('publicInquiriesEnabled', value)} /><AdminCheckbox label="Media uploads" checked={state.flags.editorialMediaUploadsEnabled} onChange={(value) => setFlag('editorialMediaUploadsEnabled', value)} /></div><div className="mt-5 flex items-center gap-4"><AdminButton onClick={save} variant="primary">Save feature flags</AdminButton>{state.error && <AdminNotice className="flex-1">{state.error}</AdminNotice>}{state.message && <AdminNotice tone="success" className="flex-1">{state.message}</AdminNotice>}</div></AdminSurface>;
}

const TABLES = { categories: 'editorial_categories', tags: 'editorial_tags', municipalities: 'editorial_municipalities', contributors: 'editorial_contributors' };
function TaxonomyManager({ section }) {
  const table = TABLES[section]; const [state, setState] = useState({ loading: true, rows: [], error: '', name: '' });
  async function load() { const { data, error } = await supabase.from(table).select('*').order(section === 'contributors' ? 'display_name' : 'name'); setState((current) => ({ ...current, loading: false, rows: data || [], error: error ? `Could not load ${section}.` : '' })); }
  useEffect(() => { load(); }, [table]);
  async function add(event) { event.preventDefault(); const name = state.name.trim(); if (!name) return; const payload = section === 'contributors' ? { display_name: name, slug: slugifyEditorial(name) } : { name, slug: slugifyEditorial(name) }; const { error } = await supabase.from(table).insert(payload); if (error) setState((current) => ({ ...current, error: `Could not add ${section.slice(0, -1)}.` })); else { setState((current) => ({ ...current, name: '' })); load(); } }
  if (state.loading) return <LoadingState label={`Loading ${section}`} />;
  const singular = section === 'categories' ? 'category' : section.slice(0, -1);
  return <div className="grid gap-5 lg:grid-cols-[20rem_1fr]"><AdminSurface><h2 className="font-semibold capitalize">Add {singular}</h2><form onSubmit={add} className="mt-4 grid gap-4"><AdminInput label="Name" value={state.name} onChange={(name) => setState((current) => ({ ...current, name }))} required /><AdminButton type="submit" variant="primary">Add {singular}</AdminButton></form>{state.error && <AdminNotice className="mt-4">{state.error}</AdminNotice>}</AdminSurface><AdminSurface><h2 className="font-semibold capitalize">{section}</h2><div className="mt-4 divide-y divide-white/[0.08]">{state.rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{row.name || row.display_name}</p><p className="mt-1 text-xs text-zinc-500">{row.slug}</p></div>{Object.hasOwn(row, 'is_active') && <AdminStatusBadge status={row.is_active ? 'active' : 'disabled'} />}</div>)}{!state.rows.length && <p className="py-8 text-sm text-zinc-500">Nothing has been added yet.</p>}</div></AdminSurface></div>;
}

function HomepageManager() {
  const { role } = useAdminAccess();
  const [state, setState] = useState({ loading: true, slides: [], posts: [], saving: '', error: '', message: '' });

  async function load() {
    const [slidesResult, postsResult] = await Promise.all([
      supabase.from('editorial_homepage_slides').select('*').order('sort_order'),
      supabase.from('editorial_posts').select('id,content_type,title,slug,summary,cover_image_url,status,published_at,published_revision_id,archived_at').eq('status', 'published').not('published_revision_id', 'is', null).not('published_at', 'is', null).is('archived_at', null).order('published_at', { ascending: false }).limit(150),
    ]);
    setState((current) => ({ ...current, loading: false, slides: slidesResult.data || [], posts: postsResult.data || [], error: slidesResult.error || postsResult.error ? 'The slideshow manager could not be loaded.' : '' }));
  }

  useEffect(() => { load(); }, []);

  function changeSlot(type, patch) {
    setState((current) => ({ ...current, slides: current.slides.map((slide) => slide.slot_type === type ? { ...slide, ...patch } : slide), error: '', message: '' }));
  }

  async function saveSlot(slot) {
    setState((current) => ({ ...current, saving: slot.slot_type, error: '', message: '' }));
    const { error } = await supabase.from('editorial_homepage_slides').update({ post_id: slot.post_id || null, enabled: Boolean(slot.enabled && slot.post_id), sort_order: Number(slot.sort_order), eyebrow: slot.eyebrow || '', description: slot.description || '', focal_x: Number(slot.focal_x ?? 50), focal_y: Number(slot.focal_y ?? 50) }).eq('slot_type', slot.slot_type);
    setState((current) => ({ ...current, saving: '', error: error ? (error.message || 'The slide could not be saved.') : '', message: error ? '' : `${TOURISM_SLIDE_SLOTS.find((item) => item.key === slot.slot_type)?.label} slide saved.` }));
    if (!error) await load();
  }

  async function clearSlot(slot) {
    const cleared = { ...slot, post_id: null, enabled: false, eyebrow: '', description: '', focal_x: 50, focal_y: 50 };
    changeSlot(slot.slot_type, cleared);
    await saveSlot(cleared);
  }

  if (role !== 'super_admin') return <AdminNotice>Homepage slideshow changes are limited to Super Admin. You can continue managing stories from Stories.</AdminNotice>;
  if (state.loading) return <LoadingState label="Loading homepage slideshow" />;
  if (!state.slides.length) return <AdminNotice>The slideshow table is not available yet. Apply the Explore Aklan homepage migration first.</AdminNotice>;

  return <div className="grid gap-5">
    <AdminSurface><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200/70">Homepage Slideshow</p><h2 className="mt-2 text-xl font-semibold">Five story slots</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Choose one published story for each type. Stories without a cover use the built-in Explore Aklan background until a real image is added.</p>{state.error && <AdminNotice className="mt-4">{state.error}</AdminNotice>}{state.message && <AdminNotice tone="success" className="mt-4">{state.message}</AdminNotice>}</AdminSurface>
    {TOURISM_SLIDE_SLOTS.map((meta) => {
      const slot = state.slides.find((item) => item.slot_type === meta.key) || { slot_type: meta.key, sort_order: TOURISM_SLIDE_SLOTS.indexOf(meta), enabled: false, post_id: '', eyebrow: '', description: '', focal_x: 50, focal_y: 50 };
      const choices = state.posts.filter((post) => post.content_type === meta.key);
      const selected = choices.find((post) => post.id === slot.post_id) || null;
      return <AdminSurface key={meta.key} className="grid gap-5 lg:grid-cols-[minmax(0,16rem)_1fr]">
        <div>{selected?.cover_image_url ? <img src={selected.cover_image_url} alt="" loading="lazy" className="aspect-[16/10] w-full rounded-lg object-cover" style={{ objectPosition: `${slot.focal_x}% ${slot.focal_y}%` }} /> : <div className="grid aspect-[16/10] place-items-center rounded-lg border border-white/[0.1] bg-[radial-gradient(circle_at_75%_20%,rgba(251,146,60,0.2),transparent_35%),linear-gradient(145deg,#2b2017,#0b0b0d_68%)] px-4 text-center text-sm text-zinc-400">{selected ? 'Built-in Explore Aklan background' : 'No story selected'}</div>}<p className="mt-3 text-sm font-semibold text-white">{meta.label}</p><p className="mt-1 text-xs text-zinc-500">Position {Number(slot.sort_order) + 1}</p></div>
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm text-zinc-300"><span>Published story</span><select value={slot.post_id || ''} onChange={(event) => changeSlot(meta.key, { post_id: event.target.value, enabled: event.target.value ? slot.enabled : false })} className="h-11 w-full rounded-md border border-white/[0.12] bg-zinc-950 px-3 text-sm focus:border-amber-200/40 focus:outline-none focus:ring-2 focus:ring-amber-200/30"><option value="">None</option>{choices.map((post) => <option key={post.id} value={post.id}>{post.title}</option>)}</select></label>
          <div className="grid gap-4 sm:grid-cols-2"><AdminCheckbox label="Enabled" checked={Boolean(slot.enabled)} onChange={(enabled) => changeSlot(meta.key, { enabled })} disabled={!slot.post_id} /><label className="grid gap-2 text-sm text-zinc-300"><span>Display order</span><select value={slot.sort_order} onChange={(event) => changeSlot(meta.key, { sort_order: Number(event.target.value) })} className="h-11 rounded-md border border-white/[0.12] bg-zinc-950 px-3">{TOURISM_SLIDE_SLOTS.map((_, index) => <option key={index} value={index}>{index + 1}</option>)}</select></label></div>
          <AdminInput label="Eyebrow (optional)" value={slot.eyebrow || ''} onChange={(eyebrow) => changeSlot(meta.key, { eyebrow })} />
          <label className="grid gap-2 text-sm text-zinc-300"><span>Short description (optional)</span><textarea value={slot.description || ''} maxLength={240} rows={3} onChange={(event) => changeSlot(meta.key, { description: event.target.value })} className="rounded-md border border-white/[0.12] bg-zinc-950 px-3 py-2 focus:border-amber-200/40 focus:outline-none focus:ring-2 focus:ring-amber-200/30" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><RangeField label="Horizontal focal point" value={slot.focal_x ?? 50} onChange={(focal_x) => changeSlot(meta.key, { focal_x })} /><RangeField label="Vertical focal point" value={slot.focal_y ?? 50} onChange={(focal_y) => changeSlot(meta.key, { focal_y })} /></div>
          <div className="flex flex-wrap gap-2"><AdminButton onClick={() => saveSlot(slot)} disabled={state.saving === meta.key} variant="primary"><Save size={15} />{state.saving === meta.key ? 'Saving…' : 'Save slide'}</AdminButton>{selected && <AdminButton to={editorialPublicPath(selected)} target="_blank" rel="noreferrer noopener" variant="secondary"><ExternalLink size={15} />Preview</AdminButton>}<AdminButton onClick={() => clearSlot(slot)} disabled={!slot.post_id || state.saving === meta.key} variant="ghost"><Trash2 size={15} />Clear selection</AdminButton></div>
        </div>
      </AdminSurface>;
    })}
  </div>;
}

function RangeField({ label, value, onChange }) {
  return <label className="grid gap-2 text-sm text-zinc-300"><span>{label}: {value}%</span><input type="range" min="0" max="100" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-11 w-full accent-amber-300" /></label>;
}

function LegacyHomepageManager() {
  const { user } = useAdminAccess();
  const [state, setState] = useState({ loading: true, rows: [], posts: [], heading: '', error: '', message: '' });
  async function load() {
    const [sectionsResult, postsResult] = await Promise.all([
      supabase.from('editorial_homepage_sections').select('*,editorial_homepage_items(id,post_id,sort_order,label)').order('sort_order'),
      supabase.from('editorial_posts').select('id,title,status').not('published_revision_id', 'is', null).is('archived_at', null).order('published_at', { ascending: false }).limit(100),
    ]);
    setState((current) => ({ ...current, loading: false, rows: sectionsResult.data || [], posts: postsResult.data || [], error: sectionsResult.error || postsResult.error ? 'Homepage composition could not be loaded.' : '' }));
  }
  useEffect(() => { load(); }, []);
  async function addSection(event) {
    event.preventDefault(); const heading = state.heading.trim(); if (!heading) return;
    const { error } = await supabase.from('editorial_homepage_sections').insert({ section_key: `${slugifyEditorial(heading)}-${Date.now().toString(36)}`, heading, sort_order: state.rows.length, is_visible: false, updated_by: user.id });
    setState((current) => ({ ...current, heading: error ? current.heading : '', error: error ? 'Section could not be added.' : '', message: error ? '' : 'Section added privately.' })); if (!error) await load();
  }
  async function updateSection(id, patch) { const { error } = await supabase.from('editorial_homepage_sections').update({ ...patch, updated_at: new Date().toISOString(), updated_by: user.id }).eq('id', id); setState((current) => ({ ...current, error: error ? 'Section could not be updated.' : '', message: error ? '' : 'Homepage updated.' })); if (!error) await load(); }
  async function addItem(sectionId, postId) { if (!postId) return; const section = state.rows.find((row) => row.id === sectionId); const { error } = await supabase.from('editorial_homepage_items').insert({ section_id: sectionId, post_id: postId, sort_order: section?.editorial_homepage_items?.length || 0 }); setState((current) => ({ ...current, error: error ? 'Story could not be added to that section.' : '', message: error ? '' : 'Story added.' })); if (!error) await load(); }
  async function removeItem(id) { const { error } = await supabase.from('editorial_homepage_items').delete().eq('id', id); setState((current) => ({ ...current, error: error ? 'Story could not be removed.' : '', message: error ? '' : 'Story removed.' })); if (!error) await load(); }
  async function moveItem(items, index, direction) { const target = index + direction; if (target < 0 || target >= items.length) return; const [first, second] = [items[index], items[target]]; const results = await Promise.all([supabase.from('editorial_homepage_items').update({ sort_order: second.sort_order }).eq('id', first.id), supabase.from('editorial_homepage_items').update({ sort_order: first.sort_order }).eq('id', second.id)]); const error = results.find((result) => result.error)?.error; setState((current) => ({ ...current, error: error ? 'Story order could not be changed.' : '', message: error ? '' : 'Order updated.' })); if (!error) await load(); }
  if (state.loading) return <LoadingState label="Loading homepage" />;
  return <div className="grid gap-5"><AdminSurface><h2 className="font-semibold">New section</h2><form onSubmit={addSection} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"><AdminInput label="Heading" value={state.heading} onChange={(heading) => setState((current) => ({ ...current, heading }))} required /><AdminButton type="submit" variant="primary">Add</AdminButton></form>{state.error && <AdminNotice className="mt-4">{state.error}</AdminNotice>}{state.message && <AdminNotice tone="success" className="mt-4">{state.message}</AdminNotice>}</AdminSurface>{state.rows.length ? state.rows.map((row) => { const items = [...(row.editorial_homepage_items || [])].sort((a, b) => a.sort_order - b.sort_order); const postName = new Map(state.posts.map((post) => [post.id, post.title])); return <AdminSurface key={row.id}><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{row.heading || row.section_key}</p><p className="mt-1 text-sm text-zinc-500">{items.length} published items</p></div><div className="flex items-center gap-2"><AdminStatusBadge status={row.is_visible ? 'active' : 'disabled'} /><AdminButton onClick={() => updateSection(row.id, { is_visible: !row.is_visible })} variant="secondary">{row.is_visible ? 'Hide' : 'Show'}</AdminButton></div></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><select defaultValue="" onChange={(event) => { addItem(row.id, event.target.value); event.target.value = ''; }} className="h-10 min-w-0 flex-1 rounded-md border border-white/[0.12] bg-zinc-950 px-3 text-sm"><option value="">Add published story</option>{state.posts.filter((post) => !items.some((item) => item.post_id === post.id)).map((post) => <option key={post.id} value={post.id}>{post.title}</option>)}</select></div><div className="mt-3 divide-y divide-white/[0.08]">{items.map((item, index) => <div key={item.id} className="flex items-center justify-between gap-3 py-2"><p className="min-w-0 truncate text-sm">{postName.get(item.post_id) || 'Published story'}</p><div className="flex gap-1"><button type="button" onClick={() => moveItem(items, index, -1)} disabled={index === 0} className="h-8 w-8 rounded border border-white/[0.1] text-xs disabled:opacity-30" aria-label="Move up">↑</button><button type="button" onClick={() => moveItem(items, index, 1)} disabled={index === items.length - 1} className="h-8 w-8 rounded border border-white/[0.1] text-xs disabled:opacity-30" aria-label="Move down">↓</button><button type="button" onClick={() => removeItem(item.id)} className="h-8 rounded border border-red-300/20 px-2 text-xs text-red-100">Remove</button></div></div>)}</div></AdminSurface>; }) : <AdminEmptyState title="No homepage sections" message="Create sections only after reviewed content is available. No demo tourism claims were added." />}</div>;
}

function EditorialAudit() { const [state, setState] = useState({ loading: true, rows: [], error: '' }); useEffect(() => { supabase.from('editorial_audit_events').select('id,action,from_status,to_status,details,created_at,post_id').order('created_at', { ascending: false }).limit(100).then(({ data, error }) => setState({ loading: false, rows: data || [], error: error ? 'Audit records could not be loaded.' : '' })); }, []); if (state.loading) return <LoadingState label="Loading audit" />; if (state.error) return <AdminNotice>{state.error}</AdminNotice>; return <AdminSurface><h2 className="font-semibold">Workflow audit</h2><div className="mt-4 divide-y divide-white/[0.08]">{state.rows.map((row) => <div key={row.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto]"><div><p className="text-sm font-medium">{row.action.replaceAll('_', ' ')}</p><p className="mt-1 text-xs text-zinc-500">{row.from_status || '—'} → {row.to_status || '—'}</p></div><time className="text-xs text-zinc-500">{new Date(row.created_at).toLocaleString()}</time></div>)}{!state.rows.length && <p className="py-8 text-sm text-zinc-500">No events.</p>}</div></AdminSurface>; }
