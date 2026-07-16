import { Cloud, Database, FileCheck2, HardDrive, LockKeyhole, RefreshCw, ShieldCheck, Unplug, UploadCloud } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
        description={mode === 'operations' ? 'See current storage use, set the R2 upload limit, and manage private-file connections.' : 'Manage your private Google Drive connection. Public website previews remain managed by Lahat Liwa.'}
      />
      {publication.loading ? <LoadingState label="Checking storage access" /> : publication.error ? <AdminNotice>{publication.error}</AdminNotice> : !allowed ? (
        <AdminNotice>This page is available to Super Admins and creatives with a published profile.</AdminNotice>
      ) : (
        <div className="grid gap-6">
          {mode !== 'operations' && <CurrentDestination />}
          {mode === 'operations' && <StorageGovernanceOverview />}
          <GoogleDriveConnection />
        </div>
      )}
    </AdminLayout>
  );
}

function CurrentDestination() {
  return (
    <AdminSurface as="section" className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-200/80">Current policy</p>
        <h2 className="mt-1.5 text-lg font-semibold text-white">Hybrid storage is active</h2>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-zinc-400">New public images use Cloudflare R2. Existing public media stays in Supabase. Assigned private originals and project files continue using Google Drive.</p>
      </div>
      <AdminStatusBadge status="active">Active</AdminStatusBadge>
    </AdminSurface>
  );
}

