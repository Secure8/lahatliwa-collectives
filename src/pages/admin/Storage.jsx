import { Activity, AlertTriangle, CheckCircle2, Circle, Cloud, Database, FileCheck2, HardDrive, ImageOff, LockKeyhole, Pause, Play, Radio, RefreshCw, RotateCcw, ScanSearch, ShieldCheck, Unplug, UploadCloud } from 'lucide-react';
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
  processOnePublicMediaMigration,
  reconcilePublicMediaProviders,
  resumePublicMediaMigration,
  retryPublicMediaMigration,
  updateStoragePolicy,
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
  const [state, setState] = useState({ loading: true, snapshot: null, migrations: [], detail: null, error: '', notice: '', busy: '', progress: null });
  const [budgetGb, setBudgetGb] = useState('9');
  const [retentionDays, setRetentionDays] = useState('30');

  const load = async (notice = '') => {
    const [dashboard, migrations] = await Promise.all([fetchStorageGovernanceDashboard(), listPublicMediaMigrations({ pageSize: 8 })]);
    const policy = dashboard.snapshot?.policy || {};
    setBudgetGb(String(Math.round(Number(policy.budget_bytes || 0) / 1024 ** 3 * 10) / 10 || 9));
    setRetentionDays(String(policy.migration_retention_days || 30));
    setState((current) => ({ ...current, loading: false, snapshot: dashboard.snapshot, migrations: migrations.rows || [], detail: null, error: '', notice, busy: '' }));
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

  const migrateOne = async () => {
    setState((current) => ({ ...current, busy: 'migration', error: '', notice: '', progress: { phase: 'preparing' } }));
    try {
      const result = await processOnePublicMediaMigration({
        onProgress: (progress) => setState((current) => ({ ...current, progress })),
      });
      await load(result.claimed ? 'One media reference migrated and retained for rollback.' : 'No eligible media is waiting.');
    } catch (error) {
      setState((current) => ({ ...current, busy: '', error: error.message, progress: { ...(current.progress || {}), phase: 'failed', code: error.code, stage: error.stage } }));
    }
  };

  if (state.loading) return <section className="py-6"><LoadingState label="Loading public media storage" /></section>;
  if (!state.snapshot) return <section className="py-6"><AdminNotice>{state.error || 'Public media storage monitoring is unavailable until the governance migration and Edge Functions are deployed.'}</AdminNotice></section>;

  const { overview = {}, migration = {}, cleanup = {}, health = {}, policy = {}, breakdowns = {}, largestProjects = [], largestCreatives = [], largestOwners = [], mediaPreviews = [] } = state.snapshot;
  const consumed = Number(overview.activeR2Bytes || 0) + Number(overview.provisionalBytes || 0) + Number(policy.reserve_bytes || 0);
  const percent = Number(policy.budget_bytes || 0) ? consumed / Number(policy.budget_bytes) * 100 : 0;
  const safety = percent >= Number(policy.block_percent || 100) ? 'Blocked' : percent >= Number(policy.pause_non_admin_percent || 95) ? 'Paused' : percent >= Number(policy.strong_warning_percent || 85) ? 'Strong warning' : percent >= Number(policy.warning_percent || 75) ? 'Warning' : percent >= Number(policy.info_percent || 60) ? 'Information' : 'Normal';
  const providerData = [
    { label: 'R2', value: Number(overview.activeR2Bytes || 0), color: '#fbbf24' },
    { label: 'Supabase', value: Number(overview.activeSupabaseBytes || 0), color: '#38bdf8' },
    { label: 'Drive', value: Number(overview.activeDriveBytes || 0), color: '#a78bfa' },
    { label: 'Rollback', value: Number(overview.duplicatedMigrationBytes || 0), color: '#34d399' },
  ];
  const migrationData = [
    { label: 'Waiting', value: Number(migration.estimatedRemainingRecords || 0), color: '#71717a' },
    { label: 'Active', value: Number(migration.inProgress || 0), color: '#fbbf24' },
    { label: 'Attention', value: Number(migration.failed || 0) + Number(migration.manualReview || 0), color: '#fb7185' },
    { label: 'Completed', value: Number(migration.completed || 0), color: '#34d399' },
  ];
  const healthSignals = [
    ['Missing', Number(health.missingObjects || 0)], ['Orphaned', Number(health.orphanedObjects || 0)],
    ['Unverified', Number(health.unverifiedUploads || 0)], ['Failed', Number(health.failedVerifications || 0)],
  ];
  const pipeline = ['preparing', 'downloading', 'thumbnail', 'display', 'expanded', 'uploading', 'verifying', 'activating', 'retained'];
  const currentStage = state.progress?.phase || (policy.migration_paused ? 'paused' : 'idle');
  const stageIndex = pipeline.indexOf(currentStage);
  const recoverableCount = state.migrations.filter((row) => row.recoverable || row.stale).length;

  return (
    <section aria-labelledby="public-media-storage-heading" className="relative isolate grid gap-7 overflow-hidden rounded-2xl border border-white/[0.1] bg-[#090a0d] p-5 shadow-[0_28px_80px_rgba(0,0,0,0.32)] sm:p-7">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_0%,rgba(251,191,36,0.12),transparent_31%),radial-gradient(circle_at_92%_18%,rgba(56,189,248,0.08),transparent_25%)]" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-amber-200/80"><Radio size={14} className={state.busy === 'migration' ? 'animate-pulse' : ''}/> Live control</div><h2 id="public-media-storage-heading" className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-white">Media operations</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">A provider-verified view of migration, capacity, cleanup, and recovery. The browser prepares images; the server keeps final authority.</p></div>
        <div className="flex flex-wrap items-center gap-2"><AdminStatusBadge status={safety === 'Normal' ? 'active' : 'warning'}>{safety} · {percent.toFixed(1)}%</AdminStatusBadge>{recoverableCount > 0 && <AdminStatusBadge status="warning">{recoverableCount} recoverable</AdminStatusBadge>}</div>
      </div>
      {state.error && <AdminNotice>{state.error}</AdminNotice>}{state.notice && <AdminNotice tone="success">{state.notice}</AdminNotice>}

      <div className="grid gap-4 lg:grid-cols-[minmax(17rem,0.78fr)_minmax(0,1.45fr)]">
        <VisualPanel title="Capacity" subtitle="Managed R2 budget">
          <div className="grid place-items-center py-2">
            <RingGauge value={percent} label={safety} center={formatBytes(consumed)} detail={`of ${formatBytes(policy.budget_bytes)}`} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2"><VisualStat label="Available" value={formatBytes(Math.max(0,Number(policy.budget_bytes||0)-consumed))}/><VisualStat label="Safety reserve" value={formatBytes(policy.reserve_bytes)}/></div>
        </VisualPanel>
        <VisualPanel title="Storage map" subtitle="Where public media currently lives">
          <div className="grid gap-6 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
            <DonutChart items={providerData} center={formatBytes(overview.totalPublicMediaBytes)} label="tracked" />
            <div className="grid gap-4"><StackedDistribution items={providerData}/><VisualBarRows rows={providerData.map((item)=>[item.label,item.value,item.color])} formatValue={formatBytes}/></div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2"><VisualStat label="Objects" value={Number(overview.r2ObjectCount||0)+Number(overview.supabaseObjectCount||0)}/><VisualStat label="Groups" value={overview.mediaGroupCount||0}/><VisualStat label="Derivatives" value={overview.activeDerivativeCount||0}/></div>
        </VisualPanel>
      </div>
      <p className="text-xs text-zinc-600">Last synchronized: {formatDate(overview.lastSynchronizedAt)} · Values come from the application ledger and provider verification, not Cloudflare billing.</p>

      <MediaPreviewGallery items={mediaPreviews}/>

      <div className="grid gap-4 border-y border-white/[0.08] py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-zinc-400">R2 budget in GB<input type="number" min="1" step="0.5" value={budgetGb} onChange={(event)=>setBudgetGb(event.target.value)} className="border-0 border-b border-white/[0.12] bg-transparent py-2 text-white outline-none focus:border-amber-200/60" /></label>
          <label className="grid gap-2 text-sm text-zinc-400">Source rollback retention days<input type="number" min="1" max="365" value={retentionDays} onChange={(event)=>setRetentionDays(event.target.value)} className="border-0 border-b border-white/[0.12] bg-transparent py-2 text-white outline-none focus:border-amber-200/60" /></label>
        </div>
        <AdminButton disabled={Boolean(state.busy)} onClick={()=>run('policy',()=>updateStoragePolicy({budget_bytes:Math.round(Number(budgetGb)*1024**3),migration_retention_days:Number(retentionDays)}),'Storage policy updated and audited.')}>Save policy</AdminButton>
      </div>

      <div className="grid gap-5 rounded-2xl border border-white/[0.09] bg-black/30 p-4 backdrop-blur-xl sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Activity size={17} className="text-amber-200"/><h3 className="text-base font-semibold text-white">Migration pipeline</h3></div><p className="mt-2 text-sm text-zinc-500">One source at a time. It stops after each record so every production test stays bounded.</p></div><div className="flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs capitalize text-zinc-300"><span className={`h-1.5 w-1.5 rounded-full ${currentStage === 'failed' ? 'bg-rose-400' : state.busy === 'migration' ? 'animate-pulse bg-amber-300' : 'bg-emerald-400'}`}/>{currentStage.replaceAll('_',' ')}</div></div>
        <ol aria-label="Migration progress" className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-9">
          {pipeline.map((stage,index)=>{const complete=currentStage==='retained'||stageIndex>index;const active=stage===currentStage;return <li key={stage} className={`min-w-0 rounded-xl border px-2.5 py-3 transition ${active?'border-amber-300/35 bg-amber-300/[0.09] text-amber-100':complete?'border-emerald-300/15 bg-emerald-300/[0.04] text-emerald-200/80':'border-white/[0.07] bg-white/[0.025] text-zinc-600'}`}>{complete?<CheckCircle2 size={14}/>:active?<Activity size={14} className="animate-pulse"/>:<Circle size={14}/>}<span className="mt-2 block truncate text-[10px] font-medium capitalize tracking-wide">{stage}</span></li>})}
        </ol>
        {state.progress?.phase === 'uploading' && <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-400 transition-all" style={{width:`${Math.max(6,Number(state.progress.completed||0)/Number(state.progress.total||3)*100)}%`}}/></div>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,0.7fr)_minmax(0,1.3fr)]">
        <VisualPanel title="Migration state" subtitle="Current record distribution">
          <div className="grid place-items-center py-1"><DonutChart items={migrationData} center={migrationData.reduce((sum,item)=>sum+item.value,0)} label="records" /></div>
          <VisualBarRows rows={migrationData.map((item)=>[item.label,item.value,item.color])}/>
        </VisualPanel>
        <VisualPanel title="Transfer balance" subtitle="Source retained versus generated output">
          <ComparisonBars rows={[
            ['Source scanned',Number(migration.uniqueSourceBytes||0),'#38bdf8'],
            ['R2 generated',Number(migration.destinationBytes||0),'#fbbf24'],
            ['Rollback retained',Number(migration.retainedSourceBytes||0),'#34d399'],
            ['Cleanup queued',Number(migration.queuedDeletionBytes||0),'#fb7185'],
          ]}/>
        </VisualPanel>
      </div>
      <div className="flex flex-wrap gap-2">
        <AdminButton disabled={Boolean(state.busy)} aria-label="Preview eligible media" onClick={()=>run('discover',()=>discoverPublicMediaMigration(50),(result)=>`${result.result.created} eligible media references registered; ${result.result.manualReview} require manual review.`)}><ScanSearch size={16}/> Scan</AdminButton>
        {policy.migration_paused ? <AdminButton variant="primary" disabled={Boolean(state.busy)} onClick={()=>run('resume',resumePublicMediaMigration,'Migration resumed.')}><Play size={16}/> Resume</AdminButton> : <AdminButton disabled={state.busy && state.busy !== 'migration'} onClick={()=>run('pause',pausePublicMediaMigration,'Migration paused. The active record can finish safely.')}><Pause size={16}/> Pause</AdminButton>}
        <AdminButton variant="primary" disabled={Boolean(state.busy)||policy.migration_paused} onClick={migrateOne}><Play size={16}/> Migrate one</AdminButton>
        <AdminButton disabled={Boolean(state.busy)} onClick={()=>run('reconcile',reconcilePublicMediaProviders,(result)=>{const findings=Number(result.providers?.r2?.findings||0)+Number(result.providers?.supabase?.findings||0);return `Reconciliation completed with ${findings} recorded findings. No suspected orphan was deleted.`;})}><RefreshCw size={16}/> Reconcile</AdminButton>
      </div>

      <div className="grid gap-2" aria-label="Recent migration records">{state.migrations.map((row)=><article key={row.id} className="grid gap-4 rounded-xl border border-white/[0.075] bg-white/[0.025] p-4 transition hover:border-white/[0.14] md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium text-zinc-200">{row.sourceName}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${row.recoverable||row.stale?'bg-amber-300/10 text-amber-200':row.status==='retained_for_rollback'?'bg-emerald-300/10 text-emerald-200':'bg-white/[0.06] text-zinc-400'}`}>{row.recoverable||row.stale?'recoverable':String(row.phase||row.status).replaceAll('_',' ')}</span></div><p className="mt-1.5 text-xs text-zinc-600">{formatBytes(row.sourceBytes)} source · {formatBytes(row.destinationBytes)} verified · attempt {row.attemptCount}</p>{row.statusMessage&&<p className="mt-2 line-clamp-2 text-xs text-amber-100/75">{row.statusMessage}</p>}</div><div className="flex flex-wrap items-center gap-3 text-xs"><button type="button" onClick={()=>inspect(row.id)} className="text-zinc-300 hover:text-white">Inspect</button>{(['failed','manual_review'].includes(row.status)||row.recoverable||row.stale)&&<button type="button" onClick={()=>run(`retry-${row.id}`,()=>retryPublicMediaMigration(row.id),'Migration is ready to resume.')} className="inline-flex items-center gap-1 text-amber-200 hover:text-amber-100"><RotateCcw size={13}/> Retry</button>}{!['manual_review','completed','cancelled','rolled_back','retained_for_rollback'].includes(row.status)&&<button type="button" aria-label="Move to manual review" onClick={()=>run(`review-${row.id}`,()=>markPublicMediaMigrationManualReview(row.id,'Flagged by Super Admin for manual inspection.'),'Migration moved to manual review.')} className="text-zinc-500 hover:text-white">Review</button>}</div></article>)}</div>

      {state.detail&&<div className="rounded-lg border border-white/[0.08] bg-black/15 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">Migration inspection</p><h4 className="mt-1 text-sm font-semibold text-white">{state.detail.migration?.sourceName}</h4></div><button type="button" onClick={()=>setState((current)=>({...current,detail:null}))} className="text-xs text-zinc-400 hover:text-white">Close</button></div><dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">{[['State',state.detail.migration?.status?.replaceAll('_',' ')],['Source provider',state.detail.migration?.sourceProvider],['Destination',state.detail.migration?.destinationProvider],['Retention deadline',formatDate(state.detail.migration?.retainSourceUntil)],['Source cleanup',state.detail.migration?.sourceDeletedAt?'deleted':state.detail.migration?.sourceCleanupQueuedAt?'queued':'not queued'],['Attempts',state.detail.migration?.attemptCount],['Source bytes',formatBytes(state.detail.migration?.sourceBytes)],['Destination bytes',formatBytes(state.detail.migration?.destinationBytes)]].map(([label,value])=><div key={label}><dt className="text-zinc-600">{label}</dt><dd className="mt-1 capitalize text-zinc-300">{value??'—'}</dd></div>)}</dl><div className="mt-4 grid gap-2 sm:grid-cols-3">{(state.detail.objects||[]).map((object)=><div key={object.id} className="rounded-md bg-white/[0.025] p-3 text-xs"><p className="capitalize text-zinc-300">{object.media_variant||'source'}</p><p className="mt-1 text-zinc-600">{object.provider} · {object.verification_status} · {formatBytes(object.trusted_size_bytes)}</p></div>)}</div>{state.detail.migration?.statusMessage&&<p className="mt-4 text-xs leading-5 text-amber-100">{state.detail.migration.statusMessage}</p>}</div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <BarChartCard title="Largest projects" rows={largestProjects.map((row)=>[row.title||'Untitled project',Number(row.bytes||0)])} color="#fbbf24"/>
        <BarChartCard title="Largest creatives" rows={largestCreatives.map((row)=>[row.name||'Unlinked creative',Number(row.bytes||0)])} color="#38bdf8"/>
        <BarChartCard title="Largest owners" rows={largestOwners.map((row)=>[row.display_name||'Unlabeled owner',Number(row.bytes||0)])} color="#a78bfa"/>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <BarChartCard title="By provider" rows={(breakdowns.provider||[]).map((row)=>[row.provider,Number(row.bytes||0)])} color="#34d399"/>
        <BarChartCard title="By category" rows={(breakdowns.category||[]).map((row)=>[String(row.category).replaceAll('_',' '),Number(row.bytes||0)])} color="#fb923c"/>
        <BarChartCard title="By variant" rows={(breakdowns.variant||[]).map((row)=>[row.variant,Number(row.bytes||0)])} color="#f472b6"/>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <VisualPanel title="Provider health" subtitle={`Last reconciliation ${formatDate(health.lastReconciliation)}`}>
          <HealthSignalChart signals={healthSignals}/>
        </VisualPanel>
        <VisualPanel title="Cleanup pressure" subtitle="Jobs waiting for a safe provider action">
          <ComparisonBars valueType="count" rows={[["Pending",Number(cleanup.pendingJobs||0),'#fbbf24'],["Retrying",Number(cleanup.retryingJobs||0),'#fb923c'],["Manual review",Number(cleanup.manualReviewJobs||0),'#fb7185']]}/>
          <div className="mt-4"><VisualStat label="Recoverable volume" value={formatBytes(cleanup.recoverableBytes)}/></div>
        </VisualPanel>
      </div>
      {(Number(health.missingObjects||0)>0||Number(health.orphanedObjects||0)>0||Number(cleanup.manualReviewJobs||0)>0)&&<div className="flex items-start gap-3 rounded-lg border border-amber-200/15 bg-amber-200/[0.035] p-4 text-sm leading-6 text-zinc-300"><AlertTriangle className="mt-0.5 shrink-0 text-amber-200" size={18}/><span>Storage health needs review. Reconciliation findings are detect-and-recheck records; they do not immediately delete objects.</span></div>}
    </section>
  );
}

function MediaPreviewGallery({items}){return <section aria-labelledby="media-preview-heading" className="rounded-2xl border border-white/[0.085] bg-black/20 p-4 sm:p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 id="media-preview-heading" className="text-sm font-semibold text-white">Live media preview</h3><p className="mt-1 text-xs text-zinc-600">Actual public images currently represented in the storage ledger.</p></div><span className="text-[10px] uppercase tracking-[0.14em] text-zinc-600">{items.length} visible</span></div>{items.length?<div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{items.map((item)=><MediaPreviewTile key={item.id} item={item}/>)}</div>:<div className="mt-5 flex min-h-36 items-center justify-center rounded-xl border border-dashed border-white/[0.08] text-center"><div><ImageOff className="mx-auto text-zinc-700" size={24}/><p className="mt-3 text-xs text-zinc-500">No public image previews are available yet.</p></div></div>}</section>;}

function MediaPreviewTile({item}){const [failed,setFailed]=useState(false);return <article className="group min-w-0 overflow-hidden rounded-xl border border-white/[0.075] bg-[#0d0e11]"><div className="relative aspect-[4/3] overflow-hidden bg-zinc-900">{failed?<div className="grid h-full place-items-center text-zinc-700"><ImageOff size={25}/></div>:<img src={item.url} alt="" loading="lazy" decoding="async" onError={()=>setFailed(true)} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.025]"/>}<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-8"><div className="flex items-center justify-between gap-2"><span className="truncate text-[10px] font-medium text-white">{item.subject}</span><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.status==='Verified'?'bg-emerald-300':'bg-amber-300'}`} title={item.status}/></div></div></div><div className="p-3"><p className="truncate text-xs text-zinc-300" title={item.filename}>{item.filename}</p><div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] uppercase tracking-[0.1em] text-zinc-600"><span>{item.provider}</span><span aria-hidden="true">·</span><span className="capitalize">{item.category}</span><span aria-hidden="true">·</span><span>{formatBytes(item.sizeBytes)}</span></div></div></article>;}

function VisualPanel({title,subtitle,children}){return <section className="rounded-2xl border border-white/[0.085] bg-white/[0.025] p-4 sm:p-5"><div><h4 className="text-sm font-semibold text-white">{title}</h4>{subtitle&&<p className="mt-1 text-xs text-zinc-600">{subtitle}</p>}</div><div className="mt-4">{children}</div></section>;}

function VisualStat({label,value}){return <div className="min-w-0 rounded-xl border border-white/[0.065] bg-black/20 px-3 py-3"><p className="truncate text-[9px] uppercase tracking-[0.14em] text-zinc-600">{label}</p><p className="mt-1.5 truncate text-sm font-medium text-zinc-200">{value??0}</p></div>;}

function RingGauge({value,label,center,detail}){const bounded=Math.max(0,Math.min(Number(value||0),100));const color=bounded>=95?'#fb7185':bounded>=75?'#fb923c':'#fbbf24';return <div role="img" aria-label={`${label}: ${bounded.toFixed(1)} percent of storage budget used`} className="relative grid aspect-square w-44 place-items-center rounded-full" style={{background:`conic-gradient(${color} 0 ${bounded}%,rgba(255,255,255,.07) ${bounded}% 100%)`}}><div className="absolute inset-[13px] grid place-items-center rounded-full border border-white/[0.06] bg-[#0b0c0f] text-center shadow-[inset_0_0_28px_rgba(255,255,255,.025)]"><div><p className="text-2xl font-semibold tracking-[-0.04em] text-white">{bounded.toFixed(1)}%</p><p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em]" style={{color}}>{label}</p><p className="mt-3 text-xs text-zinc-400">{center}</p><p className="text-[10px] text-zinc-600">{detail}</p></div></div></div>;}

function donutBackground(items){const total=items.reduce((sum,item)=>sum+Math.max(0,Number(item.value||0)),0);if(!total)return 'conic-gradient(rgba(255,255,255,.08) 0 100%)';let cursor=0;return `conic-gradient(${items.map((item)=>{const start=cursor;cursor+=Math.max(0,Number(item.value||0))/total*100;return `${item.color} ${start}% ${cursor}%`;}).join(',')})`;}

function DonutChart({items,center,label}){const total=items.reduce((sum,item)=>sum+Number(item.value||0),0);return <div role="img" aria-label={`${label}: ${items.map((item)=>`${item.label} ${item.value}`).join(', ')}`} className="relative grid aspect-square w-36 place-items-center rounded-full" style={{background:donutBackground(items)}}><div className="absolute inset-[16px] grid place-items-center rounded-full border border-white/[0.06] bg-[#0b0c0f] text-center"><div><p className="max-w-24 truncate text-lg font-semibold text-white">{center}</p><p className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">{total?label:'no data'}</p></div></div></div>;}

function StackedDistribution({items}){const total=items.reduce((sum,item)=>sum+Math.max(0,Number(item.value||0)),0);return <div><div role="img" aria-label="Storage provider distribution" className="flex h-3 overflow-hidden rounded-full bg-white/[0.06]">{total>0&&items.map((item)=><span key={item.label} style={{width:`${item.value/total*100}%`,backgroundColor:item.color}} title={`${item.label}: ${formatBytes(item.value)}`}/>)}</div><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{items.map((item)=><span key={item.label} className="inline-flex items-center gap-1.5 text-[10px] text-zinc-500"><span className="h-1.5 w-1.5 rounded-full" style={{backgroundColor:item.color}}/>{item.label}</span>)}</div></div>;}

function VisualBarRows({rows,formatValue=(value)=>value}){const max=Math.max(1,...rows.map(([,value])=>Number(value||0)));return <div className="grid gap-3">{rows.map(([label,value,color='#fbbf24'])=><div key={label}><div className="mb-1.5 flex items-center justify-between gap-3 text-[10px]"><span className="capitalize text-zinc-500">{label}</span><span className="text-zinc-300">{formatValue(value)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-white/[0.055]"><div className="h-full rounded-full transition-[width] duration-500" style={{width:`${Number(value||0)>0?Math.max(3,Number(value||0)/max*100):0}%`,backgroundColor:color}}/></div></div>)}</div>;}

function ComparisonBars({rows,valueType='bytes'}){const max=Math.max(1,...rows.map(([,value])=>Number(value||0)));return <div role="img" aria-label={rows.map(([label,value])=>`${label}: ${valueType==='bytes'?formatBytes(value):value}`).join(', ')} className="grid gap-4">{rows.map(([label,value,color])=><div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-center gap-3"><span className="truncate text-[10px] text-zinc-500">{label}</span><div className="h-7 overflow-hidden rounded-md bg-white/[0.045]"><div className="h-full min-w-0 rounded-md opacity-80 transition-[width] duration-500" style={{width:`${Number(value||0)>0?Math.max(4,Number(value||0)/max*100):0}%`,background:`linear-gradient(90deg,${color}55,${color})`}}/></div><span className="min-w-14 text-right text-[10px] text-zinc-300">{valueType==='bytes'?formatBytes(value):value}</span></div>)}</div>;}

function BarChartCard({title,rows,color}){const values=rows.slice(0,5);const max=Math.max(1,...values.map(([,value])=>Number(value||0)));return <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4"><h4 className="text-sm font-semibold text-white">{title}</h4>{values.length?<div role="img" aria-label={`${title} usage comparison`} className="mt-5 grid gap-3">{values.map(([label,value],index)=><div key={`${label}-${index}`} className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-3"><span className="truncate text-[10px] capitalize text-zinc-500">{label}</span><div><div className="h-5 overflow-hidden rounded bg-white/[0.045]"><div className="h-full rounded opacity-85" style={{width:`${Number(value||0)>0?Math.max(4,Number(value||0)/max*100):0}%`,background:`linear-gradient(90deg,${color}33,${color})`}}/></div><p className="mt-1 text-right text-[9px] text-zinc-600">{formatBytes(value)}</p></div></div>)}</div>:<p className="mt-5 text-xs text-zinc-600">No tracked usage yet.</p>}</section>;}

function HealthSignalChart({signals}){const max=Math.max(1,...signals.map(([,value])=>Number(value||0)));const total=signals.reduce((sum,[,value])=>sum+Number(value||0),0);return <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-end"><div role="img" aria-label={signals.map(([label,value])=>`${label}: ${value}`).join(', ')} className="flex h-36 items-end gap-3 rounded-xl border border-white/[0.06] bg-black/20 px-4 pt-5">{signals.map(([label,value])=><div key={label} className="flex h-full flex-1 flex-col justify-end"><div className="relative flex flex-1 items-end"><div className={`w-full rounded-t-md ${Number(value)>0?'bg-gradient-to-t from-rose-500/35 to-rose-400':'bg-gradient-to-t from-emerald-500/20 to-emerald-300/70'}`} style={{height:`${Number(value)>0?Math.max(12,Number(value)/max*100):5}%`}}/></div><p className="mt-2 truncate text-center text-[9px] text-zinc-600">{label}</p></div>)}</div><div className={`grid aspect-square place-items-center rounded-full border ${total?'border-rose-300/20 bg-rose-300/[0.06]':'border-emerald-300/20 bg-emerald-300/[0.06]'}`}><div className="text-center"><p className={`text-2xl font-semibold ${total?'text-rose-200':'text-emerald-200'}`}>{total}</p><p className="text-[9px] uppercase tracking-[0.14em] text-zinc-600">signals</p></div></div></div>;}

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
                {!connection && <AdminButton variant="primary" disabled={!canConnect || Boolean(state.busy)} aria-label="Connect Google Drive" aria-describedby={disabledReason ? 'google-drive-disabled-reason' : undefined} onClick={() => run('connect', () => startGoogleDriveConnection())}>Connect</AdminButton>}
                {reconnect && <AdminButton variant="primary" disabled={!canConnect || Boolean(state.busy)} aria-label="Reconnect Google Drive" onClick={() => run('connect', () => startGoogleDriveConnection(connection.id))}>Reconnect</AdminButton>}
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
