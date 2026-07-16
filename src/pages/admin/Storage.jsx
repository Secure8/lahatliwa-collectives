import { AlertTriangle, Cloud, Database, FileCheck2, HardDrive, LockKeyhole, Pause, Play, RefreshCw, ScanSearch, ShieldCheck, Unplug, UploadCloud } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminNotice, AdminPageHeader, AdminStatusBadge } from '../../components/admin/AdminUI';
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
import {
  discoverPublicMediaMigration,
  fetchStorageGovernanceDashboard,
  inspectPublicMediaMigration,
  listPublicMediaMigrations,
  markPublicMediaMigrationManualReview,
  pausePublicMediaMigration,
  processPublicMediaMigrationBatch,
  reconcilePublicMediaProviders,
  resumePublicMediaMigration,
  retryPublicMediaMigration,
  updateStoragePolicy,
  verifyPublicMediaMigration,
} from '../../lib/storageGovernance';

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
        setPublication({
          loading: false,
          isPublished: data?.is_published === true,
          error: error ? 'We could not verify the publication status of your creative profile.' : '',
        });
      });
    return () => { active = false; };
  }, [adminUser?.creative_member_id, mode]);

  const allowed = canAccessStoragePage({ role, creativeMemberId: adminUser?.creative_member_id, isPublished: publication.isPublished });

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow="External storage"
        title={mode === 'operations' ? 'Storage' : 'My Storage'}
        description={mode === 'operations'
          ? 'Monitor safe provider connection metadata and manage your own Google Drive connection.'
          : 'Connect your Google Drive for future original-file storage while public previews remain managed by Lahat Liwa.'}
      />
      {publication.loading ? <LoadingState label="Checking storage access" /> : publication.error ? (
        <AdminNotice>{publication.error}</AdminNotice>
      ) : !allowed ? (
        <AdminNotice>This page is available to Super Admins and creatives with a published profile.</AdminNotice>
      ) : (
        <div className="grid gap-8">
          <CurrentDestination />
          {mode === 'operations' && <StorageGovernanceOverview />}
          <GoogleDriveConnection />
          {mode === 'operations' && <OperationsOverview />}
          <AdminNotice tone="success">Normal project, profile, and site images use the unified website uploader. The optional Drive test below does not change public media references.</AdminNotice>
        </div>
      )}
    </AdminLayout>
  );
}

