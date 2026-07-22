import {
  AlignCenter, AlignLeft, AlignRight, Archive, ArrowDown, ArrowLeft, ArrowUp, BookOpen,
  ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Copy, Eye, FilePenLine, GripVertical,
  Image as ImageIcon, Layers3, LayoutPanelLeft, LayoutPanelTop, LogOut, Menu, Monitor,
  PanelLeftClose, PanelRightClose, Plus, Redo2, RotateCcw, Save, Search,
  Smartphone, Tablet, Trash2, Undo2, X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { StudioEditorialGate } from '../../features/editorial/EditorialGate.jsx';
import EditorialDocumentRenderer from '../../features/editorial/EditorialDocumentRenderer.jsx';
import AppearanceMenuAction from '../../components/AppearanceMenuAction.jsx';
import {
  CONTENT_TYPES, contentTypeMeta, createEditorialDraft, editorialActionError,
  editorialDirectPublishSteps, getEditorialDraft, listEditorialTaxonomy,
  listEditorialWorkspace, runEditorialWorkflow,
  saveEditorialAutosave, saveEditorialDetails, saveEditorialDraft, syncEditorialSources,
} from '../../features/editorial/editorialApi.js';
import { editorialCapabilities } from '../../features/editorial/editorialCapabilities.js';
import { emptyEditorialDocument } from '../../features/editorial/editorialDocument.js';
import {
  EDITORIAL_CONTENT_CHOICES, EDITORIAL_SECTION_OPTIONS, blockDisplayName,
  createEditorialTemplate, createHistoryState, duplicateEditorialBlock,
  editorialLayoutsFor, insertEditorialBlock, moveEditorialBlock, pushHistory,
  redoHistory, removeEditorialBlock, undoHistory,
} from '../../features/editorial/editorialBuilder.js';
import { useAdminAccess } from '../../lib/adminAccess.jsx';
import { supabase } from '../../lib/supabaseClient.js';
import { commitManagedMediaReplacement, uploadManagedWebsiteImage } from '../../lib/r2Media.js';
import { useEditorialFlags } from '../../features/editorial/editorialFlags.js';
import LoadingState from '../../components/LoadingState.jsx';
import { useAdminConfirmation } from '../../components/admin/AdminDialog.jsx';
import UnsavedChangesGuard from '../../components/admin/UnsavedChangesGuard.jsx';

const studioLinks = [
  ['Library', '/editorial', BookOpen],
  ['My drafts', '/editorial/drafts', FilePenLine],
];

const STATUS_LABELS = Object.freeze({
  draft: 'Draft', in_review: 'In Review', submitted: 'In Review', changes_requested: 'Changes Requested',
  needs_revision: 'Changes Requested', approved: 'Approved', scheduled: 'Scheduled', published: 'Published',
  expired: 'Expired', archived: 'Archived',
});

const DETAIL_FIELDS = Object.freeze({
  event: [
    ['starts_at', 'Start', 'datetime-local'], ['ends_at', 'End', 'datetime-local'], ['venue_name', 'Venue'],
    ['location_text', 'Location'], ['organizer', 'Organizer'], ['price_note', 'Admission'],
    ['official_contact', 'Contact'], ['official_url', 'Official URL'],
    ['event_status', 'Event status', 'select', ['scheduled', 'ongoing', 'completed', 'postponed', 'cancelled', 'expired']],
  ],
  place: [
    ['address_text', 'Address'], ['place_type', 'Destination type'], ['opening_hours_note', 'Opening information'],
    ['accessibility_note', 'Accessibility'], ['contact_note', 'Contact'], ['official_url', 'Official URL'],
    ['verification_status', 'Verification', 'select', ['unverified', 'verified', 'needs_review', 'unavailable']],
  ],
  activity: [
    ['activity_type', 'Activity type'], ['duration_note', 'Duration'], ['difficulty', 'Difficulty', 'select', ['', 'easy', 'moderate', 'challenging', 'varies']],
    ['meeting_point', 'Meeting point'], ['availability_note', 'Availability'], ['safety_note', 'Safety notes'],
    ['contact_note', 'Contact'], ['official_url', 'Official URL'],
    ['verification_status', 'Verification', 'select', ['unverified', 'verified', 'needs_review', 'unavailable']],
  ],
  local_product: [
    ['product_type', 'Product type'], ['maker_name', 'Maker'], ['purchase_location', 'Purchase information'],
    ['price_note', 'Price information'], ['contact_note', 'Contact'], ['official_url', 'Official URL'],
    ['verification_status', 'Verification', 'select', ['unverified', 'verified', 'needs_review', 'unavailable']],
  ],
});

export default function EditorialStudio() {
  return <StudioEditorialGate><EditorialStudioShell /></StudioEditorialGate>;
}

function EditorialStudioShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, editorialRoles, user } = useAdminAccess();
  const capabilities = editorialCapabilities(editorialRoles?.length ? editorialRoles : role);
  const [menuOpen, setMenuOpen] = useState(false);
  const path = location.pathname;
  const contentMatch = path.match(/^\/editorial\/content\/([^/]+)\/(edit|preview)$/);
  const contentId = contentMatch?.[1] || '';
  const editorMode = contentMatch?.[2] === 'edit';
  const content = path === '/editorial/new'
    ? <NewStory />
    : editorMode
      ? <StoryEditor id={contentId} />
      : contentMatch?.[2] === 'preview'
        ? <StoryPreview id={contentId} />
        : <StudioLibrary />;

  async function logout() {
    await supabase.auth.signOut();
    navigate('/admin/login', { replace: true });
  }

  return <div className="editorial-studio-shell min-h-screen overflow-x-clip bg-[var(--theme-page-background)] text-zinc-100">
    <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[var(--theme-navigation-surface)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 max-w-[110rem] items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/editorial" className="min-w-0" aria-label="Editorial Studio home">
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-orange-300/75">Lahat Liwa</p>
          <p className="truncate text-sm font-semibold">Editorial Studio</p>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/admin/editorial" className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.1] px-3 text-xs font-semibold text-white sm:text-sm"><ArrowLeft size={15} /><span>Back to Admin</span></Link>
          <AppearanceMenuAction iconOnly className="grid h-10 w-10 place-items-center rounded-full text-zinc-400 hover:bg-white/[0.06] hover:text-white" />
          {!editorMode && <Link to="/editorial/new" className="hidden h-10 items-center gap-2 rounded-full bg-orange-400 px-4 text-sm font-semibold text-zinc-950 shadow-[0_0_28px_rgba(251,146,60,0.16)] sm:inline-flex"><Plus size={16} />New story</Link>}
          {!editorMode && <button type="button" onClick={() => setMenuOpen((value) => !value)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/[0.06] lg:hidden" aria-label="Open studio menu">{menuOpen ? <X /> : <Menu />}</button>}
          <button type="button" onClick={logout} className="hidden h-10 items-center gap-2 rounded-full px-3 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white sm:inline-flex"><LogOut size={16} />Logout</button>
        </div>
      </div>
    </header>
    {editorMode ? <main className="min-w-0">{content}</main> : <div className="mx-auto grid max-w-[110rem] lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className={clsx('border-b border-white/[0.08] bg-[var(--theme-primary-surface)] px-3 py-3 lg:sticky lg:top-16 lg:block lg:h-[calc(100vh-4rem)] lg:border-b-0 lg:border-r lg:py-5', menuOpen ? 'block' : 'hidden')}>
        <nav className="grid gap-1">{studioLinks.filter(([, , , need]) => !need || capabilities.canReview).map(([label, href, Icon]) => <NavLink key={href} to={href} end={href === '/editorial'} onClick={() => setMenuOpen(false)} className={({ isActive }) => clsx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm transition', isActive ? 'bg-orange-400/12 text-orange-100' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white')}><Icon size={17} />{label}</NavLink>)}</nav>
        <div className="mt-6 border-t border-white/[0.08] px-3 pt-4"><p className="truncate text-xs text-zinc-400">{user?.email}</p><p className="mt-1 text-[0.62rem] uppercase tracking-[0.15em] text-zinc-600">{role}</p></div>
      </aside>
      <main className="min-w-0 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">{content}</main>
    </div>}
  </div>;
}

function StudioLibrary() {
  const location = useLocation();
  const { user, role, editorialRoles } = useAdminAccess();
  const capabilities = editorialCapabilities(editorialRoles?.length ? editorialRoles : role);
  const { requestConfirmation, confirmationDialog } = useAdminConfirmation();
  const scope = location.pathname.endsWith('/drafts') ? 'drafts' : location.pathname.endsWith('/assigned') ? 'assigned' : location.pathname.endsWith('/review') ? 'review' : 'all';
  const [state, setState] = useState({ loading: true, error: '', message: '', posts: [], taxonomy: null, working: '' });
  const [filters, setFilters] = useState({ search: '', type: '', status: '', municipality: '', category: '' });

  async function load() {
    try {
      const [posts, taxonomy] = await Promise.all([listEditorialWorkspace({ userId: user.id, role, scope }), listEditorialTaxonomy()]);
      setState((current) => ({ ...current, loading: false, error: '', posts, taxonomy }));
    } catch {
      setState((current) => ({ ...current, loading: false, error: 'Your stories could not be loaded right now.', posts: [] }));
    }
  }
  useEffect(() => { load(); }, [role, scope, user.id]);

  const visiblePosts = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    return state.posts.filter((post) => {
      if (needle && !`${post.title} ${post.summary || ''}`.toLowerCase().includes(needle)) return false;
      if (filters.type && post.content_type !== filters.type) return false;
      if (filters.status && post.status !== filters.status) return false;
      if (filters.municipality && post.municipality_id !== filters.municipality) return false;
      if (filters.category && post.category_id !== filters.category) return false;
      return true;
    });
  }, [filters, state.posts]);

  async function libraryAction(post, action) {
    setState((current) => ({ ...current, working: `${post.id}:${action}`, error: '', message: '' }));
    try {
      if (action === 'publish') {
        for (const step of editorialDirectPublishSteps(post.status)) await runEditorialWorkflow(post.id, step);
      } else await runEditorialWorkflow(post.id, action);
      setState((current) => ({ ...current, working: '', message: action === 'restore' ? 'Restored to Draft.' : action === 'publish' ? 'Published.' : action === 'delete' ? 'Deleted.' : 'Archived.' }));
      await load();
    } catch (error) {
      setState((current) => ({ ...current, working: '', error: editorialActionError(error).message }));
    }
  }

  function deleteFromLibrary(post) {
    requestConfirmation({
      title: 'Delete story?',
      description: `"${post.title}" and its private revisions will be deleted permanently. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      destructive: true,
      onConfirm: () => libraryAction(post, 'delete'),
    });
  }

  const heading = scope === 'drafts' ? 'My drafts' : scope === 'assigned' ? 'Assigned to me' : scope === 'review' ? 'Review queue' : 'Stories';
  return <section>
    <StudioHeader title={heading} description={capabilities.canManageAllContent ? 'Create, review, publish, archive, or restore stories.' : 'Your private stories stay editable and under your control.'} action={<Link to="/editorial/new" className="inline-flex h-11 items-center gap-2 rounded-full bg-orange-400 px-4 text-sm font-semibold text-zinc-950"><Plus size={16} />New story</Link>} />
    <div className="mt-7 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-3 sm:p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(14rem,1fr)_repeat(4,minmax(0,0.55fr))]">
        <label className="relative"><span className="sr-only">Search content</span><Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-zinc-500" /><input value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search stories" className="h-11 w-full rounded-xl border border-white/[0.1] bg-[var(--theme-input-background)] pl-10 pr-3 text-sm outline-none focus:border-orange-300/40 focus:ring-2 focus:ring-orange-300/10" /></label>
        <CompactSelect label="Type" value={filters.type} onChange={(type) => setFilters((current) => ({ ...current, type }))} options={[['', 'All types'], ...CONTENT_TYPES.map((item) => [item.key, item.label])]} />
        <CompactSelect label="Status" value={filters.status} onChange={(status) => setFilters((current) => ({ ...current, status }))} options={[['', 'All statuses'], ...Object.entries(STATUS_LABELS).filter(([key]) => !['submitted', 'needs_revision'].includes(key))]} />
        <CompactSelect label="Municipality" value={filters.municipality} onChange={(municipality) => setFilters((current) => ({ ...current, municipality }))} options={[['', 'All municipalities'], ...(state.taxonomy?.municipalities || []).map((item) => [item.id, item.name])]} />
        <CompactSelect label="Category" value={filters.category} onChange={(category) => setFilters((current) => ({ ...current, category }))} options={[['', 'All categories'], ...(state.taxonomy?.categories || []).map((item) => [item.id, item.name])]} />
      </div>
    </div>
    {state.error && <StudioNotice className="mt-4">{state.error}</StudioNotice>}
    {state.message && <StudioNotice tone="success" className="mt-4">{state.message}</StudioNotice>}
    <div className="mt-5">{state.loading ? <LoadingState label="Loading content" /> : visiblePosts.length ? <div className="grid gap-4 xl:grid-cols-2">{visiblePosts.map((post) => {
      const publishable = editorialDirectPublishSteps(post.status).length > 0 && capabilities.canPublish;
      return <article key={post.id} className="group grid min-h-44 overflow-hidden rounded-2xl border border-white/[0.08] bg-[var(--theme-primary-surface)] sm:grid-cols-[9.5rem_minmax(0,1fr)]">
        <div className="relative min-h-36 bg-white/[0.035]">{post.cover_image_url ? <img src={post.cover_image_url} alt={post.cover_image_alt || ''} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-zinc-700"><ImageIcon size={28} /></div>}</div>
        <div className="flex min-w-0 flex-col p-4"><div className="flex flex-wrap items-center gap-2"><Status status={post.status} /><span className="text-[0.65rem] uppercase tracking-[0.14em] text-orange-200/65">{contentTypeMeta(post.content_type).label}</span></div><h2 className="mt-3 truncate text-lg font-semibold">{post.title}</h2><p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-500">{post.summary || 'No summary yet.'}</p><div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600"><span>{post.editorial_municipalities?.name || 'No municipality'}</span><span>{post.editorial_categories?.name || 'No category'}</span><time>{formatRelativeDate(post.updated_at)}</time>{post.editorial_contributors?.display_name && <span>{post.editorial_contributors.display_name}</span>}</div>
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-4"><Link to={`/editorial/content/${post.id}/edit`} className="inline-flex h-9 items-center gap-2 rounded-full bg-white/[0.07] px-3 text-xs font-semibold hover:bg-white/[0.11]"><FilePenLine size={14} />Edit</Link><Link to={`/editorial/content/${post.id}/preview`} className="inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs text-zinc-400 hover:bg-white/[0.06] hover:text-white"><Eye size={14} />Preview</Link>{publishable && <button type="button" onClick={() => libraryAction(post, 'publish')} disabled={Boolean(state.working)} className="h-9 rounded-full px-3 text-xs font-semibold text-orange-200 hover:bg-orange-400/10">Publish</button>}{capabilities.canArchive && post.status !== 'archived' && <button type="button" onClick={() => libraryAction(post, 'archive')} disabled={Boolean(state.working)} className="h-9 rounded-full px-3 text-xs text-red-200 hover:bg-red-400/10">Archive</button>}{capabilities.canRestoreOwn && post.status === 'archived' && <button type="button" onClick={() => libraryAction(post, 'restore')} disabled={Boolean(state.working)} className="h-9 rounded-full px-3 text-xs text-emerald-200 hover:bg-emerald-400/10">Restore</button>}{capabilities.canDeleteOwn && post.status === 'archived' && <button type="button" onClick={() => deleteFromLibrary(post)} disabled={Boolean(state.working)} className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-xs text-red-300 hover:bg-red-400/10"><Trash2 size={13} />Delete permanently</button>}</div>
        </div>
      </article>;
    })}</div> : <EmptyLibrary />}</div>
    {confirmationDialog}
  </section>;
}

function NewStory() {
  const navigate = useNavigate();
  const { user } = useAdminAccess();
  const [step, setStep] = useState(1);
  const [type, setType] = useState('journal');
  const [layout, setLayout] = useState('travel-guide');
  const [taxonomy, setTaxonomy] = useState({ municipalities: [], categories: [] });
  const [basic, setBasic] = useState({ title: '', municipalityId: '', categoryId: '' });
  const [state, setState] = useState({ saving: false, error: '' });

  useEffect(() => { listEditorialTaxonomy().then(setTaxonomy).catch(() => setState({ saving: false, error: 'Categories and municipalities could not be loaded.' })); }, []);
  useEffect(() => { setLayout(editorialLayoutsFor(type)[0]?.key || ''); }, [type]);

  async function create() {
    setState({ saving: true, error: '' });
    try {
      const draft = await createEditorialDraft({ userId: user.id, contentType: type, title: basic.title, municipalityId: basic.municipalityId, categoryId: basic.categoryId, document: createEditorialTemplate(type, layout) });
      navigate(`/editorial/content/${draft.id}/edit`, { replace: true });
    } catch (error) {
      setState({ saving: false, error: editorialActionError(error, 'create the draft').message });
    }
  }

  return <section className="mx-auto max-w-5xl">
    <Link to="/editorial" className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-white"><ArrowLeft size={16} />Library</Link>
    <div className="mt-7 flex items-center gap-2" aria-label={`Step ${step} of 3`}>{[1, 2, 3].map((item) => <div key={item} className={clsx('h-1.5 flex-1 rounded-full', item <= step ? 'bg-orange-400' : 'bg-white/[0.08]')} />)}</div>
    {step === 1 && <div className="mt-9"><StudioHeader title="What are you creating?" description="Choose the content type that best matches the story." /><div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{EDITORIAL_CONTENT_CHOICES.map((item) => <button key={item.key} type="button" onClick={() => setType(item.key)} className={clsx('min-h-40 rounded-2xl border p-5 text-left transition', type === item.key ? 'border-orange-300/50 bg-orange-400/10 shadow-[0_18px_50px_rgba(251,146,60,0.08)]' : 'border-white/[0.08] bg-white/[0.025] hover:border-white/[0.16]')}><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/[0.06] text-orange-200"><LayoutPanelTop size={19} /></span><span className="mt-5 block font-semibold">{item.label}</span><span className="mt-2 block text-xs leading-5 text-zinc-500">{item.description}</span></button>)}</div></div>}
    {step === 2 && <div className="mt-9"><StudioHeader title="Choose a starting layout" description="Each layout adds editable sections only—no dates, prices, or unverified claims." /><div className="mt-7 grid gap-4 md:grid-cols-3">{editorialLayoutsFor(type).map((item) => <button key={item.key} type="button" onClick={() => setLayout(item.key)} className={clsx('rounded-2xl border p-5 text-left transition', layout === item.key ? 'border-orange-300/50 bg-orange-400/10' : 'border-white/[0.08] bg-white/[0.025] hover:border-white/[0.16]')}><span className="block text-sm font-semibold">{item.label}</span><span className="mt-2 block text-xs leading-5 text-zinc-500">{item.description}</span><span className="mt-6 grid gap-2" aria-hidden="true"><i className="h-2 w-2/3 rounded-full bg-white/[0.12]" /><i className="h-2 rounded-full bg-white/[0.07]" /><i className="h-16 rounded-xl bg-white/[0.035]" /></span></button>)}</div></div>}
    {step === 3 && <div className="mt-9"><StudioHeader title="Add the basics" description="You can refine everything inside the visual editor." /><div className="mt-7 grid gap-5 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:grid-cols-2 sm:p-7"><StudioInput label="Title" value={basic.title} onChange={(title) => setBasic((current) => ({ ...current, title }))} required className="sm:col-span-2" /><StudioSelect label="Municipality" value={basic.municipalityId} onChange={(municipalityId) => setBasic((current) => ({ ...current, municipalityId }))} options={[['', 'Choose a municipality'], ...taxonomy.municipalities.map((item) => [item.id, item.name])]} /><StudioSelect label="Category" value={basic.categoryId} onChange={(categoryId) => setBasic((current) => ({ ...current, categoryId }))} options={[['', 'Choose a category'], ...taxonomy.categories.filter((item) => !item.content_type || item.content_type === type).map((item) => [item.id, item.name])]} /></div></div>}
    {state.error && <StudioNotice className="mt-5">{state.error}</StudioNotice>}
    <div className="mt-8 flex items-center justify-between"><button type="button" onClick={() => step === 1 ? navigate('/editorial') : setStep((current) => current - 1)} className="inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white"><ChevronLeft size={16} />Back</button>{step < 3 ? <button type="button" onClick={() => setStep((current) => current + 1)} className="inline-flex h-11 items-center gap-2 rounded-full bg-orange-400 px-5 text-sm font-semibold text-zinc-950">Continue<ChevronRight size={16} /></button> : <button type="button" onClick={create} disabled={state.saving || basic.title.trim().length < 2 || !basic.municipalityId || !basic.categoryId} className="inline-flex h-11 items-center gap-2 rounded-full bg-orange-400 px-5 text-sm font-semibold text-zinc-950 disabled:opacity-40">{state.saving ? 'Creating…' : 'Open Editor'}<ChevronRight size={16} /></button>}</div>
  </section>;
}

function StoryEditor({ id }) {
  const navigate = useNavigate();
  const { role, editorialRoles, user, session } = useAdminAccess();
  const capabilities = editorialCapabilities(editorialRoles?.length ? editorialRoles : role);
  const { requestConfirmation, confirmationDialog } = useAdminConfirmation();
  const { flags } = useEditorialFlags();
  const authReady = Boolean(user?.id && session?.user?.id);
  const [editor, setEditor] = useState(null);
  const [taxonomy, setTaxonomy] = useState(null);
  const [status, setStatus] = useState({ loading: true, error: '', message: '', save: 'Saved', working: '' });
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState('story');
  const [device, setDevice] = useState('desktop');
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [drawer, setDrawer] = useState('');
  const [uploading, setUploading] = useState(false);
  const draggedIndex = useRef(-1);

  useEffect(() => {
    let active = true;
    if (!authReady) { setStatus((current) => ({ ...current, loading: true, error: '' })); return () => { active = false; }; }
    Promise.all([getEditorialDraft(id), listEditorialTaxonomy()]).then(([post, nextTaxonomy]) => {
      if (!active) return;
      setTaxonomy(nextTaxonomy);
      setEditor(post ? createHistoryState({ ...post, loaded_cover_image_url: post.cover_image_url || '' }) : null);
      setStatus({ loading: false, error: post ? '' : 'Draft not found.', message: post?.autosave ? 'Recovered your latest autosave.' : '', save: post?.autosave ? 'Recovered' : 'Saved', working: '' });
    }).catch((error) => { if (active) setStatus({ loading: false, error: error?.message || 'Draft could not be loaded.', message: '', save: 'Save failed', working: '' }); });
    return () => { active = false; };
  }, [authReady, id]);

  const post = editor?.present;
  const document = post?.revision?.document || emptyEditorialDocument();
  const blocks = document.blocks || [];
  const canControl = Boolean(post && (capabilities.canManageAllContent || post.author_user_id === user?.id));
  const draftEditable = Boolean(canControl && post?.status !== 'archived');
  const publishSteps = editorialDirectPublishSteps(post?.status);
  const canRestore = Boolean(canControl && capabilities.canRestoreOwn && post?.status === 'archived');

  function changePost(updater) {
    if (!draftEditable || !editor) return;
    setEditor((current) => pushHistory(current, typeof updater === 'function' ? updater(current.present) : updater));
    setDirty(true);
    setStatus((current) => ({ ...current, save: 'Unsaved changes', error: '', message: '' }));
  }
  function updatePost(key, value) { changePost((current) => ({ ...current, [key]: value })); }
  function updateDocument(nextBlocks) { changePost((current) => ({ ...current, revision: { ...current.revision, document: { version: 1, blocks: nextBlocks } } })); }
  function patchBlock(index, patch) { updateDocument(blocks.map((block, current) => current === index ? { ...block, ...patch } : block)); }
  function setServerPost(serverPost) { setEditor((current) => current ? { ...current, present: { ...current.present, ...serverPost } } : current); }

  useEffect(() => {
    if (!dirty || !draftEditable || !post || !user?.id) return undefined;
    const timer = setTimeout(() => {
      setStatus((current) => ({ ...current, save: 'Saving…' }));
      saveEditorialAutosave(user.id, post, document).then(() => { setDirty(false); setStatus((current) => ({ ...current, save: 'Saved', message: 'Autosaved.', error: '' })); }).catch(() => setStatus((current) => ({ ...current, save: 'Save failed', error: 'Autosave failed. Your changes are still open in this browser.', message: '' })));
    }, 1200);
    return () => clearTimeout(timer);
  }, [dirty, document, draftEditable, post, user?.id]);

  async function persistDraft() {
    const revision = await saveEditorialDraft(post, document, post.revision);
    const details = await saveEditorialDetails(post);
    const sources = capabilities.canManageSources ? await syncEditorialSources(post, user.id) : post.sources;
    if (post.cover_image_url !== post.loaded_cover_image_url) await commitManagedMediaReplacement(post.cover_image_url, post.loaded_cover_image_url);
    return { ...post, status: 'draft', current_revision_id: revision.id, revision, details, sources, loaded_cover_image_url: post.cover_image_url || '' };
  }

  async function save() {
    setStatus((current) => ({ ...current, working: 'save', save: 'Saving…', error: '', message: '' }));
    try {
      const saved = await persistDraft();
      setDirty(false);
      setServerPost(saved);
      setStatus((current) => ({ ...current, working: '', save: 'Saved', message: 'Draft saved.' }));
      return true;
    } catch (error) {
      setStatus((current) => ({ ...current, working: '', save: 'Save failed', error: editorialActionError(error, 'save your draft').message }));
      return false;
    }
  }

  async function preview() {
    if (dirty && !(await save())) return;
    navigate(`/editorial/content/${id}/preview`);
  }

  async function workflow(action, options = {}, successMessage = 'Updated.') {
    setStatus((current) => ({ ...current, working: action, error: '', message: '' }));
    try {
      const next = await runEditorialWorkflow(id, action, options);
      setServerPost(next);
      setStatus((current) => ({ ...current, working: '', message: successMessage }));
      return next;
    } catch (error) {
      setStatus((current) => ({ ...current, working: '', error: editorialActionError(error).message }));
      return null;
    }
  }

  async function publishNow() {
    setStatus((current) => ({ ...current, working: 'publish', error: '', message: '' }));
    try {
      let next = post;
      if (draftEditable) next = await persistDraft();
      const steps = editorialDirectPublishSteps(next.status);
      if (!steps.length) throw new Error('This story is not ready to publish.');
      for (const action of steps) next = await runEditorialWorkflow(id, action);
      setDirty(false);
      setServerPost(next);
      setStatus((current) => ({ ...current, working: '', save: 'Saved', message: 'Published.' }));
    } catch (error) {
      setStatus((current) => ({ ...current, working: '', save: dirty ? 'Unsaved changes' : current.save, error: editorialActionError(error, 'publish this story').message }));
    }
  }

  async function restoreToDraft() {
    if (post.status !== 'archived') return;
    const next = await workflow('restore', {}, 'Restored to draft. You can edit it now.');
    if (next) navigate(`/editorial/content/${id}/edit`, { replace: true });
  }

  function deleteStory() {
    requestConfirmation({
      title: 'Delete story?',
      description: `"${post.title}" and its private revisions will be deleted permanently. This cannot be undone.`,
      confirmLabel: 'Delete permanently',
      destructive: true,
      onConfirm: async () => {
        const deleted = await workflow('delete', {}, 'Deleted.');
        if (!deleted) return false;
        navigate('/editorial', { replace: true });
        return true;
      },
    });
  }

  async function uploadCover(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const media = await uploadManagedWebsiteImage(file, { category: 'editorial_cover', editorialPostId: id });
      updatePost('cover_image_url', media.primaryUrl);
      setStatus((current) => ({ ...current, message: 'Cover ready. Save to apply it.', error: '' }));
    } catch (error) { setStatus((current) => ({ ...current, error: editorialActionError(error, 'upload the cover').message })); }
    finally { setUploading(false); }
  }

  if (status.loading) return <div className="grid min-h-[70vh] place-items-center"><LoadingState label="Loading draft" /></div>;
  if (!post) return <div className="mx-auto max-w-xl p-6"><StudioNotice>{status.error}</StudioNotice></div>;

  const selectedIndex = blocks.findIndex((block) => block.id === selected);
  const selectedBlock = selectedIndex >= 0 ? blocks[selectedIndex] : null;
  const canvasWidth = device === 'mobile' ? 'max-w-[390px]' : device === 'tablet' ? 'max-w-2xl' : 'max-w-4xl';
  const editorColumns = clsx(!leftCollapsed && !rightCollapsed && 'xl:grid-cols-[17rem_minmax(0,1fr)_19rem]', leftCollapsed && !rightCollapsed && 'xl:grid-cols-[3.5rem_minmax(0,1fr)_19rem]', !leftCollapsed && rightCollapsed && 'xl:grid-cols-[17rem_minmax(0,1fr)_3.5rem]', leftCollapsed && rightCollapsed && 'xl:grid-cols-[3.5rem_minmax(0,1fr)_3.5rem]');

  return <section className="editorial-studio-page pb-24 md:pb-0">
    <UnsavedChangesGuard dirty={dirty && !status.working} />
    <EditorToolbar post={post} saveState={status.save} canUndo={editor.past.length > 0} canRedo={editor.future.length > 0} device={device} setDevice={setDevice} onUndo={() => { setEditor((current) => undoHistory(current)); setDirty(true); }} onRedo={() => { setEditor((current) => redoHistory(current)); setDirty(true); }} onSave={save} onPreview={preview} onPublish={publishNow} canPublish={canControl && capabilities.canPublish && publishSteps.length > 0} working={status.working} />
    {!draftEditable && <StudioNotice tone="success" className="mx-4 mt-4 sm:mx-6">{post.status === 'archived' ? 'This story is archived. Restore it to continue editing.' : 'You can view this story, but only its owner can edit it.'}</StudioNotice>}
    {status.error && <StudioNotice className="mx-4 mt-4 sm:mx-6">{status.error}</StudioNotice>}
    {status.message && <StudioNotice tone="success" className="mx-4 mt-4 sm:mx-6">{status.message}</StudioNotice>}
    <div className={clsx('grid min-h-[calc(100vh-8rem)]', editorColumns)}>
      <StructurePanel collapsed={leftCollapsed} onCollapse={() => setLeftCollapsed((value) => !value)} blocks={blocks} selected={selected} setSelected={setSelected} onInsert={(type, index) => { const next = insertEditorialBlock(blocks, type, index); updateDocument(next); setSelected(next[index].id); }} onMove={(from, to) => updateDocument(moveEditorialBlock(blocks, from, to))} onDuplicate={(index) => updateDocument(duplicateEditorialBlock(blocks, index))} onToggleCollapse={(index) => patchBlock(index, { collapsed: !blocks[index].collapsed })} onDelete={(index) => { updateDocument(removeEditorialBlock(blocks, index)); setSelected('story'); }} draggedIndex={draggedIndex} detailLabel={DETAIL_FIELDS[post.content_type] ? `${contentTypeMeta(post.content_type).label} details` : ''} className="hidden xl:block" />
      <main className="min-w-0 bg-[var(--theme-page-background)] px-3 py-6 sm:px-6 lg:px-8">
        <div className={clsx('mx-auto transition-[max-width] duration-300', canvasWidth)}>
          <article className="overflow-hidden rounded-[1.75rem] border border-white/[0.09] bg-[var(--theme-elevated-surface)] shadow-[0_30px_100px_rgba(0,0,0,0.35)]">
            <button type="button" onClick={() => setSelected('cover')} className={clsx('relative block aspect-[16/7] w-full overflow-hidden text-left outline-none ring-inset focus-visible:ring-2 focus-visible:ring-orange-300', selected === 'cover' && 'ring-2 ring-orange-400/70')}>
              {post.cover_image_url ? <img src={post.cover_image_url} alt={post.cover_image_alt || ''} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center bg-[radial-gradient(circle_at_50%_10%,rgba(251,146,60,0.12),transparent_48%)] text-zinc-500"><span className="flex flex-col items-center gap-2"><ImageIcon size={30} /><span className="text-sm">Add a cover image</span></span></span>}
            </button>
            <div className="px-5 py-7 sm:px-10 sm:py-10">
              <div className="flex flex-wrap gap-2"><StudioChipSelect value={post.municipality_id || ''} onChange={(value) => updatePost('municipality_id', value)} options={[['', 'Municipality'], ...(taxonomy?.municipalities || []).map((item) => [item.id, item.name])]} disabled={!draftEditable} /><StudioChipSelect value={post.category_id || ''} onChange={(value) => updatePost('category_id', value)} options={[['', 'Category'], ...(taxonomy?.categories || []).filter((item) => !item.content_type || item.content_type === post.content_type).map((item) => [item.id, item.name])]} disabled={!draftEditable} /><Status status={post.status} /></div>
              <InlineText value={post.title} onChange={(value) => updatePost('title', value)} disabled={!draftEditable} placeholder="Story title" className="mt-6 text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-6xl" rows={2} />
              <InlineText value={post.summary || ''} onChange={(value) => updatePost('summary', value)} disabled={!draftEditable} placeholder="Write a short introduction…" className="mt-5 text-lg leading-8 text-zinc-400" rows={3} />
              <div className="mt-10 space-y-4">{blocks.map((block, index) => <div key={block.id} className={clsx('group/block relative rounded-2xl border p-3 transition', selected === block.id ? 'border-orange-300/45 bg-orange-400/[0.035]' : 'border-transparent hover:border-white/[0.08]', block.hidden && 'opacity-50')} onClick={() => setSelected(block.id)}>
                {block.collapsed ? <p className="py-4 text-center text-xs text-zinc-600">Section collapsed in the editor</p> : <EditableBlock block={block} index={index} disabled={!draftEditable} onPatch={(patch) => patchBlock(index, patch)} />}
                <button type="button" onClick={(event) => { event.stopPropagation(); const next = insertEditorialBlock(blocks, 'paragraph', index + 1); updateDocument(next); setSelected(next[index + 1].id); }} className="absolute -bottom-3 left-1/2 z-10 hidden h-7 -translate-x-1/2 items-center gap-1 rounded-full border border-white/[0.12] bg-[var(--theme-elevated-surface)] px-2 text-[0.65rem] text-zinc-300 shadow-lg group-hover/block:inline-flex focus:inline-flex"><Plus size={12} />Add Section</button>
              </div>)}{!blocks.length && <button type="button" onClick={() => { const next = insertEditorialBlock([], 'paragraph'); updateDocument(next); setSelected(next[0].id); }} className="grid min-h-40 w-full place-items-center rounded-2xl border border-dashed border-white/[0.14] text-sm text-zinc-500 hover:border-orange-300/30 hover:text-orange-100"><span className="inline-flex items-center gap-2"><Plus size={16} />Add the first section</span></button>}</div>
              {DETAIL_FIELDS[post.content_type] && <button type="button" onClick={() => setSelected('details')} className={clsx('mt-10 w-full rounded-2xl border p-5 text-left', selected === 'details' ? 'border-orange-300/45 bg-orange-400/[0.035]' : 'border-white/[0.08] bg-white/[0.025]')}><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-200/70">{contentTypeMeta(post.content_type).label} details</p><DetailsPreview type={post.content_type} details={post.details} /></button>}
              <button type="button" onClick={() => setSelected('sources')} className={clsx('mt-5 w-full rounded-2xl border p-5 text-left', selected === 'sources' ? 'border-orange-300/45 bg-orange-400/[0.035]' : 'border-white/[0.08] bg-white/[0.025]')}><p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-200/70">Sources</p><p className="mt-2 text-sm text-zinc-400">{post.sources?.length ? `${post.sources.length} source${post.sources.length === 1 ? '' : 's'} added` : 'Add verified references for this story.'}</p></button>
            </div>
          </article>
        </div>
      </main>
      <InspectorPanel collapsed={rightCollapsed} onCollapse={() => setRightCollapsed((value) => !value)} selected={selected} selectedBlock={selectedBlock} selectedIndex={selectedIndex} post={post} taxonomy={taxonomy} capabilities={capabilities} flags={flags} uploading={uploading} onUploadCover={uploadCover} onPostChange={updatePost} onBlockPatch={(patch) => patchBlock(selectedIndex, patch)} onMove={(to) => updateDocument(moveEditorialBlock(blocks, selectedIndex, to))} onDuplicate={() => updateDocument(duplicateEditorialBlock(blocks, selectedIndex))} onDelete={() => { updateDocument(removeEditorialBlock(blocks, selectedIndex)); setSelected('story'); }} onChangePost={changePost} className="hidden xl:block" />
    </div>
    <MobileEditorToolbar onLeft={() => setDrawer('left')} onRight={() => setDrawer('right')} onAdd={() => { const next = insertEditorialBlock(blocks, 'paragraph'); updateDocument(next); setSelected(next.at(-1).id); }} onSave={save} onPreview={preview} working={status.working} />
    <MobileDrawer open={drawer === 'left'} side="left" title="Story Structure" onClose={() => setDrawer('')}><StructurePanel blocks={blocks} selected={selected} setSelected={(value) => { setSelected(value); setDrawer(''); }} onInsert={(type, index) => { const next = insertEditorialBlock(blocks, type, index); updateDocument(next); setSelected(next[index].id); setDrawer(''); }} onMove={(from, to) => updateDocument(moveEditorialBlock(blocks, from, to))} onDuplicate={(index) => updateDocument(duplicateEditorialBlock(blocks, index))} onToggleCollapse={(index) => patchBlock(index, { collapsed: !blocks[index].collapsed })} onDelete={(index) => updateDocument(removeEditorialBlock(blocks, index))} draggedIndex={draggedIndex} detailLabel={DETAIL_FIELDS[post.content_type] ? `${contentTypeMeta(post.content_type).label} details` : ''} /></MobileDrawer>
    <MobileDrawer open={drawer === 'right'} side="right" title="Design" onClose={() => setDrawer('')}><InspectorPanel selected={selected} selectedBlock={selectedBlock} selectedIndex={selectedIndex} post={post} taxonomy={taxonomy} capabilities={capabilities} flags={flags} uploading={uploading} onUploadCover={uploadCover} onPostChange={updatePost} onBlockPatch={(patch) => patchBlock(selectedIndex, patch)} onMove={(to) => updateDocument(moveEditorialBlock(blocks, selectedIndex, to))} onDuplicate={() => updateDocument(duplicateEditorialBlock(blocks, selectedIndex))} onDelete={() => { updateDocument(removeEditorialBlock(blocks, selectedIndex)); setSelected('story'); }} onChangePost={changePost} /></MobileDrawer>
    <div className="fixed bottom-20 right-4 z-30 hidden flex-col gap-2 md:flex xl:hidden"><button type="button" onClick={() => setDrawer('left')} className="grid h-11 w-11 place-items-center rounded-full border border-white/[0.1] bg-[var(--theme-modal-surface)] shadow-xl" aria-label="Open story structure"><Layers3 size={18} /></button><button type="button" onClick={() => setDrawer('right')} className="grid h-11 w-11 place-items-center rounded-full border border-white/[0.1] bg-[var(--theme-modal-surface)] shadow-xl" aria-label="Open design controls"><LayoutPanelLeft size={18} /></button></div>
    <div className="fixed bottom-5 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/[0.1] bg-[var(--theme-modal-surface)] p-2 shadow-2xl backdrop-blur-xl md:flex xl:hidden"><button onClick={save} className="inline-flex h-10 items-center gap-2 rounded-full bg-orange-400 px-4 text-sm font-semibold text-zinc-950"><Save size={15} />Save draft</button><button onClick={preview} className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm text-zinc-300"><Eye size={15} />Preview</button></div>
    <div className="sr-only">Save Draft Preview Publish Archive Restore Delete</div>
    <div className="mx-4 mt-6 flex flex-wrap justify-end gap-2 border-t border-white/[0.08] pt-5 sm:mx-6 lg:mx-8">
      {canControl && capabilities.canArchive && post.status !== 'archived' && <button onClick={() => workflow('archive', {}, 'Archived.')} className="h-10 rounded-full border border-red-300/20 bg-[var(--theme-primary-surface)] px-4 text-sm text-red-100 shadow-xl"><Archive size={15} className="mr-2 inline" />Archive</button>}
      {canRestore && <button onClick={restoreToDraft} className="h-10 rounded-full border border-emerald-300/30 bg-[var(--theme-primary-surface)] px-4 text-sm font-semibold text-emerald-100 shadow-xl"><RotateCcw size={15} className="mr-2 inline" />Restore to Draft</button>}
      {canControl && capabilities.canDeleteOwn && post.status === 'archived' && <button onClick={deleteStory} className="h-10 rounded-full border border-red-300/20 bg-[var(--theme-primary-surface)] px-4 text-sm text-red-100 shadow-xl"><Trash2 size={15} className="mr-2 inline" />Delete permanently</button>}
    </div>
    {confirmationDialog}
  </section>;
}

function EditorToolbar({ post, saveState, canUndo, canRedo, device, setDevice, onUndo, onRedo, onSave, onPreview, onPublish, canPublish, working }) {
  return <header className="sticky top-16 z-40 flex min-h-16 items-center gap-2 border-b border-white/[0.08] bg-[var(--theme-navigation-surface)] px-3 backdrop-blur-xl sm:px-5">
    <Link to="/editorial" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/[0.06]" aria-label="Back to library"><ArrowLeft size={18} /></Link>
    <div className="min-w-0"><p className="max-w-36 truncate text-sm font-semibold sm:max-w-64">{post.title}</p><p className={clsx('text-[0.68rem]', saveState === 'Save failed' ? 'text-red-300' : saveState === 'Unsaved changes' ? 'text-orange-200' : 'text-zinc-500')}>{saveState}</p></div>
    <div className="ml-2 hidden items-center gap-1 sm:flex"><IconButton label="Undo" onClick={onUndo} disabled={!canUndo}><Undo2 size={16} /></IconButton><IconButton label="Redo" onClick={onRedo} disabled={!canRedo}><Redo2 size={16} /></IconButton></div>
    <div className="mx-auto hidden items-center gap-1 rounded-full bg-white/[0.045] p-1 md:flex">{[['desktop', 'Desktop', Monitor], ['tablet', 'Tablet', Tablet], ['mobile', 'Mobile', Smartphone]].map(([value, label, Icon]) => <button key={value} type="button" onClick={() => setDevice(value)} className={clsx('grid h-8 w-9 place-items-center rounded-full', device === value ? 'bg-white/[0.1] text-orange-200' : 'text-zinc-500')} aria-label={`${label} preview`}><Icon size={15} /></button>)}</div>
    <div className="ml-auto flex items-center gap-1 sm:gap-2"><button type="button" onClick={onPreview} className="hidden h-10 items-center gap-2 rounded-full px-3 text-sm text-zinc-300 hover:bg-white/[0.06] sm:inline-flex"><Eye size={15} />Preview</button><button type="button" onClick={onSave} disabled={Boolean(working)} className="inline-flex h-10 items-center gap-2 rounded-full bg-white/[0.08] px-3 text-sm font-semibold hover:bg-white/[0.12] disabled:opacity-40"><Save size={15} /><span className="hidden sm:inline">{working === 'save' ? 'Saving…' : 'Save draft'}</span></button>{canPublish && <button type="button" onClick={onPublish} disabled={Boolean(working)} className="h-10 rounded-full bg-orange-400 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-40">{working === 'publish' ? 'Publishing…' : 'Publish'}</button>}</div>
  </header>;
}

function StructurePanel({ collapsed = false, onCollapse, blocks, selected, setSelected, onInsert, onMove, onDuplicate, onToggleCollapse, onDelete, draggedIndex, detailLabel = '', className = '' }) {
  if (collapsed) return <aside className={clsx('sticky top-32 h-[calc(100vh-8rem)] border-r border-white/[0.08] bg-[var(--theme-primary-surface)] p-2', className)}><IconButton label="Expand story structure" onClick={onCollapse}><Layers3 size={18} /></IconButton></aside>;
  return <aside className={clsx('h-full bg-[var(--theme-primary-surface)] xl:sticky xl:top-32 xl:h-[calc(100vh-8rem)] xl:overflow-y-auto xl:border-r xl:border-white/[0.08]', className)}>
    <div className="flex items-center justify-between p-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Story Structure</p><p className="mt-1 text-xs text-zinc-600">Drag to reorder</p></div>{onCollapse && <IconButton label="Collapse story structure" onClick={onCollapse}><PanelLeftClose size={17} /></IconButton>}</div>
    <div className="px-3"><button type="button" onClick={() => setSelected('cover')} className={clsx('flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm', selected === 'cover' ? 'bg-orange-400/10 text-orange-100' : 'text-zinc-400 hover:bg-white/[0.04]')}><ImageIcon size={15} />Cover & title</button><button type="button" onClick={() => setSelected('location')} className={clsx('mt-1 flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm', selected === 'location' ? 'bg-orange-400/10 text-orange-100' : 'text-zinc-400 hover:bg-white/[0.04]')}><Layers3 size={15} />Location</button>{blocks.map((block, index) => <div key={block.id} draggable onDragStart={() => { draggedIndex.current = index; }} onDragOver={(event) => event.preventDefault()} onDrop={() => { onMove(draggedIndex.current, index); draggedIndex.current = -1; }} className={clsx('group mt-1 flex items-center rounded-xl', selected === block.id ? 'bg-orange-400/10 text-orange-100' : 'text-zinc-400 hover:bg-white/[0.04]')}><GripVertical size={14} className="ml-2 shrink-0 cursor-grab text-zinc-700" /><button type="button" onClick={() => onToggleCollapse(index)} className="grid h-8 w-7 shrink-0 place-items-center" aria-label={`${block.collapsed ? 'Expand' : 'Collapse'} ${blockDisplayName(block, index)}`}>{block.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button><button type="button" onClick={() => setSelected(block.id)} className="min-w-0 flex-1 truncate py-3 text-left text-xs">{blockDisplayName(block, index)}</button><button type="button" onClick={() => onMove(index, Math.max(0, index - 1))} className="hidden p-1 group-hover:block" aria-label={`Move ${blockDisplayName(block, index)} up`}><ArrowUp size={13} /></button><button type="button" onClick={() => onMove(index, Math.min(blocks.length - 1, index + 1))} className="hidden p-1 group-hover:block" aria-label={`Move ${blockDisplayName(block, index)} down`}><ArrowDown size={13} /></button><button type="button" onClick={() => onDuplicate(index)} className="hidden p-1 group-hover:block" aria-label={`Duplicate ${blockDisplayName(block, index)}`}><Copy size={13} /></button><button type="button" onClick={() => onDelete(index)} className="hidden p-1 pr-2 text-red-200 group-hover:block" aria-label={`Delete ${blockDisplayName(block, index)}`}><Trash2 size={13} /></button></div>)}{detailLabel && <button type="button" onClick={() => setSelected('details')} className={clsx('mt-1 flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm', selected === 'details' ? 'bg-orange-400/10 text-orange-100' : 'text-zinc-400 hover:bg-white/[0.04]')}><ClipboardList size={15} />{detailLabel}</button>}<button type="button" onClick={() => setSelected('sources')} className={clsx('mt-1 flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm', selected === 'sources' ? 'bg-orange-400/10 text-orange-100' : 'text-zinc-400 hover:bg-white/[0.04]')}><BookOpen size={15} />Sources</button><button type="button" onClick={() => setSelected('story')} className={clsx('mt-1 flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-left text-sm', selected === 'story' ? 'bg-orange-400/10 text-orange-100' : 'text-zinc-400 hover:bg-white/[0.04]')}><LayoutPanelTop size={15} />Advanced settings</button></div>
    <div className="mt-6 border-t border-white/[0.08] p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Add Section</p><div className="mt-3 grid grid-cols-2 gap-2">{EDITORIAL_SECTION_OPTIONS.map((item) => <button key={item.type} type="button" onClick={() => onInsert(item.type, blocks.length)} className="min-h-9 rounded-lg border border-white/[0.08] px-2 text-left text-xs text-zinc-400 hover:border-orange-300/30 hover:text-orange-100">+ {item.label}</button>)}</div></div>
  </aside>;
}

function InspectorPanel({ collapsed = false, onCollapse, selected, selectedBlock, selectedIndex, post, taxonomy, capabilities, flags, uploading, onUploadCover, onPostChange, onBlockPatch, onMove, onDuplicate, onDelete, onChangePost, className = '' }) {
  if (collapsed) return <aside className={clsx('sticky top-32 h-[calc(100vh-8rem)] border-l border-white/[0.08] bg-[var(--theme-primary-surface)] p-2', className)}><IconButton label="Expand design controls" onClick={onCollapse}><LayoutPanelLeft size={18} /></IconButton></aside>;
  return <aside className={clsx('h-full bg-[var(--theme-primary-surface)] xl:sticky xl:top-32 xl:h-[calc(100vh-8rem)] xl:overflow-y-auto xl:border-l xl:border-white/[0.08]', className)}>
    <div className="flex items-center justify-between border-b border-white/[0.08] p-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Design</p><p className="mt-1 text-sm font-semibold">{selectedBlock ? blockDisplayName(selectedBlock, selectedIndex) : selected === 'cover' ? 'Cover & title' : selected === 'location' ? 'Location' : selected === 'details' ? `${contentTypeMeta(post.content_type).label} details` : selected === 'sources' ? 'Sources' : 'Advanced settings'}</p></div>{onCollapse && <IconButton label="Collapse design controls" onClick={onCollapse}><PanelRightClose size={17} /></IconButton>}</div>
    <div className="space-y-5 p-4">{selected === 'cover' && <CoverInspector post={post} flags={flags} uploading={uploading} onUploadCover={onUploadCover} onChange={onPostChange} />}{selected === 'location' && <LocationInspector post={post} taxonomy={taxonomy} onChange={onPostChange} />}{selected === 'story' && <StoryInspector post={post} onChangePost={onChangePost} />}{selected === 'details' && <DetailsEditor post={post} onChangePost={onChangePost} />}{selected === 'sources' && <SourcesEditor post={post} canManage={capabilities.canManageSources} onChangePost={onChangePost} />}{selectedBlock && <BlockInspector block={selectedBlock} index={selectedIndex} count={post.revision?.document?.blocks?.length || 0} onPatch={onBlockPatch} onMove={onMove} onDuplicate={onDuplicate} onDelete={onDelete} />}</div>
  </aside>;
}

function EditableBlock({ block, index, disabled, onPatch }) {
  if (block.type === 'paragraph') return <InlineText value={block.text || ''} onChange={(text) => onPatch({ text })} disabled={disabled} placeholder="Write a paragraph…" className="text-lg leading-8 text-zinc-300" rows={3} />;
  if (block.type === 'heading') return <InlineText value={block.text || ''} onChange={(text) => onPatch({ text })} disabled={disabled} placeholder="Section heading" className={clsx('font-semibold tracking-tight', block.level === 2 ? 'text-3xl' : block.level === 3 ? 'text-2xl' : 'text-xl')} rows={2} />;
  if (block.type === 'quote') return <div className="border-l-2 border-orange-400/70 pl-5"><InlineText value={block.text || ''} onChange={(text) => onPatch({ text })} disabled={disabled} placeholder="Add a quote…" className="text-xl leading-8" rows={3} /><InlineText value={block.attribution || ''} onChange={(attribution) => onPatch({ attribution })} disabled={disabled} placeholder="Attribution" className="mt-2 text-sm text-zinc-500" rows={1} /></div>;
  if (block.type === 'image') return block.url ? <figure><img src={block.url} alt={block.alt || ''} className={clsx('w-full rounded-xl object-cover', block.aspectRatio === 'square' ? 'aspect-square' : block.aspectRatio === 'portrait' ? 'aspect-[3/4]' : block.aspectRatio === 'natural' ? '' : 'aspect-[16/9]')} />{block.caption && <InlineText value={block.caption} onChange={(caption) => onPatch({ caption })} disabled={disabled} className="mt-2 text-sm text-zinc-500" rows={1} />}</figure> : <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-white/[0.12] bg-white/[0.02] text-zinc-500"><span className="flex flex-col items-center gap-2"><ImageIcon size={25} /><span className="text-sm">Select this section to add an image URL</span></span></div>;
  if (block.type === 'gallery') return block.images?.length ? <div className="grid gap-3 sm:grid-cols-2">{block.images.map((image, imageIndex) => <img key={`${image.url}-${imageIndex}`} src={image.url} alt={image.alt || ''} className="aspect-[4/3] w-full rounded-xl object-cover" />)}</div> : <div className="grid min-h-44 place-items-center rounded-xl border border-dashed border-white/[0.12] text-sm text-zinc-500">Add images from Design</div>;
  if (block.type === 'facts') return <div className="grid gap-2 sm:grid-cols-2">{(block.items || []).map((item, itemIndex) => <div key={itemIndex} className="rounded-xl bg-white/[0.035] p-4"><InlineText value={item.label} onChange={(label) => onPatch({ items: block.items.map((entry, current) => current === itemIndex ? { ...entry, label } : entry) })} disabled={disabled} placeholder="Label" className="text-xs uppercase tracking-[0.14em] text-orange-200/70" rows={1} /><InlineText value={item.value} onChange={(value) => onPatch({ items: block.items.map((entry, current) => current === itemIndex ? { ...entry, value } : entry) })} disabled={disabled} placeholder="Value" className="mt-2 text-sm" rows={2} /></div>)}{!block.items?.length && <p className="col-span-full py-8 text-center text-sm text-zinc-500">Add a fact row from Design.</p>}</div>;
  if (block.type === 'callout') return <div className="rounded-xl border border-orange-300/15 bg-orange-400/[0.06] p-5"><InlineText value={block.title || ''} onChange={(title) => onPatch({ title })} disabled={disabled} placeholder="Note title" className="font-semibold" rows={1} /><InlineText value={block.text || ''} onChange={(text) => onPatch({ text })} disabled={disabled} placeholder="Helpful context…" className="mt-2 text-sm leading-6 text-zinc-400" rows={3} /></div>;
  return <hr className="my-5 border-white/[0.12]" />;
}

function BlockInspector({ block, index, count, onPatch, onMove, onDuplicate, onDelete }) {
  return <>
    {['paragraph', 'heading', 'quote', 'callout'].includes(block.type) && <InspectorGroup label="Text"><Segmented value={block.align || 'left'} onChange={(align) => onPatch({ align })} options={[[AlignLeft, 'left'], [AlignCenter, 'center'], [AlignRight, 'right']]} />{block.type === 'heading' && <StudioSelect label="Heading level" value={String(block.level || 2)} onChange={(level) => onPatch({ level: Number(level) })} options={[[2, 'Heading 2'], [3, 'Heading 3'], [4, 'Heading 4']]} />}<StudioSelect label="Emphasis" value={block.emphasis || 'normal'} onChange={(emphasis) => onPatch({ emphasis })} options={[['normal', 'Normal'], ['strong', 'Strong'], ['subtle', 'Subtle']]} /><StudioInput label="Link" value={block.linkUrl || ''} onChange={(linkUrl) => onPatch({ linkUrl })} />{block.type === 'callout' && <><StudioSelect label="Tone" value={block.tone || 'note'} onChange={(tone) => onPatch({ tone })} options={[['note', 'Note'], ['tip', 'Tip'], ['warning', 'Warning']]} /><StudioInput label="Link label" value={block.linkLabel || ''} onChange={(linkLabel) => onPatch({ linkLabel })} /></>}</InspectorGroup>}
    {block.type === 'image' && <InspectorGroup label="Image"><StudioInput label="Image URL" value={block.url || ''} onChange={(url) => onPatch({ url })} /><StudioInput label="Alt text" value={block.alt || ''} onChange={(alt) => onPatch({ alt })} /><StudioTextarea label="Caption" value={block.caption || ''} onChange={(caption) => onPatch({ caption })} /><StudioSelect label="Aspect ratio" value={block.aspectRatio || 'landscape'} onChange={(aspectRatio) => onPatch({ aspectRatio })} options={[['natural', 'Natural'], ['landscape', 'Landscape'], ['portrait', 'Portrait'], ['square', 'Square']]} /><StudioSelect label="Fit" value={block.fit || 'cover'} onChange={(fit) => onPatch({ fit })} options={[['cover', 'Cover'], ['contain', 'Contain']]} /><StudioSelect label="Alignment" value={block.imageAlign || 'center'} onChange={(imageAlign) => onPatch({ imageAlign })} options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} /></InspectorGroup>}
    {block.type === 'gallery' && <GalleryInspector block={block} onPatch={onPatch} />}
    {block.type === 'facts' && <FactsInspector block={block} onPatch={onPatch} />}
    <InspectorGroup label="Section"><StudioSelect label="Spacing" value={block.spacing || 'normal'} onChange={(spacing) => onPatch({ spacing })} options={[['compact', 'Compact'], ['normal', 'Normal'], ['relaxed', 'Relaxed']]} /><StudioSelect label="Width" value={block.width || 'normal'} onChange={(width) => onPatch({ width })} options={[['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Wide'], ['full', 'Full']]} /><StudioSelect label="Background" value={block.background || 'none'} onChange={(background) => onPatch({ background })} options={[['none', 'None'], ['soft', 'Soft'], ['accent', 'Accent']]} /><label className="flex min-h-11 items-center justify-between rounded-xl border border-white/[0.08] px-3 text-sm"><span>Visible</span><input type="checkbox" checked={!block.hidden} onChange={(event) => onPatch({ hidden: !event.target.checked })} /></label><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => onMove(Math.max(0, index - 1))} disabled={index === 0} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.08] text-xs disabled:opacity-30"><ArrowUp size={14} />Up</button><button type="button" onClick={() => onMove(Math.min(count - 1, index + 1))} disabled={index === count - 1} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.08] text-xs disabled:opacity-30"><ArrowDown size={14} />Down</button><button type="button" onClick={onDuplicate} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/[0.08] text-xs"><Copy size={14} />Duplicate</button><button type="button" onClick={onDelete} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-300/15 text-xs text-red-200"><Trash2 size={14} />Delete</button></div></InspectorGroup>
  </>;
}

function CoverInspector({ post, flags, uploading, onUploadCover, onChange }) {
  return <InspectorGroup label="Cover"><StudioInput label="Image URL" value={post.cover_image_url || ''} onChange={(value) => onChange('cover_image_url', value)} /><StudioTextarea label="Alt text" value={post.cover_image_alt || ''} onChange={(value) => onChange('cover_image_alt', value)} />{flags.editorialMediaUploadsEnabled && <label className="grid gap-2 text-sm"><span className="font-medium text-zinc-300">Cover upload</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={onUploadCover} disabled={uploading} className="rounded-xl border border-dashed border-white/[0.14] bg-[var(--theme-input-background)] p-3 text-xs file:mr-2 file:rounded-full file:border-0 file:bg-orange-400 file:px-3 file:py-2 file:font-semibold file:text-zinc-950" /><span className="text-xs text-zinc-600">{uploading ? 'Uploading…' : 'Stored with the website’s managed media.'}</span></label>} {!flags.editorialMediaUploadsEnabled && <p className="rounded-xl bg-white/[0.035] p-3 text-xs leading-5 text-zinc-500">Paste an approved HTTPS image URL or a safe root-relative path. Managed uploads remain off.</p>}</InspectorGroup>;
}

function LocationInspector({ post, taxonomy, onChange }) {
  const categories = (taxonomy?.categories || []).filter((item) => !item.content_type || item.content_type === post.content_type);
  return <InspectorGroup label="Location & category"><StudioSelect label="Municipality" value={post.municipality_id || ''} onChange={(value) => onChange('municipality_id', value)} options={[['', 'Choose a municipality'], ...(taxonomy?.municipalities || []).map((item) => [item.id, item.name])]} /><StudioSelect label="Category" value={post.category_id || ''} onChange={(value) => onChange('category_id', value)} options={[['', 'Choose a category'], ...categories.map((item) => [item.id, item.name])]} /><p className="text-xs leading-5 text-zinc-600">These labels appear beside the story title and help visitors browse published content.</p></InspectorGroup>;
}

function StoryInspector({ post, onChangePost }) {
  function patchPost(key, value) { onChangePost((current) => ({ ...current, [key]: value })); }
  function patchRevision(key, value) { onChangePost((current) => ({ ...current, revision: { ...(current.revision || {}), [key]: value } })); }
  return <InspectorGroup label="Search and sharing"><StudioInput label="Slug" value={post.slug || ''} onChange={(slug) => patchPost('slug', slug)} /><p className="text-xs leading-5 text-zinc-600">The slug was generated from the title. Change it only when the public URL must differ.</p><StudioInput label="Search title" value={post.revision?.seo_title || ''} onChange={(seo_title) => patchRevision('seo_title', seo_title)} /><StudioTextarea label="Search description" value={post.revision?.seo_description || ''} onChange={(seo_description) => patchRevision('seo_description', seo_description)} /><p className="text-xs leading-5 text-zinc-600">These short details help search results describe the published story accurately.</p></InspectorGroup>;
}

function DetailsEditor({ post, onChangePost }) {
  const fields = DETAIL_FIELDS[post.content_type] || [];
  function patch(key, value) { onChangePost((current) => ({ ...current, details: { ...(current.details || {}), [key]: value } })); }
  return <InspectorGroup label={`${contentTypeMeta(post.content_type).label} details`}>{fields.map(([key, label, kind, options]) => kind === 'select' ? <StudioSelect key={key} label={label} value={post.details?.[key] || options[0]} onChange={(value) => patch(key, value)} options={options.map((value) => [value, value ? value.replaceAll('_', ' ') : 'Not set'])} /> : <label key={key} className="grid gap-2 text-sm"><span className="font-medium text-zinc-300">{label}</span><input type={kind || 'text'} value={formatDetailInput(post.details?.[key], kind)} onChange={(event) => patch(key, event.target.value)} className="h-11 rounded-xl border border-white/[0.1] bg-[var(--theme-input-background)] px-3 outline-none focus:border-orange-300/40 focus:ring-2 focus:ring-orange-300/10" /></label>)}</InspectorGroup>;
}

function SourcesEditor({ post, canManage, onChangePost }) {
  const sources = post.sources || [];
  function patch(index, values) { onChangePost((current) => ({ ...current, sources: current.sources.map((source, currentIndex) => currentIndex === index ? { ...source, ...values } : source) })); }
  function add() { onChangePost((current) => ({ ...current, sources: [...(current.sources || []), { id: globalThis.crypto?.randomUUID?.(), source_name: '', source_url: '', publisher: '', note: '', official_contact: '', verification_status: 'unverified' }] })); }
  function remove(index) { onChangePost((current) => ({ ...current, sources: current.sources.filter((_, currentIndex) => currentIndex !== index) })); }
  if (!canManage) return <p className="rounded-xl bg-white/[0.035] p-4 text-sm leading-6 text-zinc-400">Writers can view attached sources. An Editor or Admin can add and verify them.</p>;
  return <InspectorGroup label="Sources">{sources.map((source, index) => <div key={source.id || index} className="space-y-3 rounded-xl border border-white/[0.08] p-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-zinc-500">Source {index + 1}</span><button type="button" onClick={() => remove(index)} className="text-red-200" aria-label={`Remove source ${index + 1}`}><Trash2 size={14} /></button></div><StudioInput label="Source name" value={source.source_name || ''} onChange={(source_name) => patch(index, { source_name })} /><StudioInput label="HTTPS URL" value={source.source_url || ''} onChange={(source_url) => patch(index, { source_url })} /><StudioInput label="Publisher or organization" value={source.publisher || ''} onChange={(publisher) => patch(index, { publisher })} /><StudioTextarea label="Note" value={source.note || ''} onChange={(note) => patch(index, { note })} /><StudioSelect label="Verification" value={source.verification_status || 'unverified'} onChange={(verification_status) => patch(index, { verification_status })} options={[['unverified', 'Unverified'], ['needs_review', 'Needs review'], ['verified', 'Verified'], ['unavailable', 'Unavailable']]} /></div>)}<button type="button" onClick={add} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.14] text-sm text-zinc-400 hover:border-orange-300/30 hover:text-orange-100"><Plus size={15} />Add Source</button></InspectorGroup>;
}

function GalleryInspector({ block, onPatch }) {
  const images = block.images || [];
  function patch(index, values) { onPatch({ images: images.map((image, current) => current === index ? { ...image, ...values } : image) }); }
  return <InspectorGroup label="Gallery">{images.map((image, index) => <div key={index} className="space-y-3 rounded-xl border border-white/[0.08] p-3"><StudioInput label={`Image ${index + 1} URL`} value={image.url || ''} onChange={(url) => patch(index, { url })} /><StudioInput label="Alt text" value={image.alt || ''} onChange={(alt) => patch(index, { alt })} /><StudioInput label="Caption" value={image.caption || ''} onChange={(caption) => patch(index, { caption })} /><button type="button" onClick={() => onPatch({ images: images.filter((_, current) => current !== index) })} className="text-xs text-red-200">Remove image</button></div>)}<button type="button" onClick={() => onPatch({ images: [...images, { url: '', alt: '', caption: '' }] })} disabled={images.length >= 12} className="h-10 rounded-xl border border-dashed border-white/[0.14] text-sm text-zinc-400">+ Add image</button></InspectorGroup>;
}

function FactsInspector({ block, onPatch }) {
  const items = block.items || [];
  function patch(index, values) { onPatch({ items: items.map((item, current) => current === index ? { ...item, ...values } : item) }); }
  function move(index, to) { const next = [...items]; const [item] = next.splice(index, 1); next.splice(to, 0, item); onPatch({ items: next }); }
  return <InspectorGroup label="Facts">{items.map((item, index) => <div key={index} className="space-y-3 rounded-xl border border-white/[0.08] p-3"><StudioInput label="Label" value={item.label} onChange={(label) => patch(index, { label })} /><StudioTextarea label="Value" value={item.value} onChange={(value) => patch(index, { value })} /><div className="flex gap-2"><IconButton label="Move fact up" onClick={() => move(index, Math.max(0, index - 1))} disabled={index === 0}><ArrowUp size={14} /></IconButton><IconButton label="Move fact down" onClick={() => move(index, Math.min(items.length - 1, index + 1))} disabled={index === items.length - 1}><ArrowDown size={14} /></IconButton><IconButton label="Remove fact" onClick={() => onPatch({ items: items.filter((_, current) => current !== index) })}><Trash2 size={14} /></IconButton></div></div>)}<button type="button" onClick={() => onPatch({ items: [...items, { label: '', value: '' }] })} disabled={items.length >= 20} className="h-10 rounded-xl border border-dashed border-white/[0.14] text-sm text-zinc-400">+ Add row</button></InspectorGroup>;
}

function DetailsPreview({ type, details = {} }) {
  const rows = (DETAIL_FIELDS[type] || []).filter(([key]) => details?.[key]).slice(0, 4);
  return rows.length ? <dl className="mt-4 grid gap-3 sm:grid-cols-2">{rows.map(([key, label]) => <div key={key}><dt className="text-[0.65rem] uppercase tracking-[0.13em] text-zinc-600">{label}</dt><dd className="mt-1 truncate text-sm text-zinc-300">{formatDetailValue(details[key])}</dd></div>)}</dl> : <p className="mt-2 text-sm text-zinc-500">Add practical, verified information for visitors.</p>;
}

function StoryPreview({ id }) {
  const [state, setState] = useState({ loading: true, post: null, error: '' });
  useEffect(() => { let active = true; getEditorialDraft(id).then((post) => { if (active) setState({ loading: false, post, error: post ? '' : 'Draft not found.' }); }).catch((error) => { if (active) setState({ loading: false, post: null, error: error?.message || 'The preview could not be loaded.' }); }); return () => { active = false; }; }, [id]);
  if (state.loading) return <LoadingState label="Loading preview" />;
  if (!state.post) return <StudioNotice>{state.error}</StudioNotice>;
  const { post } = state;
  return <article className="mx-auto max-w-6xl pb-16"><Link to={`/editorial/content/${id}/edit`} className="inline-flex items-center gap-2 text-sm text-zinc-400"><ArrowLeft size={16} />Back to Editor</Link><div className="mt-7 overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[var(--theme-elevated-surface)]">{post.cover_image_url ? <img src={post.cover_image_url} alt={post.cover_image_alt || ''} className="aspect-[16/7] w-full object-cover" /> : <div className="grid aspect-[16/7] place-items-center bg-white/[0.025] text-zinc-600"><ImageIcon size={30} /></div>}<header className="mx-auto max-w-3xl px-5 py-10 sm:px-8"><div className="flex flex-wrap gap-2"><Status status={post.status} /><span className="text-xs text-orange-200/70">{contentTypeMeta(post.content_type).label}</span></div><h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-6xl">{post.title}</h1><p className="mt-5 text-lg leading-8 text-zinc-400">{post.summary}</p></header><EditorialDocumentRenderer document={post.revision?.document} mode="preview" className="px-5 pb-10 sm:px-8" />{DETAIL_FIELDS[post.content_type] && <div className="mx-auto max-w-3xl px-5 pb-8 sm:px-8"><div className="rounded-2xl border border-white/[0.08] p-5"><p className="text-xs uppercase tracking-[0.15em] text-orange-200/70">{contentTypeMeta(post.content_type).label} details</p><DetailsPreview type={post.content_type} details={post.details} /></div></div>}{post.sources?.some((source) => source.verification_status === 'verified') && <div className="mx-auto max-w-3xl px-5 pb-12 sm:px-8"><h2 className="text-lg font-semibold">Sources</h2><ul className="mt-3 space-y-2">{post.sources.filter((source) => source.verification_status === 'verified').map((source) => <li key={source.id}><a href={source.source_url} target="_blank" rel="noreferrer" className="text-sm text-orange-200 hover:underline">{source.source_name}</a></li>)}</ul></div>}</div></article>;
}

function MobileEditorToolbar({ onLeft, onRight, onAdd, onSave, onPreview, working }) {
  return <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-2xl border border-white/[0.1] bg-[var(--theme-navigation-surface)] p-1.5 shadow-2xl backdrop-blur-xl md:hidden" aria-label="Editor actions"><button onClick={onLeft} className="grid min-h-12 place-items-center rounded-xl text-zinc-300" aria-label="Story structure"><Layers3 size={18} /></button><button onClick={onAdd} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[0.62rem] text-zinc-300"><Plus size={18} />Add block</button><button onClick={onSave} disabled={Boolean(working)} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-orange-400 text-[0.62rem] font-semibold text-zinc-950"><Save size={18} />Save draft</button><button onClick={onPreview} className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[0.62rem] text-zinc-300"><Eye size={18} />Preview</button><button onClick={onRight} className="grid min-h-12 place-items-center rounded-xl text-zinc-300" aria-label="Design controls"><LayoutPanelLeft size={18} /></button></nav>;
}

function MobileDrawer({ open, side, title, onClose, children }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-[70] xl:hidden"><button type="button" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} aria-label="Close panel" /><section className={clsx('absolute inset-y-0 w-[min(90vw,23rem)] overflow-y-auto border-white/[0.1] bg-[var(--theme-primary-surface)] shadow-2xl', side === 'left' ? 'left-0 border-r' : 'right-0 border-l')} role="dialog" aria-modal="true" aria-label={title}><div className="sticky top-0 z-10 flex min-h-16 items-center justify-between border-b border-white/[0.08] bg-[var(--theme-navigation-surface)] px-4 backdrop-blur"><h2 className="font-semibold">{title}</h2><IconButton label="Close" onClick={onClose}><X size={18} /></IconButton></div>{children}</section></div>;
}

function EmptyLibrary() { return <div className="rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.02] p-12 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-orange-400/10 text-orange-200"><BookOpen size={21} /></span><h2 className="mt-5 font-semibold">No matching stories</h2><p className="mt-2 text-sm text-zinc-500">Adjust the filters or create the first story.</p><Link to="/editorial/new" className="mt-6 inline-flex h-10 items-center gap-2 rounded-full bg-orange-400 px-4 text-sm font-semibold text-zinc-950"><Plus size={15} />New story</Link></div>; }
function StudioHeader({ title, description, action }) { return <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-200/70">Editorial Studio</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p></div>{action}</header>; }
function Status({ status }) { return <span className={clsx('inline-flex rounded-full px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.11em]', status === 'published' ? 'bg-emerald-400/10 text-emerald-200' : status === 'archived' ? 'bg-zinc-500/10 text-zinc-400' : status === 'in_review' || status === 'approved' ? 'bg-sky-400/10 text-sky-200' : 'bg-orange-400/10 text-orange-200')}>{STATUS_LABELS[status] || String(status).replaceAll('_', ' ')}</span>; }
function StudioNotice({ children, tone = 'error', className = '' }) { return <p role={tone === 'error' ? 'alert' : 'status'} className={clsx('rounded-xl border px-4 py-3 text-sm', tone === 'success' ? 'border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100' : 'border-red-300/20 bg-red-300/[0.08] text-red-100', className)}>{children}</p>; }
function StudioInput({ label, value, onChange, required, className = '' }) { return <label className={clsx('grid gap-2 text-sm', className)}><span className="font-medium text-zinc-300">{label}</span><input required={required} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="h-11 rounded-xl border border-white/[0.1] bg-[var(--theme-input-background)] px-3 outline-none focus:border-orange-300/40 focus:ring-2 focus:ring-orange-300/10" /></label>; }
function StudioTextarea({ label, value, onChange, className = '' }) { return <label className={clsx('grid gap-2 text-sm', className)}><span className="font-medium text-zinc-300">{label}</span><textarea rows={3} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-white/[0.1] bg-[var(--theme-input-background)] px-3 py-2.5 leading-6 outline-none focus:border-orange-300/40 focus:ring-2 focus:ring-orange-300/10" /></label>; }
function StudioSelect({ label, value, options, onChange }) { return <label className="grid gap-2 text-sm"><span className="font-medium text-zinc-300">{label}</span><select value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="h-11 min-w-0 rounded-xl border border-white/[0.1] bg-[var(--theme-input-background)] px-3 capitalize outline-none focus:border-orange-300/40">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>; }
function CompactSelect({ label, value, options, onChange }) { return <label><span className="sr-only">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-white/[0.1] bg-[var(--theme-input-background)] px-3 text-sm outline-none focus:border-orange-300/40">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></label>; }
function StudioChipSelect({ value, options, onChange, disabled }) { return <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="h-8 max-w-44 rounded-full border border-white/[0.09] bg-white/[0.045] px-3 text-xs text-zinc-300 outline-none focus:border-orange-300/40 disabled:opacity-70">{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>; }
function InlineText({ value, onChange, disabled, placeholder, className = '', rows = 1 }) { return <textarea value={value ?? ''} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} rows={rows} className={clsx('block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-zinc-700 focus:ring-0 disabled:opacity-80', className)} />; }
function IconButton({ label, onClick, disabled, children }) { return <button type="button" onClick={onClick} disabled={disabled} className="grid h-9 w-9 place-items-center rounded-full text-zinc-400 hover:bg-white/[0.06] hover:text-white disabled:opacity-25" aria-label={label}>{children}</button>; }
function InspectorGroup({ label, children }) { return <section className="grid gap-3"><h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-zinc-600">{label}</h3>{children}</section>; }
function Segmented({ value, onChange, options }) { return <div className="grid grid-cols-3 gap-1 rounded-xl bg-[var(--theme-input-background)] p-1">{options.map(([Icon, key]) => <button key={key} type="button" onClick={() => onChange(key)} className={clsx('grid h-9 place-items-center rounded-lg', value === key ? 'bg-white/[0.1] text-orange-200' : 'text-zinc-500')} aria-label={`Align ${key}`}><Icon size={15} /></button>)}</div>; }
function formatRelativeDate(value) { if (!value) return 'Not saved'; const date = new Date(value); const days = Math.floor((Date.now() - date.getTime()) / 86400000); return days <= 0 ? 'Updated today' : days === 1 ? 'Updated yesterday' : `Updated ${days} days ago`; }
function formatDetailInput(value, kind) { if (!value) return ''; return kind === 'datetime-local' ? String(value).slice(0, 16) : value; }
function formatDetailValue(value) { if (!value) return ''; if (/^\d{4}-\d{2}-\d{2}T/.test(String(value))) return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); return String(value).replaceAll('_', ' '); }
