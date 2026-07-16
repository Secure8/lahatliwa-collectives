import { CheckCircle2, Cloud, Database, FileCheck2, HardDrive, LockKeyhole, RefreshCw, ShieldCheck, Unplug, UploadCloud } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminNotice, AdminPageHeader, AdminStatusBadge, AdminSurface } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { useAdminAccess } from '../../lib/adminAccess';
import {
  consumeGoogleDriveOAuthResult,
  disconnectGoogleDriveConnection,
  getGoogleDriveConnectionStatus,
  googleDriveStatusLabel,
  startGoogleDriveConnection,
  uploadGoogleDriveTestFile,
  verifyGoogleDriveConnection,
} from '../../lib/googleDriveStorage';
import { STORAGE_FEATURE_FLAGS } from '../../lib/storageFeatureFlags';
import { canAccessStoragePage, storagePageMode } from '../../lib/storageAdmin';
import { supabase } from '../../lib/supabaseClient';
import { useAdminConfirmation } from '../../components/admin/AdminDialog';
import { fetchStorageGovernanceDashboard, updateStoragePolicy } from '../../lib/storageGovernance';

export default function Storage() {
  const { role, adminUser } = useAdminAccess();
  const mode = storagePageMode(role);
  const [publication, setPublication] = useState(() => ({ loading: mode === 'owner', isPublished: mode !== 'owner', error: '' }));

  useEffect(() => {
    if (mode !== 'owner' || !adminUser?.creative_member_id) {
      setPublication({ loading: false, isPublished: false, error: '' });
      return;
    }
    let active = true;
    setPublication({ loading: true, isPublished: false, error: '' });
    supabase.from('creative_members').select('is_published').eq('id', adminUser.creative_member_id).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        setPublication({ loading: false, isPublished: data?.is_published === true, error: error ? 'We could not verify the publication status of your creative profile.' : '' });
      });
    return () => { active = false; };
  }, [adminUser?.creative_member_id, mode]);

  const allowed = canAccessStoragePage({ role, creativeMemberId: adminUser?.creative_member_id, isPublished: publication.isPublished });

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow="Storage"
        title={mode === 'operations' ? 'Storage overview' : 'My storage'}
        description={mode === 'operations' ? 'Monitor website media, provider health, and private-file connections.' : 'Manage your private Google Drive connection. Public website previews remain managed by Lahat Liwa.'}
      />
      {publication.loading ? <LoadingState label="Checking storage access" /> : publication.error ? <AdminNotice>{publication.error}</AdminNotice> : !allowed ? (
        <AdminNotice>This page is available to Super Admins and creatives with a published profile.</AdminNotice>
      ) : (
        <div className="grid gap-6">
          <CurrentDestination />
          {mode === 'operations' && <StorageGovernanceOverview />}
          <GoogleDriveConnection />
          {mode === 'operations' && <OperationsOverview />}
        </div>
      )}
    </AdminLayout>
  );
}

function CurrentDestination() {
  return (
    <section className="grid gap-4 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-200/80">Current policy</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Hybrid storage is active</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">New public website images upload to Cloudflare R2. Existing public media stays safely in Supabase. Private originals and project files continue using Google Drive where assigned.</p>
      </div>
      <AdminStatusBadge status="active">Active</AdminStatusBadge>
    </section>
  );
}

