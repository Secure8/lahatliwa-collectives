import { Cloud, Database, FileCheck2, HardDrive, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminNotice, AdminPageHeader, AdminStatusBadge } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { useAdminAccess } from '../../lib/adminAccess';
import { STORAGE_FEATURE_FLAGS } from '../../lib/storageFeatureFlags';
import { canAccessStoragePage, storagePageMode } from '../../lib/storageAdmin';
import { supabase } from '../../lib/supabaseClient';

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

  const allowed = canAccessStoragePage({
    role,
    creativeMemberId: adminUser?.creative_member_id,
    isPublished: publication.isPublished,
  });

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow="Storage foundation"
        title={mode === 'operations' ? 'Storage' : 'My Storage'}
        description={mode === 'operations'
          ? 'A read-only foundation for provider connections and safe media transfers.'
          : 'Plan where you will keep original files while Lahat Liwa continues to manage reliable public previews.'}
      />
      {publication.loading ? <LoadingState label="Checking storage access" /> : publication.error ? (
        <AdminNotice>{publication.error}</AdminNotice>
      ) : !allowed ? (
        <AdminNotice>This page is available to Super Admins and creatives with a published profile.</AdminNotice>
      ) : mode === 'operations' ? <OperationsFoundation /> : <CreativeStorageFoundation />}
    </AdminLayout>
  );
}

function CreativeStorageFoundation() {
  return (
    <div className="grid gap-7">
      <section className="grid gap-4 border-y border-white/[0.08] py-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-amber-200/80">Current upload destination</p>
          <h2 className="mt-2 text-xl font-semibold text-white">Lahat Liwa storage</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">All current project and profile uploads still use the existing Lahat Liwa Supabase storage. Nothing is being moved automatically.</p>
        </div>
        <AdminStatusBadge status="active">Active</AdminStatusBadge>
      </section>

      <section aria-labelledby="google-drive-heading" className="rounded-xl border border-white/[0.09] bg-white/[0.025] p-5 sm:p-6">
        <div className="grid gap-5 sm:grid-cols-[3rem_minmax(0,1fr)]">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white/[0.05] text-amber-100" aria-hidden="true"><Cloud size={22} /></span>
          <div>
            <div className="flex flex-wrap items-center gap-3"><h2 id="google-drive-heading" className="text-lg font-semibold text-white">Google Drive</h2><AdminStatusBadge status="planned">Not connected</AdminStatusBadge></div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">Google Drive connection is being prepared for original files and archives. Optimized public previews will remain managed by Lahat Liwa.</p>
            <div className="mt-5 grid gap-2 text-sm text-zinc-500 sm:grid-cols-2">
              <Feature icon={HardDrive}>Original files and archives</Feature>
              <Feature icon={ShieldCheck}>Lahat Liwa-managed public previews</Feature>
              <Feature icon={FileCheck2}>Review before any future transfer</Feature>
              <Feature icon={LockKeyhole}>Credentials never exposed in the browser</Feature>
            </div>
            <button type="button" disabled aria-describedby="google-drive-disabled-reason" className="mt-6 inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-lg border border-white/[0.1] bg-white/[0.035] px-4 text-sm font-medium text-zinc-500 opacity-80">Connect Google Drive</button>
            <p id="google-drive-disabled-reason" className="mt-2 text-xs leading-5 text-zinc-500">Connection will be available after the secure authorization service is completed in Phase 2.</p>
          </div>
        </div>
      </section>

      <AdminNotice tone="success">No files will be copied, moved, or removed without your review and approval.</AdminNotice>
    </div>
  );
}

function OperationsFoundation() {
  const metrics = [
    ['Connected creatives', 'Available after Phase 2'],
    ['Active connections', 'Available after Phase 2'],
    ['Reconnect required', 'Available after Phase 2'],
    ['Migration jobs', 'Available after Phase 4'],
    ['Failed migrations', 'Available after Phase 4'],
    ['Provider distribution', 'Available after Phase 2'],
  ];
  return (
    <div className="grid gap-7">
      <AdminNotice>This page does not query connection or migration tables in Phase 1 because the proposed database migration has not been applied.</AdminNotice>
      <section aria-labelledby="operations-heading">
        <div className="flex items-center gap-3"><Database size={19} className="text-amber-200" aria-hidden="true" /><h2 id="operations-heading" className="text-lg font-semibold text-white">Operational overview</h2></div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">Only safe operational metadata will appear here. OAuth tokens, credential references, provider file identifiers, and private verification details are excluded.</p>
        <div className="mt-5 grid gap-px overflow-hidden rounded-xl bg-white/[0.08] sm:grid-cols-2 xl:grid-cols-3">
          {metrics.map(([label, detail]) => <div key={label} className="bg-zinc-950 p-5"><p className="text-xs uppercase tracking-[0.14em] text-zinc-600">{label}</p><p className="mt-3 text-sm text-zinc-400">{detail}</p></div>)}
        </div>
      </section>
      <section className="border-y border-white/[0.08] py-6">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-semibold text-white">Phase 1 safety gates</h2><p className="mt-2 text-sm text-zinc-500">All connection, external upload, and migration actions remain disabled.</p></div><AdminStatusBadge status="disabled">Read only</AdminStatusBadge></div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <Flag label="External storage" enabled={STORAGE_FEATURE_FLAGS.externalStorageEnabled} />
          <Flag label="Google Drive connector" enabled={STORAGE_FEATURE_FLAGS.googleDriveConnectorEnabled} />
          <Flag label="Storage migration" enabled={STORAGE_FEATURE_FLAGS.storageMigrationEnabled} />
        </dl>
      </section>
    </div>
  );
}

function Feature({ icon: Icon, children }) {
  return <span className="flex items-center gap-2"><Icon size={15} className="shrink-0 text-zinc-600" aria-hidden="true" />{children}</span>;
}

function Flag({ label, enabled }) {
  return <div className="rounded-lg border border-white/[0.07] px-4 py-3"><dt className="text-zinc-400">{label}</dt><dd className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-zinc-600">{enabled ? 'Enabled' : 'Disabled'}</dd></div>;
}