function CurrentDestination() {
  return (
    <section className="grid gap-4 py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-200/80">Current upload destination</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Lahat Liwa storage</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Project, profile, and site images use one managed website-media flow with a safe rollout fallback. The isolated Drive test does not replace or migrate them.</p>
      </div>
      <AdminStatusBadge status="active">Active</AdminStatusBadge>
    </section>
  );
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function StorageGovernanceOverview() {
  const [state, setState] = useState({ loading: true, snapshot: null, migrations: [], detail: null, error: '', notice: '', busy: '' });
  const [budgetGb, setBudgetGb] = useState('9');
  const [retentionDays, setRetentionDays] = useState('30');

  const load = async (notice = '') => {
    const [dashboard, migrations] = await Promise.all([fetchStorageGovernanceDashboard(), listPublicMediaMigrations({ pageSize: 8 })]);
    const policy = dashboard.snapshot?.policy || {};
    setBudgetGb(String(Math.round(Number(policy.budget_bytes || 0) / 1024 ** 3 * 10) / 10 || 9));
    setRetentionDays(String(policy.migration_retention_days || 30));
    setState({ loading: false, snapshot: dashboard.snapshot, migrations: migrations.rows || [], detail: null, error: '', notice, busy: '' });
  };

  useEffect(() => { load().catch((error) => setState((current) => ({ ...current, loading: false, error: error.message }))); }, []);

  const run = async (busy, action, success) => {
    setState((current) => ({ ...current, busy, error: '', notice: '' }));
    try { const result = await action(); await load(typeof success === 'function' ? success(result) : success); }
    catch (error) { setState((current) => ({ ...current, busy: '', error: error.message })); }
  };

  const inspect = async (id) => {
    setState((current) => ({ ...current, busy: `inspect-${id}`, error: '', notice: '' }));
    try {
      const detail = await inspectPublicMediaMigration(id);
      setState((current) => ({ ...current, detail, busy: '' }));
    } catch (error) {
      setState((current) => ({ ...current, busy: '', error: error.message }));
    }
  };

  if (state.loading) return <section className="py-6"><LoadingState label="Loading public media storage" /></section>;
  if (!state.snapshot) return <section className="py-6"><AdminNotice>{state.error || 'Public media storage monitoring is unavailable until the governance migration and Edge Functions are deployed.'}</AdminNotice></section>;

  const { overview = {}, migration = {}, cleanup = {}, health = {}, policy = {}, breakdowns = {}, largestProjects = [], largestCreatives = [], largestOwners = [] } = state.snapshot;
  const consumed = Number(overview.activeR2Bytes || 0) + Number(overview.provisionalBytes || 0) + Number(policy.reserve_bytes || 0);
  const percent = Number(policy.budget_bytes || 0) ? consumed / Number(policy.budget_bytes) * 100 : 0;
  const safety = percent >= Number(policy.block_percent || 100) ? 'Blocked' : percent >= Number(policy.pause_non_admin_percent || 95) ? 'Paused' : percent >= Number(policy.strong_warning_percent || 85) ? 'Strong warning' : percent >= Number(policy.warning_percent || 75) ? 'Warning' : percent >= Number(policy.info_percent || 60) ? 'Information' : 'Normal';
  const overviewMetrics = [
    ['Active R2', formatBytes(overview.activeR2Bytes)], ['Legacy Supabase', formatBytes(overview.activeSupabaseBytes)],
    ['Legacy Drive', formatBytes(overview.activeDriveBytes)], ['Rollback duplicates', formatBytes(overview.duplicatedMigrationBytes)],
    ['Total public media', formatBytes(overview.totalPublicMediaBytes)],
    ['Remaining budget', formatBytes(Math.max(0, Number(policy.budget_bytes || 0) - consumed))], ['R2 objects', overview.r2ObjectCount || 0],
    ['Supabase objects', overview.supabaseObjectCount || 0], ['Media groups', overview.mediaGroupCount || 0], ['Active derivatives', overview.activeDerivativeCount || 0],
  ];
  const migrationMetrics = [
    ['Eligible', migration.eligible || 0], ['Completed', migration.completed || 0], ['In progress', migration.inProgress || 0],
    ['Failed', migration.failed || 0], ['Manual review', migration.manualReview || 0], ['Unique source', formatBytes(migration.uniqueSourceBytes)],
    ['Generated R2', formatBytes(migration.destinationBytes)], ['Retained source', formatBytes(migration.retainedSourceBytes)],
    ['Queued deletion', formatBytes(migration.queuedDeletionBytes)], ['Remaining records', migration.estimatedRemainingRecords || 0],
  ];

  return (
    <section aria-labelledby="public-media-storage-heading" className="grid gap-7 rounded-xl border border-white/[0.09] bg-white/[0.02] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-200/80">Super Admin · internally tracked</p><h2 id="public-media-storage-heading" className="mt-2 text-xl font-semibold text-white">Public media storage</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Provider-verified object sizes where available. These figures describe the application ledger, not exact Cloudflare billing.</p></div>
        <AdminStatusBadge status={safety === 'Normal' ? 'active' : 'warning'}>{safety} · {percent.toFixed(1)}%</AdminStatusBadge>
      </div>
      {state.error && <AdminNotice>{state.error}</AdminNotice>}{state.notice && <AdminNotice tone="success">{state.notice}</AdminNotice>}

      <div className="grid gap-px overflow-hidden rounded-lg bg-white/[0.08] sm:grid-cols-2 xl:grid-cols-4">{overviewMetrics.map(([label,value])=><Metric key={label} label={label} value={value} />)}</div>
      <p className="text-xs text-zinc-600">Last synchronized: {formatDate(overview.lastSynchronizedAt)} · Configured budget: {formatBytes(policy.budget_bytes)} · Reserve: {formatBytes(policy.reserve_bytes)}</p>

      <div className="grid gap-4 border-y border-white/[0.08] py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-zinc-400">R2 budget in GB<input type="number" min="1" step="0.5" value={budgetGb} onChange={(event)=>setBudgetGb(event.target.value)} className="border-0 border-b border-white/[0.12] bg-transparent py-2 text-white outline-none focus:border-amber-200/60" /></label>
          <label className="grid gap-2 text-sm text-zinc-400">Source rollback retention days<input type="number" min="1" max="365" value={retentionDays} onChange={(event)=>setRetentionDays(event.target.value)} className="border-0 border-b border-white/[0.12] bg-transparent py-2 text-white outline-none focus:border-amber-200/60" /></label>
        </div>
        <AdminButton disabled={Boolean(state.busy)} onClick={()=>run('policy',()=>updateStoragePolicy({budget_bytes:Math.round(Number(budgetGb)*1024**3),migration_retention_days:Number(retentionDays)}),'Storage policy updated and audited.')}>Save policy</AdminButton>
      </div>

      <div><h3 className="text-base font-semibold text-white">Migration</h3><p className="mt-1 text-sm text-zinc-500">Unique source files and generated derivatives are shown separately. Batches are deliberately small and resumable.</p></div>
      <div className="grid gap-px overflow-hidden rounded-lg bg-white/[0.08] sm:grid-cols-2 xl:grid-cols-4">{migrationMetrics.map(([label,value])=><Metric key={label} label={label} value={value} />)}</div>
      <div className="flex flex-wrap gap-2">
        <AdminButton disabled={Boolean(state.busy)} onClick={()=>run('discover',()=>discoverPublicMediaMigration(50),(result)=>`${result.result.created} eligible media references registered; ${result.result.manualReview} require manual review.`)}><ScanSearch size={16}/> Preview eligible media</AdminButton>
        {policy.migration_paused ? <AdminButton variant="primary" disabled={Boolean(state.busy)} onClick={()=>run('resume',resumePublicMediaMigration,'Migration resumed.')}><Play size={16}/> Resume</AdminButton> : <AdminButton disabled={Boolean(state.busy)} onClick={()=>run('pause',pausePublicMediaMigration,'Migration paused after the current bounded request.')}><Pause size={16}/> Pause</AdminButton>}
        <AdminButton variant="primary" disabled={Boolean(state.busy)||policy.migration_paused} onClick={()=>run('batch',()=>processPublicMediaMigrationBatch(policy.migration_batch_size),(result)=>`${result.result.claimed} migration records processed.`)}><Play size={16}/> Start bounded batch</AdminButton>
        <AdminButton disabled={Boolean(state.busy)} onClick={()=>run('reconcile',reconcilePublicMediaProviders,(result)=>{const findings=Number(result.providers?.r2?.findings||0)+Number(result.providers?.supabase?.findings||0);return `Reconciliation completed with ${findings} recorded findings. No suspected orphan was deleted.`;})}><RefreshCw size={16}/> Run reconciliation</AdminButton>
      </div>

      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase tracking-[0.12em] text-zinc-600"><tr><th className="py-2 pr-4">Source</th><th className="py-2 pr-4">State</th><th className="py-2 pr-4">Source bytes</th><th className="py-2 pr-4">R2 bytes</th><th className="py-2">Actions</th></tr></thead><tbody className="divide-y divide-white/[0.07]">{state.migrations.map((row)=><tr key={row.id}><td className="py-3 pr-4 text-zinc-300">{row.sourceName}</td><td className="py-3 pr-4 text-zinc-400">{row.status.replaceAll('_',' ')}</td><td className="py-3 pr-4 text-zinc-500">{formatBytes(row.sourceBytes)}</td><td className="py-3 pr-4 text-zinc-500">{formatBytes(row.destinationBytes)}</td><td className="py-3"><div className="flex flex-wrap gap-3"><button type="button" onClick={()=>inspect(row.id)} className="text-zinc-300 hover:text-white">Inspect</button>{['failed','manual_review'].includes(row.status)&&<button type="button" onClick={()=>run(`retry-${row.id}`,()=>retryPublicMediaMigration(row.id),'Migration queued for retry.')} className="text-amber-200 hover:text-amber-100">Retry</button>}{!['manual_review','completed','cancelled','rolled_back'].includes(row.status)&&<button type="button" onClick={()=>run(`review-${row.id}`,()=>markPublicMediaMigrationManualReview(row.id,'Flagged by Super Admin for manual inspection.'),'Migration moved to manual review.')} className="text-zinc-400 hover:text-white">Manual review</button>}{['verified','activated','retained_for_rollback','completed'].includes(row.status)&&<button type="button" onClick={()=>run(`verify-${row.id}`,()=>verifyPublicMediaMigration(row.id),'All three registered destination variants are verified.')} className="text-emerald-300 hover:text-emerald-200">Verify</button>}</div></td></tr>)}</tbody></table></div>

      {state.detail&&<div className="rounded-lg border border-white/[0.08] bg-black/15 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">Migration inspection</p><h4 className="mt-1 text-sm font-semibold text-white">{state.detail.migration?.sourceName}</h4></div><button type="button" onClick={()=>setState((current)=>({...current,detail:null}))} className="text-xs text-zinc-400 hover:text-white">Close</button></div><dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">{[['State',state.detail.migration?.status?.replaceAll('_',' ')],['Source provider',state.detail.migration?.sourceProvider],['Destination',state.detail.migration?.destinationProvider],['Retention deadline',formatDate(state.detail.migration?.retainSourceUntil)],['Source cleanup',state.detail.migration?.sourceDeletedAt?'deleted':state.detail.migration?.sourceCleanupQueuedAt?'queued':'not queued'],['Attempts',state.detail.migration?.attemptCount],['Source bytes',formatBytes(state.detail.migration?.sourceBytes)],['Destination bytes',formatBytes(state.detail.migration?.destinationBytes)]].map(([label,value])=><div key={label}><dt className="text-zinc-600">{label}</dt><dd className="mt-1 capitalize text-zinc-300">{value??'—'}</dd></div>)}</dl><div className="mt-4 grid gap-2 sm:grid-cols-3">{(state.detail.objects||[]).map((object)=><div key={object.id} className="rounded-md bg-white/[0.025] p-3 text-xs"><p className="capitalize text-zinc-300">{object.media_variant||'source'}</p><p className="mt-1 text-zinc-600">{object.provider} · {object.verification_status} · {formatBytes(object.trusted_size_bytes)}</p></div>)}</div>{state.detail.migration?.statusMessage&&<p className="mt-4 text-xs leading-5 text-amber-100">{state.detail.migration.statusMessage}</p>}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <UsageCard title="Largest projects" rows={largestProjects.map((row)=>[row.title||'Untitled project',formatBytes(row.bytes)])}/>
        <UsageCard title="Largest creatives" rows={largestCreatives.map((row)=>[row.name||'Unlinked creative',formatBytes(row.bytes)])}/>
        <UsageCard title="Largest owners" rows={largestOwners.map((row)=>[row.display_name||'Unlabeled owner',formatBytes(row.bytes)])}/>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <UsageCard title="By provider" rows={(breakdowns.provider||[]).map((row)=>[row.provider,formatBytes(row.bytes)])}/>
        <UsageCard title="By category" rows={(breakdowns.category||[]).map((row)=>[String(row.category).replaceAll('_',' '),formatBytes(row.bytes)])}/>
        <UsageCard title="By variant" rows={(breakdowns.variant||[]).map((row)=>[row.variant,formatBytes(row.bytes)])}/>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <HealthCard title="Cleanup" rows={[["Pending jobs",cleanup.pendingJobs],["Retrying",cleanup.retryingJobs],["Manual review",cleanup.manualReviewJobs],["Recoverable",formatBytes(cleanup.recoverableBytes)]]}/>
        <HealthCard title="Provider health" rows={[["Missing objects",health.missingObjects],["Orphan findings",health.orphanedObjects],["Unverified",health.unverifiedUploads],["Failed verification",health.failedVerifications],["Last reconciliation",formatDate(health.lastReconciliation)]]}/>
        <HealthCard title="Tracked lifecycle" rows={(breakdowns.lifecycle||[]).slice(0,4).map((row)=>[String(row.state).replaceAll('_',' '),formatBytes(row.bytes)])}/>
      </div>
      {(Number(health.missingObjects||0)>0||Number(health.orphanedObjects||0)>0||Number(cleanup.manualReviewJobs||0)>0)&&<div className="flex items-start gap-3 rounded-lg border border-amber-200/15 bg-amber-200/[0.035] p-4 text-sm leading-6 text-zinc-300"><AlertTriangle className="mt-0.5 shrink-0 text-amber-200" size={18}/><span>Storage health needs review. Reconciliation findings are detect-and-recheck records; they do not immediately delete objects.</span></div>}
    </section>
  );
}

function Metric({label,value}){return <div className="bg-zinc-950/80 p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">{label}</p><p className="mt-2 text-xl font-semibold text-white">{value}</p></div>;}
function HealthCard({title,rows}){return <div className="rounded-lg border border-white/[0.08] p-4"><h4 className="text-sm font-semibold text-white">{title}</h4><dl className="mt-3 grid gap-2">{rows.map(([label,value])=><div key={label} className="flex items-start justify-between gap-4 text-xs"><dt className="capitalize text-zinc-500">{label}</dt><dd className="text-right text-zinc-300">{value??0}</dd></div>)}</dl></div>;}
function UsageCard({title,rows}){return <div className="rounded-lg border border-white/[0.08] p-4"><h4 className="text-sm font-semibold text-white">{title}</h4>{rows.length?<dl className="mt-3 grid gap-2">{rows.slice(0,5).map(([label,value],index)=><div key={`${label}-${index}`} className="flex items-start justify-between gap-4 text-xs"><dt className="truncate capitalize text-zinc-500">{label}</dt><dd className="shrink-0 text-zinc-300">{value}</dd></div>)}</dl>:<p className="mt-3 text-xs text-zinc-600">No tracked usage yet.</p>}</div>;}

function GoogleDriveConnection() {
  const { requestConfirmation, confirmationDialog } = useAdminConfirmation();
  const [state, setState] = useState({ loading: true, configured: false, testUploadEnabled: false, connection: null, notice: null, actionError: '', busy: '' });
  const clientGateEnabled = STORAGE_FEATURE_FLAGS.googleDriveConnectorEnabled;

  const loadStatus = async (notice = null) => {
    if (!clientGateEnabled) {
      setState((current) => ({ ...current, loading: false, configured: false, notice }));
      return;
    }
    try {
      const data = await getGoogleDriveConnectionStatus();
      setState((current) => ({ ...current, loading: false, configured: data.configured === true, testUploadEnabled: data.testUploadEnabled === true, connection: data.connection, notice, actionError: '', busy: '' }));
    } catch (error) {
      setState((current) => ({ ...current, loading: false, configured: false, notice, actionError: error.message, busy: '' }));
    }
  };

  useEffect(() => {
    const callbackNotice = consumeGoogleDriveOAuthResult();
    loadStatus(callbackNotice);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (action, callback) => {
    setState((current) => ({ ...current, busy: action, actionError: '' }));
    try {
      const result = await callback();
      if (action === 'connect') return;
      if (action === 'disconnect') {
        setState((current) => ({ ...current, busy: '', connection: null, notice: { tone: 'success', message: 'Google Drive has been disconnected. Existing Drive folders and files were not deleted.' } }));
      } else {
        setState((current) => ({ ...current, busy: '', connection: result.connection, notice: { tone: 'success', message: 'Google Drive access and the managed folder were verified.' } }));
      }
    } catch (error) {
      setState((current) => ({ ...current, busy: '', actionError: error.message }));
    }
  };

  const connection = state.connection;
  const reconnect = connection && ['pending', 'reconnect_required', 'error'].includes(connection.status);
  const canConnect = clientGateEnabled && state.configured && !state.loading;
  const disabledReason = !clientGateEnabled
    ? 'The Google Drive connector is disabled in this website build.'
    : !state.configured ? 'The secure Google Drive service is not configured on the server.' : '';

  return (
    <section aria-labelledby="google-drive-heading" className="rounded-xl border border-white/[0.09] bg-white/[0.025] p-5 sm:p-6">
      <div className="grid gap-5 sm:grid-cols-[3rem_minmax(0,1fr)]">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/[0.05] text-amber-100" aria-hidden="true"><Cloud size={22} /></span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="google-drive-heading" className="text-lg font-semibold text-white">Google Drive</h2>
            <AdminStatusBadge status={connection?.status || 'disabled'}>{googleDriveStatusLabel(connection?.status)}</AdminStatusBadge>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Authorize only the Drive files and folders created or opened through Lahat Liwa. The connection prepares a dedicated Lahat Liwa folder; it does not upload media.</p>

          <div className="mt-5 grid gap-2 text-sm text-zinc-500 sm:grid-cols-2">
            <Feature icon={HardDrive}>Originals, project files, profile media, and archive folders</Feature>
            <Feature icon={ShieldCheck}>Restricted Google Drive file access</Feature>
            <Feature icon={FileCheck2}>Connection checks without file migration</Feature>
            <Feature icon={LockKeyhole}>OAuth credentials stay server-side</Feature>
          </div>

          {state.loading ? <div className="mt-6"><LoadingState label="Checking Google Drive connection" /></div> : (
            <>
              {state.notice && <AdminNotice aria-live="polite" tone={state.notice.tone} className="mt-6">{state.notice.message}</AdminNotice>}
              {connection && <ConnectionDetails connection={connection} />}
              {connection?.status === 'connected' && STORAGE_FEATURE_FLAGS.googleDriveTestUploadEnabled && state.testUploadEnabled && <GoogleDriveTestUpload />}
              <div className="mt-6 flex flex-wrap gap-3">
                {!connection && <AdminButton variant="primary" disabled={!canConnect || Boolean(state.busy)} aria-describedby={disabledReason ? 'google-drive-disabled-reason' : undefined} onClick={() => run('connect', () => startGoogleDriveConnection())}>Connect Google Drive</AdminButton>}
                {reconnect && <AdminButton variant="primary" disabled={!canConnect || Boolean(state.busy)} onClick={() => run('connect', () => startGoogleDriveConnection(connection.id))}>Reconnect Google Drive</AdminButton>}
                {connection?.status === 'connected' && <AdminButton disabled={Boolean(state.busy)} onClick={() => run('verify', verifyGoogleDriveConnection)}><RefreshCw size={16} aria-hidden="true" />{state.busy === 'verify' ? 'Checking…' : 'Check connection'}</AdminButton>}
              </div>
              {disabledReason && <p id="google-drive-disabled-reason" className="mt-2 text-xs leading-5 text-zinc-500">{disabledReason}</p>}
              {state.actionError && <AdminNotice aria-live="assertive" className="mt-3">{state.actionError}</AdminNotice>}
              {connection && <DisconnectSection connection={connection} busy={state.busy} onDisconnect={() => {
                requestConfirmation({
                  title: 'Disconnect Google Drive?',
                  description: 'Lahat Liwa will remove its saved authorization. Files and folders in Drive will remain.',
                  confirmLabel: 'Disconnect Drive',
                  destructive: true,
                  onConfirm: () => run('disconnect', () => disconnectGoogleDriveConnection(connection.id)),
                });
              }} />}
            </>
          )}
        </div>
      </div>
      {confirmationDialog}
    </section>
  );
}

function GoogleDriveTestUpload() {
  const [file, setFile] = useState(null);
  const [state, setState] = useState({ busy: false, error: '', uploaded: null });

  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setState({ busy: true, error: '', uploaded: null });
    try {
      const result = await uploadGoogleDriveTestFile(file);
      setState({ busy: false, error: '', uploaded: result.media });
      setFile(null);
      form.reset();
    } catch (error) {
      setState({ busy: false, error: error.message, uploaded: null });
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 rounded-lg border border-amber-200/15 bg-amber-100/[0.025] p-4">
      <div className="flex items-start gap-3">
        <UploadCloud size={18} className="mt-0.5 shrink-0 text-amber-200" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold text-white">Test a small Drive upload</h3>
          <p id="google-drive-test-help" className="mt-1 text-xs leading-5 text-zinc-500">Uploads one JPEG, PNG, WebP, or PDF up to 2 MB to the managed Originals folder. It is private test media and is not attached to the website.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="google-drive-test-file" className="sr-only">Choose a test file for Google Drive</label>
        <input
          id="google-drive-test-file"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? 'google-drive-test-help google-drive-test-error' : 'google-drive-test-help'}
          onChange={(event) => { setFile(event.target.files?.[0] || null); setState({ busy: false, error: '', uploaded: null }); }}
          className="min-w-0 flex-1 text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-white/[0.08] file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-100 hover:file:bg-white/[0.12]"
        />
        <AdminButton type="submit" variant="primary" disabled={!file || state.busy}>{state.busy ? 'Uploading...' : 'Upload test file'}</AdminButton>
      </div>
      {state.error && <AdminNotice id="google-drive-test-error" aria-live="assertive" className="mt-4">{state.error}</AdminNotice>}
      {state.uploaded && <AdminNotice aria-live="polite" tone="success" className="mt-4">{state.uploaded.filename} was uploaded to the Drive Originals folder. Existing Supabase media is unchanged.</AdminNotice>}
    </form>
  );
}

function ConnectionDetails({ connection }) {
  return (
    <dl className="mt-6 grid gap-3 rounded-lg border border-white/[0.08] bg-black/10 p-4 text-sm sm:grid-cols-2">
      <Detail label="Connected account" value={connection.accountEmail || 'Google account'} />
      <Detail label="Folder status" value={connection.rootFolderHealth === 'healthy' ? 'Lahat Liwa folder ready' : 'Needs attention'} />
      <Detail label="Connected" value={formatDate(connection.connectedAt)} />
      <Detail label="Last checked" value={formatDate(connection.lastVerifiedAt)} />
      {connection.lastErrorMessage && <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-[0.14em] text-zinc-600">What needs attention</dt><dd className="mt-1 text-red-200">{connection.lastErrorMessage}</dd></div>}
    </dl>
  );
}

function DisconnectSection({ connection, busy, onDisconnect }) {
  return (
    <details className="mt-7 border-t border-red-300/15 pt-5">
      <summary className="cursor-pointer text-sm text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60">Connection options</summary>
      <div className="mt-4 rounded-lg border border-red-300/15 bg-red-300/[0.025] p-4">
        <h3 className="text-sm font-semibold text-red-100">Disconnect Google Drive</h3>
        <p className="mt-2 text-xs leading-5 text-zinc-500">This revokes Lahat Liwa’s authorization and removes the saved credential. It does not delete the Lahat Liwa folder or any files in Google Drive.</p>
        <AdminButton variant="danger" className="mt-4" disabled={Boolean(busy) || ['revoked', 'disabled'].includes(connection.status)} onClick={onDisconnect}><Unplug size={16} aria-hidden="true" />{busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}</AdminButton>
      </div>
    </details>
  );
}

function OperationsOverview() {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  useEffect(() => {
    let active = true;
    supabase.from('storage_connection_operations').select('*').order('updated_at', { ascending: false })
      .then(({ data, error }) => {
        if (active) setState({ loading: false, rows: data || [], error: error ? 'Operational connection metadata is unavailable until the reviewed Phase 2 SQL is applied.' : '' });
      });
    return () => { active = false; };
  }, []);
  const metrics = useMemo(() => {
    const active = state.rows.filter((row) => row.status === 'connected');
    return [
      ['Connected accounts', active.length],
      ['Reconnect required', state.rows.filter((row) => row.status === 'reconnect_required').length],
      ['Attention needed', state.rows.filter((row) => row.status === 'error').length],
      ['Google Drive', state.rows.filter((row) => row.provider === 'google_drive').length],
    ];
  }, [state.rows]);

  return (
    <section aria-labelledby="operations-heading" className="py-6">
      <div className="flex items-center gap-3"><Database size={19} className="text-amber-200" aria-hidden="true" /><h2 id="operations-heading" className="text-lg font-semibold text-white">Operational overview</h2></div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">Safe status, account email, folder health, and timestamps only. Tokens, secret references, Drive identifiers, and private folder metadata are excluded.</p>
      {state.loading ? <div className="mt-5"><LoadingState label="Loading connection overview" /></div> : state.error ? <AdminNotice className="mt-5">{state.error}</AdminNotice> : (
        <div className="mt-5 grid gap-px overflow-hidden rounded-xl bg-white/[0.08] sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(([label, value]) => <div key={label} className="bg-zinc-950 p-5"><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">{label}</p><p className="mt-3 text-2xl font-semibold text-white">{value}</p></div>)}
        </div>
      )}
      <p className="mt-4 text-xs text-zinc-600">Legacy provider connections are monitored separately from the public-media migration ledger above.</p>
    </section>
  );
}

function Detail({ label, value }) {
  return <div><dt className="text-xs uppercase tracking-[0.14em] text-zinc-600">{label}</dt><dd className="mt-1 break-words text-zinc-300">{value}</dd></div>;
}

function Feature({ icon: Icon, children }) {
  return <span className="flex items-start gap-2"><Icon size={15} className="mt-0.5 shrink-0 text-zinc-600" aria-hidden="true" />{children}</span>;
}

function formatDate(value) {
  if (!value) return 'Not checked yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toLocaleString();
}