function StorageGovernanceOverview() {
  const [state, setState] = useState({ loading: true, snapshot: null, error: '', notice: '', busy: false });
  const [budgetGb, setBudgetGb] = useState('9');

  const load = async (notice = '') => {
    const dashboard = await fetchStorageGovernanceDashboard();
    const policy = dashboard.snapshot?.policy || {};
    setBudgetGb(String(Math.round(Number(policy.budget_bytes || 0) / 1024 ** 3 * 10) / 10 || 9));
    setState({ loading: false, snapshot: dashboard.snapshot, error: '', notice, busy: false });
  };

  useEffect(() => { load().catch((error) => setState((current) => ({ ...current, loading: false, error: error.message }))); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const savePolicy = async () => {
    setState((current) => ({ ...current, busy: true, error: '', notice: '' }));
    try {
      await updateStoragePolicy({ budget_bytes: Math.round(Number(budgetGb) * 1024 ** 3) });
      await load('Storage policy saved.');
    } catch (error) {
      setState((current) => ({ ...current, busy: false, error: error.message }));
    }
  };

  if (state.loading) return <AdminSurface><LoadingState label="Loading storage overview" /></AdminSurface>;
  if (!state.snapshot) return <AdminNotice>{state.error || 'Storage monitoring is currently unavailable.'}</AdminNotice>;

  const { overview = {}, cleanup = {}, health = {}, policy = {}, providerUsage = {} } = state.snapshot;
  const r2Bytes = Number(overview.activeR2Bytes || 0);
  const provisionalBytes = Number(overview.provisionalBytes || 0);
  const trackedR2Bytes = r2Bytes + provisionalBytes;
  const trackedSupabaseBytes = Number(overview.activeSupabaseBytes || 0);
  const budgetBytes = Number(policy.budget_bytes || 0);
  const r2TotalBytes = providerUsage.r2?.available ? Number(providerUsage.r2.totalBytes || 0) : null;
  const supabaseTotalBytes = providerUsage.supabase?.available ? Number(providerUsage.supabase.totalBytes || 0) : null;
  const usedPercent = r2TotalBytes != null && budgetBytes ? r2TotalBytes / budgetBytes * 100 : null;
  const providers = [
    { name: 'Cloudflare R2', totalBytes: r2TotalBytes, trackedBytes: trackedR2Bytes, objectCount: providerUsage.r2?.objectCount, checkedAt: providerUsage.r2?.checkedAt, purpose: 'Actual bucket usage', icon: Cloud, tone: 'bright' },
    { name: 'Supabase Storage', totalBytes: supabaseTotalBytes, trackedBytes: trackedSupabaseBytes, objectCount: providerUsage.supabase?.objectCount, checkedAt: providerUsage.supabase?.checkedAt, purpose: 'All Storage buckets', icon: Database, tone: 'soft' },
    { name: 'Google Drive', totalBytes: Number(overview.activeDriveBytes || 0), trackedBytes: null, purpose: 'Lahat Liwa tracked files', icon: HardDrive, tone: 'warm', trackedOnly: true },
  ];
  const signals = [
    ['Missing objects', Number(health.missingObjects || 0)],
    ['Unverified uploads', Number(health.unverifiedUploads || 0)],
    ['Failed checks', Number(health.failedVerifications || 0)],
    ['Cleanup queued', Number(cleanup.queued || cleanup.queuedObjects || 0)],
  ];

  return (
    <section aria-labelledby="website-storage-heading" className="relative isolate grid gap-7 overflow-hidden rounded-2xl border border-white/[0.1] bg-[#090a0d] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.32)] sm:p-7">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_0%,rgba(251,191,36,0.12),transparent_31%)]" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-200/80">Website media</p><h2 id="website-storage-heading" className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">Provider overview</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Live provider totals and Lahat Liwa records, clearly separated.</p></div>
        <AdminButton disabled={state.busy} onClick={() => load()}><RefreshCw size={15} /> Refresh</AdminButton>
      </div>

      {state.notice && <AdminNotice tone="success" role="status">{state.notice}</AdminNotice>}
      {state.error && <AdminNotice role="alert">{state.error}</AdminNotice>}

      <div className="grid gap-4 lg:grid-cols-3">
        {providers.map((provider) => <ProviderCard key={provider.name} {...provider} />)}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminSurface className="rounded-2xl bg-black/30">
          <div className="flex items-start justify-between gap-4"><div><h3 className="text-base font-semibold text-white">R2 bucket usage</h3><p className="mt-1 text-xs text-zinc-500">Current bucket size against the saved budget</p></div><strong className="text-2xl font-semibold tracking-tight text-amber-200">{usedPercent == null ? '—' : `${usedPercent.toFixed(1)}%`}</strong></div>
          <div className="mt-8 h-2 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={usedPercent == null ? 'R2 bucket usage is unavailable' : `${usedPercent.toFixed(1)} percent of the R2 storage budget is used`}><span className="block h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-400" style={{ width: `${usedPercent == null ? 0 : Math.min(100, Math.max(0, usedPercent))}%` }} /></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3"><DataPoint label="Bucket total" value={r2TotalBytes == null ? 'Unavailable' : formatBytes(r2TotalBytes)} /><DataPoint label="App tracked" value={formatBytes(trackedR2Bytes)} /><DataPoint label="Budget" value={formatBytes(budgetBytes)} /></div>
        </AdminSurface>
        <AdminSurface className="rounded-2xl bg-black/30">
          <div className="flex items-start justify-between gap-4"><div><h3 className="text-base font-semibold text-white">Provider health</h3><p className="mt-1 text-xs text-zinc-500">Recorded findings only</p></div><span className={`mt-1 h-2.5 w-2.5 rounded-full ${signals.some(([, value]) => value > 0) ? 'bg-orange-400 shadow-[0_0_14px_rgba(251,146,60,0.5)]' : 'bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.45)]'}`} aria-hidden="true" /></div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{signals.map(([label, value]) => <DataPoint key={label} label={label} value={value} tone={value ? 'attention' : 'healthy'} />)}</div>
          <p className="mt-5 text-xs text-zinc-600">Checked {formatDate(health.lastReconciliation)}</p>
        </AdminSurface>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminSurface className="rounded-2xl bg-black/30">
          <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-100"><ShieldCheck size={18} /></span><div><h3 className="text-sm font-semibold text-white">Existing Supabase media</h3><p className="mt-1 text-sm leading-6 text-zinc-400">Published Supabase files remain in place and continue serving the public website. They are monitored but are not automatically moved to R2.</p></div></div>
          <div className="mt-5 grid grid-cols-2 gap-3"><DataPoint label="Automatic movement" value="Off" tone="healthy" /><DataPoint label="Existing files" value="Unchanged" tone="healthy" /><DataPoint label="Monitoring" value="Active" tone="healthy" /><DataPoint label="New uploads" value="R2" tone="healthy" /></div>
        </AdminSurface>
        <AdminSurface className="rounded-2xl bg-black/30">
          <h3 className="text-sm font-semibold text-white">R2 capacity</h3><p className="mt-1 text-xs leading-5 text-zinc-500">Capacity safeguard for new website uploads.</p>
          <div className="mt-5 grid gap-4">
            <label className="admin-field grid gap-2 text-sm text-zinc-300"><span>R2 budget (GB)</span><input type="number" min="1" step="0.1" value={budgetGb} onChange={(event) => setBudgetGb(event.target.value)} /></label>
          </div>
          <AdminButton className="mt-5" variant="primary" disabled={state.busy} onClick={savePolicy}>{state.busy ? 'Saving…' : 'Save'}</AdminButton>
        </AdminSurface>
      </div>
    </section>
  );
}