function StorageGovernanceOverview() {
  const [state, setState] = useState({ loading: true, snapshot: null, error: '', notice: '', busy: false });
  const [budgetGb, setBudgetGb] = useState('9');
  const requestInFlight = useRef(false);

  const load = async ({ forceRefresh = false, notice = '' } = {}) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setState((current) => ({ ...current, loading: !current.snapshot, busy: true, error: '', notice: '' }));
    try {
      const dashboard = await fetchStorageGovernanceDashboard({ forceRefresh });
      const policy = dashboard.snapshot?.policy || {};
      setBudgetGb(String(Math.round(Number(policy.budget_bytes || 0) / 1024 ** 3 * 10) / 10 || 9));
      setState({ loading: false, snapshot: dashboard.snapshot, error: '', notice, busy: false });
    } catch (error) {
      setState({ loading: false, snapshot: null, error: error.message, notice: '', busy: false });
    } finally {
      requestInFlight.current = false;
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const savePolicy = async () => {
    setState((current) => ({ ...current, busy: true, error: '', notice: '' }));
    try {
      await updateStoragePolicy({ budget_bytes: Math.round(Number(budgetGb) * 1024 ** 3) });
      await load({ forceRefresh: true, notice: 'Storage policy saved.' });
    } catch (error) {
      setState((current) => ({ ...current, busy: false, error: error.message }));
    }
  };

  const { policy = {}, providerUsage = {} } = state.snapshot || {};
  const budgetBytes = Number(policy.budget_bytes || Math.round((Number(budgetGb) || 9) * 1024 ** 3));
  const r2Reading = providerUsage.r2 || { available: false, complete: false };
  const supabaseReading = providerUsage.supabase || { available: false, complete: false };
  const providers = [
    { name: 'Supabase Storage', reading: supabaseReading, limitBytes: 1024 ** 3, limitLabel: 'Plan limit', icon: Database },
    { name: 'Cloudflare R2', reading: r2Reading, limitBytes: budgetBytes, limitLabel: 'Upload limit', icon: Cloud },
  ];

  return (
    <section aria-labelledby="website-storage-heading" className="grid min-w-0 gap-5 overflow-hidden rounded-2xl border border-white/[0.1] bg-[#090a0d] p-4 shadow-[0_28px_80px_rgba(0,0,0,0.32)] sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-200/80">Website media</p><h2 id="website-storage-heading" className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">Storage usage</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">How much space is used and how close each provider is to its limit.</p></div>
        <AdminButton className="w-full sm:w-auto" disabled={state.busy} onClick={() => load({ forceRefresh: true })}><RefreshCw size={15} className={state.busy ? 'animate-spin' : ''} />{state.busy ? 'Refreshing…' : 'Refresh'}</AdminButton>
      </div>

      {state.notice && <AdminNotice tone="success" role="status">{state.notice}</AdminNotice>}
      {state.loading ? <ProviderCardsLoading /> : !state.snapshot ? <AdminNotice role="alert">{state.error || 'Storage monitoring is currently unavailable.'}</AdminNotice> : <>
        {state.error && <AdminNotice role="alert">{state.error}</AdminNotice>}
        <div data-provider-grid className="grid min-w-0 items-start gap-4 lg:auto-rows-[18rem] lg:grid-cols-2">
          {providers.map((provider) => <ProviderCard key={provider.name} {...provider} />)}
        </div>
        <AdminSurface className="min-w-0 rounded-2xl bg-black/30">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end"><div><h3 className="text-base font-semibold text-white">R2 upload limit</h3><p className="mt-1 text-sm leading-6 text-zinc-400">New uploads stop at this limit to help control storage costs.</p></div><label className="admin-field grid min-w-0 gap-2 text-sm text-zinc-300"><span>Limit (GB)</span><input type="number" min="1" step="0.1" value={budgetGb} onChange={(event) => setBudgetGb(event.target.value)} /></label><AdminButton variant="primary" disabled={state.busy} onClick={savePolicy}>{state.busy ? 'Saving…' : 'Save'}</AdminButton></div>
        </AdminSurface>
      </>}
    </section>
  );
}

function ProviderCard({ name, reading, limitBytes, limitLabel, icon: Icon }) {
  const complete = reading.available === true && reading.complete === true;
  const usedBytes = complete ? Number(reading.totalBytes || 0) : null;
  const remainingBytes = usedBytes != null && limitBytes > 0 ? Math.max(0, limitBytes - usedBytes) : null;
  const usedPercent = usedBytes != null && limitBytes > 0 ? Math.min(100, Math.max(0, usedBytes / limitBytes * 100)) : null;
  return <AdminSurface data-provider-card className="grid h-full min-h-[18rem] min-w-0 grid-rows-[2.5rem_minmax(7rem,1fr)_auto_1.25rem] overflow-hidden rounded-2xl bg-black/30 lg:min-h-0 lg:self-stretch">
    <div className="flex min-h-10 flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-100"><Icon size={19} /></span><h3 className="break-words text-base font-semibold text-white">{name}</h3></div><AdminStatusBadge status={complete ? 'active' : 'disabled'}>{complete ? 'Live' : 'Unavailable'}</AdminStatusBadge></div>
    <div className="grid min-w-0 content-start pt-5"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Used</p><p className="mt-2 break-words text-3xl font-semibold tracking-tight text-zinc-100">{usedBytes == null ? 'Unavailable' : formatBytes(usedBytes)}</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={usedPercent == null ? `${name} usage is unavailable` : `${usedPercent.toFixed(1)} percent of the storage limit is used`}><span className="block h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-400" style={{ width: `${usedPercent || 0}%` }} /></div></div>
    <div className="grid auto-rows-fr grid-cols-2 gap-3"><DataPoint label={limitLabel} value={formatBytes(limitBytes)} /><DataPoint label="Remaining" value={remainingBytes == null ? 'Unavailable' : formatBytes(remainingBytes)} /></div>
    <p className="self-end truncate text-[10px] text-zinc-600">Updated {formatDate(reading.checkedAt)}</p>
  </AdminSurface>;
}

function DataPoint({ label, value, tone }) {
  return <div className="h-full min-w-0 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3"><p className="break-words text-[9px] uppercase tracking-[0.14em] text-zinc-500">{label}</p><p className={`mt-1.5 break-words text-sm font-semibold ${tone === 'attention' ? 'text-orange-200' : tone === 'healthy' ? 'text-emerald-200' : 'text-zinc-200'}`}>{value ?? 0}</p></div>;
}

function ProviderCardsLoading() {
  return <div data-provider-loading className="grid items-start gap-4 lg:auto-rows-[18rem] lg:grid-cols-2" aria-label="Loading provider readings">{[0, 1].map((item) => <AdminSurface key={item} className="h-full min-h-[18rem] animate-pulse rounded-2xl bg-black/30 lg:min-h-0"><div className="h-10 w-10 rounded-xl bg-white/[0.07]" /><div className="mt-6 h-4 w-36 rounded bg-white/[0.07]" /><div className="mt-5 h-9 w-44 rounded bg-white/[0.07]" /><div className="mt-6 grid grid-cols-2 gap-3"><div className="h-16 rounded-xl bg-white/[0.05]" /><div className="h-16 rounded-xl bg-white/[0.05]" /></div></AdminSurface>)}</div>;
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

function Detail({ label, value }) { return <div><dt className="text-xs uppercase tracking-[0.14em] text-zinc-600">{label}</dt><dd className="mt-1 break-words text-zinc-300">{value}</dd></div>; }
function Feature({ icon: Icon, children }) { return <span className="flex items-start gap-2"><Icon size={15} className="mt-0.5 shrink-0 text-amber-200/45" />{children}</span>; }
function formatBytes(value) { const bytes = Number(value || 0); if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`; if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`; return `${(bytes / 1024 ** 3).toFixed(2)} GB`; }
function formatDate(value) { if (!value) return 'Not checked'; const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString(); }
