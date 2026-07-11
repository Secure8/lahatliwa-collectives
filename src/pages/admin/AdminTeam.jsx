import { Copy, Edit, Eye, ExternalLink, Plus, RotateCcw, ShieldCheck, ShieldOff, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import AdminLayout from '../../components/admin/AdminLayout';
import {
  AdminButton,
  AdminActionButton,
  AdminActionGroup,
  AdminEmptyState,
  AdminInput,
  AdminNotice,
  AdminPageHeader,
  AdminSelect,
  AdminStatusBadge,
  AdminSurface,
} from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { roleLabel, useAdminAccess } from '../../lib/adminAccess';
import { formatDate } from '../../lib/helpers';
import { copyText } from '../../lib/clipboard';
import { supabase } from '../../lib/supabaseClient';

const roleOptions = ['super_admin', 'admin', 'editor', 'creative', 'viewer'];
const statusOptions = ['active', 'invited'];
const teamFilters = ['active', 'invited', 'disabled', 'all'];
const emptyFilterCopy = {
  active: 'No active team members found.',
  invited: 'No pending invitations.',
  disabled: 'No disabled team members.',
  all: 'No team members found.',
};
const teamRecordSelect = 'id, user_id, email, display_name, avatar_url, role, status, creative_member_id, created_at, updated_at';

const emptyForm = {
  email: '',
  display_name: '',
  role: 'creative',
  status: 'invited',
  creative_member_id: '',
};

function sortTeam(rows) {
  return [...rows].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
}

function normalizedTeamRole(member) {
  return member?.role === 'owner' ? 'super_admin' : member?.role;
}

function isSuperAdminMember(member) {
  return normalizedTeamRole(member) === 'super_admin';
}

export default function AdminTeam() {
  const { role, adminUser } = useAdminAccess();
  const [team, setTeam] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [activeFilter, setActiveFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lifecycle, setLifecycle] = useState(null);
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const isSuperAdmin = role === 'super_admin';
  const availableRoleOptions = isSuperAdmin ? roleOptions : roleOptions.filter((option) => option !== 'super_admin');
  const activeSuperAdminCount = useMemo(() => team.filter((member) => isSuperAdminMember(member) && member.status === 'active').length, [team]);
  const teamCounts = useMemo(() => ({
    active: team.filter((member) => member.status === 'active').length,
    invited: team.filter((member) => member.status === 'invited').length,
    disabled: team.filter((member) => member.status === 'disabled').length,
    all: team.length,
  }), [team]);
  const visibleTeam = useMemo(() => (
    activeFilter === 'all' ? team : team.filter((member) => member.status === activeFilter)
  ), [activeFilter, team]);
  const editingMember = team.find((member) => member.id === editingId);
  const editingCurrentAccount = editingMember?.user_id === adminUser?.user_id;
  const formRoleOptions = editingCurrentAccount ? [normalizedTeamRole(editingMember)] : availableRoleOptions;
  const formStatusOptions = editingMember ? [editingMember.status] : statusOptions;

  async function loadTeam({ showLoading = true } = {}) {
    if (showLoading) setLoading(true);
    const [{ data: teamRows, error: teamError }, { data: creativeRows }] = await Promise.all([
      supabase
        .from('admin_users')
        .select('id, user_id, email, display_name, avatar_url, role, status, creative_member_id, created_at, updated_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('creative_members')
        .select('id, name, role, slug, is_published')
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true }),
    ]);

    if (teamError) setError(teamError.message);
    else setTeam(teamRows || []);
    setCreatives(creativeRows || []);
    if (showLoading) setLoading(false);
  }

  useEffect(() => {
    loadTeam();
  }, []);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function copyMemberProfile(member) {
    const creative = creatives.find((item) => item.id === member.creative_member_id);
    if (!creative?.slug) return;
    try {
      await copyText(`${window.location.origin}/creatives/${creative.slug}`);
      setMessage('Profile link copied.');
    } catch (copyError) {
      setError(copyError.message || 'Profile link could not be copied.');
    }
  }

  function resetForm() {
    setEditingId('');
    setForm(emptyForm);
  }

  function editMember(member) {
    setError('');
    setMessage('');
    setEditingId(member.id);
    setForm({
      email: member.email || '',
      display_name: member.display_name || '',
      role: member.role === 'owner' ? 'super_admin' : member.role || 'viewer',
      status: member.status || 'active',
      creative_member_id: member.creative_member_id || '',
    });
  }

  function protectedSuperAdminChange(member, nextRole, nextStatus) {
    const currentRole = normalizedTeamRole(member);
    const isLastSuperAdmin = currentRole === 'super_admin' && member?.status === 'active' && activeSuperAdminCount <= 1;
    return isLastSuperAdmin && (nextRole !== 'super_admin' || nextStatus !== 'active');
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    try {
      const existing = team.find((member) => member.id === editingId);
      if (!isSuperAdmin && form.role === 'super_admin') {
        throw new Error('Only a Super Admin can create or edit Super Admin accounts.');
      }
      if (!isSuperAdmin && isSuperAdminMember(existing)) {
        throw new Error('Only a Super Admin can edit a Super Admin account.');
      }
      if (
        existing?.user_id === adminUser?.user_id
        && (form.role !== normalizedTeamRole(existing) || form.status !== existing.status)
      ) {
        throw new Error('You cannot change your own role or disable your own access.');
      }
      if (protectedSuperAdminChange(existing, form.role, form.status)) {
        throw new Error('You cannot downgrade or disable the last active Super Admin.');
      }
      if (existing && form.status !== existing.status) {
        throw new Error('Use the PIN-protected Remove Access or Restore Access action to change access status.');
      }

      const payload = {
        email: form.email.trim().toLowerCase(),
        display_name: form.display_name || null,
        role: form.role,
        status: form.status,
        creative_member_id: form.creative_member_id || null,
        invited_by: adminUser?.user_id || null,
        updated_at: new Date().toISOString(),
      };

      const query = editingId
        ? supabase.from('admin_users').update(payload).eq('id', editingId).select(teamRecordSelect).single()
        : supabase.from('admin_users').insert(payload).select(teamRecordSelect).single();
      const { data: savedMember, error: saveError } = await query;
      if (saveError) throw saveError;
      setTeam((current) => sortTeam(editingId
        ? current.map((member) => member.id === editingId ? savedMember : member)
        : [savedMember, ...current]));
      setActiveFilter(savedMember.status || 'all');
      setMessage(editingId ? 'Team member updated.' : 'Team invitation added.');
      resetForm();
    } catch (saveError) {
      setError(saveError.message || 'Could not save this team member.');
    } finally {
      setSaving(false);
    }
  }

  function openLifecycle(action, member) {
    if (member.user_id === adminUser?.user_id) {
      setError('You cannot disable your own team access.');
      return;
    }
    if (!isSuperAdmin && isSuperAdminMember(member)) {
      setError('Only a Super Admin can change another Super Admin account.');
      return;
    }
    if (protectedSuperAdminChange(member, normalizedTeamRole(member), 'disabled')) {
      setError('You cannot disable the last active Super Admin.');
      return;
    }
    if (!isSuperAdmin) { setError('Only a Super Admin can perform protected member actions.'); return; }
    setPin(''); setConfirmation(''); setError(''); setLifecycle({ action, member });
  }

  async function runLifecycle(event) {
    event.preventDefault(); const { action, member } = lifecycle;
    setUpdatingMemberId(member.id); setError(''); setMessage('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData?.session;
      if (!session?.access_token) throw new Error('Your session has expired. Please sign in again.');
      const { data, error: invokeError } = await supabase.functions.invoke('admin-member-actions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { action, target_admin_user_id: member.id, pin, confirmation },
      });
      if (invokeError) {
        let specificMessage = '';
        if (invokeError instanceof FunctionsHttpError) {
          const response = invokeError.context;
          try {
            const payload = await response.clone().json();
            specificMessage = payload?.message || payload?.error || '';
          } catch {
            try { specificMessage = await response.text(); } catch { specificMessage = ''; }
          }
        } else if (invokeError instanceof FunctionsFetchError) {
          specificMessage = 'Could not reach the member action service. Please try again.';
        } else if (invokeError instanceof FunctionsRelayError) {
          specificMessage = 'The member action service is temporarily unavailable.';
        }
        throw new Error(specificMessage || invokeError.message || 'The member action failed.');
      }
      if (data?.success === false) throw new Error(data.message || data.error || 'The member action failed.');
      const nextStatus = data?.result?.status;
      if (action === 'remove_access' && nextStatus === 'disabled') {
        setTeam((current) => sortTeam(current.map((item) => item.id === member.id ? { ...item, status: 'disabled', updated_at: new Date().toISOString() } : item)));
        setCreatives((current) => current.map((creative) => creative.id === member.creative_member_id ? { ...creative, is_published: false } : creative));
        setActiveFilter('disabled');
      } else if (action === 'restore_access' && ['active', 'invited'].includes(nextStatus)) {
        setTeam((current) => sortTeam(current.map((item) => item.id === member.id ? { ...item, status: nextStatus, updated_at: new Date().toISOString() } : item)));
        setActiveFilter(nextStatus);
        const { data: restoredCreatives } = await supabase
          .from('creative_members')
          .select('id, name, role, slug, is_published')
          .order('display_order', { ascending: true, nullsFirst: false })
          .order('name', { ascending: true });
        if (restoredCreatives) setCreatives(restoredCreatives);
      } else {
        await loadTeam({ showLoading: false });
      }
      setLifecycle(null);
      setMessage(action === 'remove_access' ? 'Access removed and public traces hidden.' : action === 'restore_access' ? 'Access and previous public visibility restored.' : 'Member permanently deleted and website-visible traces removed.');
    } catch (lifecycleError) {
      setError(lifecycleError.message || 'The member action failed.');
    } finally {
      setUpdatingMemberId('');
    }
  }

  function linkedCreativeName(id) {
    return creatives.find((creative) => creative.id === id)?.name || 'Not linked';
  }

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow="Team CMS"
        title="Team Management"
        description="Add team members, assign roles, link creative profiles, and control access to Lahat Liwa Collectives."
        action={<AdminButton onClick={resetForm} variant="primary"><Plus size={17} /> Add member</AdminButton>}
      />

      {error && <AdminNotice className="mb-5">{error}</AdminNotice>}
      {message && <AdminNotice tone="success" className="mb-5">{message}</AdminNotice>}

      <AdminSurface as="form" onSubmit={save} className="mb-8 grid gap-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Access record</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{editingId ? 'Edit team member' : 'Add team member'}</h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <AdminInput label="Email" type="email" required value={form.email} onChange={(value) => update('email', value)} />
          <AdminInput label="Display name" value={form.display_name} onChange={(value) => update('display_name', value)} />
          <AdminSelect label="Role" value={form.role} options={formRoleOptions} onChange={(value) => update('role', value)} />
          <AdminSelect label="Status" value={form.status} options={formStatusOptions} onChange={(value) => update('status', value)} />
          <label className="grid gap-2 text-sm text-zinc-300">
            <span>Linked creative profile</span>
            <select value={form.creative_member_id} onChange={(event) => update('creative_member_id', event.target.value)} className="w-full rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition focus:ring-amber-200/45">
              <option value="">Not linked</option>
              {creatives.map((creative) => (
                <option key={creative.id} value={creative.id}>{creative.name} / {creative.role}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs leading-5 text-zinc-500">Create an invited record by email. The person can use "Set up team account" on the admin login page to create their password; their role always comes from this team record.</p>
        <div className="flex flex-wrap gap-3">
          <AdminButton disabled={saving} type="submit" variant="primary"><ShieldCheck size={17} /> {saving ? 'Saving...' : editingId ? 'Save member' : 'Add member'}</AdminButton>
          {editingId && <AdminButton onClick={resetForm} variant="ghost">Cancel</AdminButton>}
        </div>
      </AdminSurface>

      {loading ? <LoadingState label="Loading team" /> : (
        team.length ? (
          <div className="grid gap-5">
            <div className="flex gap-6 overflow-x-auto border-b border-white/[0.06] px-0.5">
              {teamFilters.map((filter) => {
                const isActive = activeFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={`shrink-0 border-b px-0 pb-3 text-sm capitalize transition ${isActive ? 'border-amber-200 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}
                  >
                    {filter} <span className="ml-1 text-xs text-zinc-600">{teamCounts[filter]}</span>
                  </button>
                );
              })}
            </div>

            <p className="max-w-3xl text-xs leading-5 text-zinc-500">Removed users are disabled and hidden from the active team list, but their records remain for credits, project history, and security audit.</p>

            {visibleTeam.length ? <AdminSurface className="overflow-hidden p-0">
            <div>
              {visibleTeam.map((member) => {
                const currentAccount = member.user_id === adminUser?.user_id;
                const protectedSuperAdmin = isSuperAdminMember(member) && member.status === 'active' && activeSuperAdminCount <= 1;
                const canManageMember = isSuperAdmin || !isSuperAdminMember(member);
                const canDisable = isSuperAdmin && member.status !== 'disabled' && !currentAccount && !protectedSuperAdmin;
                const canRestore = isSuperAdmin && member.status === 'disabled';
                const canDelete = isSuperAdmin && !currentAccount && !protectedSuperAdmin;
                return (
                <article key={member.id} className={`grid gap-4 border-b border-white/[0.06] px-4 py-4 last:border-b-0 sm:px-5 xl:grid-cols-[minmax(0,1fr)_28rem] xl:items-center xl:gap-6 ${updatingMemberId === member.id ? 'opacity-60' : ''}`}>
                  <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1.35fr)_minmax(8rem,0.65fr)_minmax(0,0.9fr)] md:items-center md:gap-6">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <h3 className="truncate font-medium text-white">{member.display_name || member.email || 'Unnamed member'}</h3>
                        {currentAccount && <span className="shrink-0 text-[11px] text-zinc-500">You</span>}
                      </div>
                      <p className="mt-1 truncate text-sm leading-5 text-zinc-500" title={member.email || ''}>{member.email || 'No email yet'}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 md:block">
                      <div><p className="text-[11px] uppercase tracking-[0.16em] text-zinc-600">Role</p><p className="mt-1 text-sm capitalize text-zinc-300">{roleLabel(member.role)}</p></div>
                      <div className="md:mt-2"><AdminStatusBadge status={member.status}>{member.status}</AdminStatusBadge></div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-600">Creative profile</p>
                      <p className="mt-1 truncate text-sm text-zinc-300">{linkedCreativeName(member.creative_member_id)}</p>
                      <p className="mt-1 text-xs text-zinc-600">Added {formatDate(member.created_at)}</p>
                    </div>
                  </div>
                  <div className="grid grid-rows-[2.25rem_2.25rem] gap-1.5 border-t border-white/[0.05] pt-3 xl:w-full xl:self-stretch xl:border-l xl:border-t-0 xl:py-1 xl:pl-5">
                    <AdminActionGroup className="min-h-9 xl:justify-start">
                      {canManageMember && <AdminActionButton disabled={updatingMemberId === member.id} onClick={() => editMember(member)}><Edit size={14} /> Edit</AdminActionButton>}
                      {creatives.some((creative) => creative.id === member.creative_member_id && creative.slug) && <AdminActionButton to={`/admin/creatives?preview=${member.creative_member_id}`}><Eye size={14} /> Preview</AdminActionButton>}
                      {creatives.some((creative) => creative.id === member.creative_member_id && creative.slug) && <AdminActionButton onClick={() => copyMemberProfile(member)}><Copy size={14} /> Copy link</AdminActionButton>}
                      {member.status !== 'disabled' && creatives.find((creative) => creative.id === member.creative_member_id)?.is_published && <AdminActionButton to={`/creatives/${creatives.find((creative) => creative.id === member.creative_member_id).slug}`}><ExternalLink size={14} /> Public</AdminActionButton>}
                    </AdminActionGroup>
                    <AdminActionGroup className="min-h-9 xl:justify-start">
                      {canDisable && <AdminActionButton disabled={updatingMemberId === member.id} onClick={() => openLifecycle('remove_access', member)} variant="danger"><ShieldOff size={14} /> Remove Access</AdminActionButton>}
                      {canRestore && <AdminActionButton disabled={updatingMemberId === member.id} onClick={() => openLifecycle('restore_access', member)}><RotateCcw size={14} /> Restore Access</AdminActionButton>}
                      {canDelete && <AdminActionButton disabled={updatingMemberId === member.id} onClick={() => openLifecycle('permanent_delete', member)} variant="danger"><Trash2 size={14} /> Permanently Delete</AdminActionButton>}
                    </AdminActionGroup>
                  </div>
                </article>
              );})}
            </div>
          </AdminSurface> : <AdminEmptyState title={emptyFilterCopy[activeFilter]} />}
          </div>
        ) : <AdminEmptyState title={emptyFilterCopy[activeFilter]} />
      )}
      {lifecycle && <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true">
        <AdminSurface as="form" onSubmit={runLifecycle} className="w-full max-w-lg grid gap-5">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-zinc-500">PIN-protected action</p><h2 className="mt-2 text-xl font-semibold text-white">{lifecycle.action === 'permanent_delete' ? 'Permanently Delete' : lifecycle.action === 'restore_access' ? 'Restore Access' : 'Remove Access'}</h2></div><button type="button" onClick={() => setLifecycle(null)} aria-label="Close"><X size={20} /></button></div>
          <p className="text-sm leading-6 text-zinc-300">{lifecycle.action === 'permanent_delete' ? "This removes the member's website-visible traces and cannot be easily undone." : lifecycle.action === 'restore_access' ? 'This restores access and visibility saved when access was removed.' : 'This temporarily blocks admin access and hides linked public profiles, projects, and credits. It can be restored.'}</p>
          {error && <AdminNotice>{error}</AdminNotice>}
          <AdminInput label="Super Admin PIN" type="password" required value={pin} onChange={setPin} />
          {lifecycle.action === 'permanent_delete' && <AdminInput label="Type DELETE to confirm" required value={confirmation} onChange={setConfirmation} />}
          <div className="flex gap-3"><AdminButton type="submit" variant={lifecycle.action === 'permanent_delete' ? 'danger' : 'primary'} disabled={!pin || (lifecycle.action === 'permanent_delete' && confirmation !== 'DELETE') || updatingMemberId === lifecycle.member.id}>{updatingMemberId ? 'Working...' : 'Confirm action'}</AdminButton><AdminButton onClick={() => setLifecycle(null)} variant="ghost">Cancel</AdminButton></div>
        </AdminSurface>
      </div>}
    </AdminLayout>
  );
}