function ProviderCard({ name, totalBytes, trackedBytes, objectCount, checkedAt, purpose, icon: Icon, tone, trackedOnly = false }) {
  const available = totalBytes != null;
  const trackedPercent = available && trackedBytes != null && totalBytes > 0 ? Math.min(100, Math.max(0, trackedBytes / totalBytes * 100)) : 0;
  const toneClass = tone === 'warm' ? 'text-orange-300 bg-orange-300/10' : 'text-amber-200 bg-amber-300/10';
  return <AdminSurface className="relative overflow-hidden rounded-2xl bg-black/30"><span className="absolute inset-y-0 left-0 w-0.5 bg-amber-300" /><div className="flex items-start justify-between gap-3"><span className={`grid h-10 w-10 place-items-center rounded-xl ${toneClass}`}><Icon size={19} /></span>{available ? <CheckCircle2 size={17} className="text-emerald-300" aria-label="Usage available" /> : <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-200">Unavailable</span>}</div><div className="mt-6"><p className="text-sm font-semibold text-white">{name}</p><p className="mt-1 text-xs text-zinc-500">{purpose}</p></div><p className="mt-5 text-3xl font-semibold tracking-tight text-zinc-100">{available ? formatBytes(totalBytes) : '—'}</p><p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-zinc-600">{trackedOnly ? 'Tracked by Lahat Liwa' : 'Provider total'}</p>{trackedBytes != null && <><div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`${trackedPercent.toFixed(1)} percent of this provider total is represented in the Lahat Liwa ledger`}><span className="block h-full rounded-full bg-amber-300" style={{ width: `${trackedPercent}%` }} /></div><p className="mt-2 text-xs text-zinc-500">Lahat Liwa ledger <span className="text-zinc-300">{formatBytes(trackedBytes)}</span></p></>}{objectCount != null && <p className="mt-2 text-xs text-zinc-600">{Number(objectCount).toLocaleString()} objects</p>}{checkedAt && <p className="mt-1 text-[10px] text-zinc-700">Checked {formatDate(checkedAt)}</p>}</AdminSurface>;
}

function DataPoint({ label, value, tone }) {
  return <div className="min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3"><p className="truncate text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</p><p className={`mt-1.5 truncate text-sm font-semibold ${tone === 'attention' ? 'text-orange-200' : tone === 'healthy' ? 'text-emerald-200' : 'text-zinc-200'}`}>{value ?? 0}</p></div>;
}

function GoogleDriveConnection() {
  const { requestConfirmation, confirmationDialog } = useAdminConfirmation();
  const [state, setState] = useState({ loading: true, configured: false, testUploadEnabled: false, connection: null, notice: null, actionError: '', busy: '' });
  const clientGateEnabled = STORAGE_FEATURE_FLAGS.googleDriveConnectorEnabled;

  const loadStatus = async (notice = null) => {
    if (!clientGateEnabled) { setState((current) => ({ ...current, loading: false, configured: false, notice })); return; }
    try {
      const data = await getGoogleDriveConnectionStatus();
      setState((current) => ({ ...current, loading: false, configured: data.configured === true, testUploadEnabled: data.testUploadEnabled === true, connection: data.connection, notice, actionError: '', busy: '' }));
    } catch (error) { setState((current) => ({ ...current, loading: false, configured: false, notice, actionError: error.message, busy: '' })); }
  };

  useEffect(() => { loadStatus(consumeGoogleDriveOAuthResult()); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (action, callback) => {
    setState((current) => ({ ...current, busy: action, actionError: '' }));
    try {
      const result = await callback();
      if (action === 'connect') return;
      if (action === 'disconnect') setState((current) => ({ ...current, busy: '', connection: null, notice: { tone: 'success', message: 'Google Drive disconnected. Existing folders and files were not deleted.' } }));
      else setState((current) => ({ ...current, busy: '', connection: result.connection, notice: { tone: 'success', message: 'Google Drive access and folders were verified.' } }));
    } catch (error) { setState((current) => ({ ...current, busy: '', actionError: error.message })); }
  };

  const connection = state.connection;
  const reconnect = connection && ['pending', 'reconnect_required', 'error'].includes(connection.status);
  const canConnect = clientGateEnabled && state.configured && !state.loading;
  const disabledReason = !clientGateEnabled ? 'The Google Drive connector is disabled in this website build.' : !state.configured ? 'The secure Google Drive service is not configured on the server.' : '';

  return (
    <AdminSurface aria-labelledby="google-drive-heading">
      <div className="grid gap-5 sm:grid-cols-[3rem_minmax(0,1fr)]">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-300/10 text-amber-100" aria-hidden="true"><Cloud size={22} /></span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3"><h2 id="google-drive-heading" className="text-lg font-semibold text-white">Google Drive</h2><AdminStatusBadge status={connection?.status || 'disabled'}>{googleDriveStatusLabel(connection?.status)}</AdminStatusBadge></div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Private originals, project files, profile media, and archives stay separate from public website previews.</p>
          <div className="mt-5 grid gap-2 text-sm text-zinc-500 sm:grid-cols-2"><Feature icon={HardDrive}>Managed Lahat Liwa folders</Feature><Feature icon={ShieldCheck}>Restricted Drive access</Feature><Feature icon={FileCheck2}>Connection checks only</Feature><Feature icon={LockKeyhole}>Server-side credentials</Feature></div>
          {state.loading ? <div className="mt-6"><LoadingState label="Checking Google Drive connection" /></div> : <>
            {state.notice && <AdminNotice aria-live="polite" tone={state.notice.tone} className="mt-6">{state.notice.message}</AdminNotice>}
            {connection && <ConnectionDetails connection={connection} />}
            {connection?.status === 'connected' && STORAGE_FEATURE_FLAGS.googleDriveTestUploadEnabled && state.testUploadEnabled && <GoogleDriveTestUpload />}
            <div className="mt-6 flex flex-wrap gap-3">
              {!connection && <AdminButton variant="primary" disabled={!canConnect || Boolean(state.busy)} aria-describedby={disabledReason ? 'google-drive-disabled-reason' : undefined} onClick={() => run('connect', () => startGoogleDriveConnection())}>Connect</AdminButton>}
              {reconnect && <AdminButton variant="primary" disabled={!canConnect || Boolean(state.busy)} onClick={() => run('connect', () => startGoogleDriveConnection(connection.id))}>Reconnect</AdminButton>}
              {connection?.status === 'connected' && <AdminButton disabled={Boolean(state.busy)} onClick={() => run('verify', verifyGoogleDriveConnection)}><RefreshCw size={16} />{state.busy === 'verify' ? 'Checking…' : 'Check'}</AdminButton>}
            </div>
            {disabledReason && <p id="google-drive-disabled-reason" className="mt-2 text-xs leading-5 text-zinc-500">{disabledReason}</p>}
            {state.actionError && <AdminNotice aria-live="assertive" className="mt-3">{state.actionError}</AdminNotice>}
            {connection && <DisconnectSection connection={connection} busy={state.busy} onDisconnect={() => requestConfirmation({ title: 'Disconnect Google Drive?', description: 'Saved authorization will be removed. Files and folders in Drive will remain.', confirmLabel: 'Disconnect', destructive: true, onConfirm: () => run('disconnect', () => disconnectGoogleDriveConnection(connection.id)) })} />}
          </>}
        </div>
      </div>
      {confirmationDialog}
    </AdminSurface>
  );
}

function GoogleDriveTestUpload() {
  const [file, setFile] = useState(null);
  const [state, setState] = useState({ busy: false, error: '', uploaded: null });
  const submit = async (event) => {
    event.preventDefault(); const form = event.currentTarget; setState({ busy: true, error: '', uploaded: null });
    try { const result = await uploadGoogleDriveTestFile(file); setState({ busy: false, error: '', uploaded: result.media }); setFile(null); form.reset(); }
    catch (error) { setState({ busy: false, error: error.message, uploaded: null }); }
  };
  return <form onSubmit={submit} className="mt-6 rounded-xl border border-amber-200/10 bg-amber-100/[0.025] p-4"><div className="flex items-start gap-3"><UploadCloud size={18} className="mt-0.5 shrink-0 text-amber-200" /><div><h3 className="text-sm font-semibold text-white">Test Drive upload</h3><p id="google-drive-test-help" className="mt-1 text-xs leading-5 text-zinc-500">Upload one private JPEG, PNG, WebP, or PDF up to 2 MB. It will not appear on the website.</p></div></div><div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"><label htmlFor="google-drive-test-file" className="sr-only">Choose a Drive test file</label><input id="google-drive-test-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" aria-invalid={Boolean(state.error)} aria-describedby="google-drive-test-help" onChange={(event) => { setFile(event.target.files?.[0] || null); setState({ busy: false, error: '', uploaded: null }); }} className="min-w-0 flex-1 text-sm text-zinc-400 file:mr-3 file:rounded-lg file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-100" /><AdminButton type="submit" variant="primary" disabled={!file || state.busy}>{state.busy ? 'Uploading…' : 'Upload'}</AdminButton></div>{state.error && <AdminNotice className="mt-4">{state.error}</AdminNotice>}{state.uploaded && <AdminNotice tone="success" className="mt-4">{state.uploaded.filename} was uploaded to Drive. Public media is unchanged.</AdminNotice>}</form>;
}

function ConnectionDetails({ connection }) {
  return <dl className="mt-6 grid gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-4 text-sm sm:grid-cols-2"><Detail label="Account" value={connection.accountEmail || 'Google account'} /><Detail label="Folders" value={connection.rootFolderHealth === 'healthy' ? 'Ready' : 'Needs attention'} /><Detail label="Connected" value={formatDate(connection.connectedAt)} /><Detail label="Last checked" value={formatDate(connection.lastVerifiedAt)} />{connection.lastErrorMessage && <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-[0.14em] text-zinc-600">Needs attention</dt><dd className="mt-1 text-red-200">{connection.lastErrorMessage}</dd></div>}</dl>;
}

function DisconnectSection({ connection, busy, onDisconnect }) {
  return <details className="mt-7 border-t border-red-300/10 pt-5"><summary className="text-sm text-zinc-400">Connection options</summary><div className="mt-4 rounded-xl border border-red-300/15 bg-red-300/[0.025] p-4"><h3 className="text-sm font-semibold text-red-100">Disconnect Drive</h3><p className="mt-2 text-xs leading-5 text-zinc-500">Authorization will be revoked. Drive files and folders will not be deleted.</p><AdminButton variant="danger" className="mt-4" disabled={Boolean(busy) || ['revoked', 'disabled'].includes(connection.status)} onClick={onDisconnect}><Unplug size={16} />{busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}</AdminButton></div></details>;
}

function OperationsOverview() {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  useEffect(() => { let active = true; supabase.from('storage_connection_operations').select('*').order('updated_at', { ascending: false }).then(({ data, error }) => { if (active) setState({ loading: false, rows: data || [], error: error ? 'Connection status is currently unavailable.' : '' }); }); return () => { active = false; }; }, []);
  const metrics = useMemo(() => [['Connected', state.rows.filter((row) => row.status === 'connected').length], ['Reconnect', state.rows.filter((row) => row.status === 'reconnect_required').length], ['Attention', state.rows.filter((row) => row.status === 'error').length], ['Drive accounts', state.rows.filter((row) => row.provider === 'google_drive').length]], [state.rows]);
  return <AdminSurface aria-labelledby="operations-heading"><div className="flex items-center gap-3"><Database size={19} className="text-amber-200" /><h2 id="operations-heading" className="text-lg font-semibold text-white">Connection overview</h2></div><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">Safe account and connection status only. Tokens and private folder identifiers are never shown.</p>{state.loading ? <div className="mt-5"><LoadingState label="Loading connections" /></div> : state.error ? <AdminNotice className="mt-5">{state.error}</AdminNotice> : <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map(([label, value]) => <DataPoint key={label} label={label} value={value} />)}</div>}</AdminSurface>;
}

function Detail({ label, value }) { return <div><dt className="text-xs uppercase tracking-[0.14em] text-zinc-600">{label}</dt><dd className="mt-1 break-words text-zinc-300">{value}</dd></div>; }
function Feature({ icon: Icon, children }) { return <span className="flex items-start gap-2"><Icon size={15} className="mt-0.5 shrink-0 text-amber-200/45" />{children}</span>; }
function formatBytes(value) { const bytes = Number(value || 0); if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`; if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`; return `${(bytes / 1024 ** 3).toFixed(2)} GB`; }
function formatDate(value) { if (!value) return 'Not checked'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString(); }
