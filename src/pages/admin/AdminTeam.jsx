import { Copy, Edit, Eye, ExternalLink, Plus, RotateCcw, ShieldCheck, ShieldOff, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { roleLabel, useAdminAccess } from '../../lib/adminAccess';
import { formatDate } from '../../lib/helpers';
import { copyText } from '../../lib/clipboard';
import { supabase } from '../../lib/supabaseClient';

const roleOptions = ['super_admin', 'admin', 'editor', 'creative', 'viewer'];
const statusOptions = ['active', 'invited'];
const teamFilters = ['all', 'active', 'disabled', 'invited'];
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
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lifecycle, setLifecycle] = useState(null);
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const mountedRef = useRef(true);
  const loadRequestRef = useRef(0);

  const isSuperAdmin = role === 'super_admin';
  const availableRoleOptions = isSuperAdmin ? roleOptions : roleOptions.filter((option) => option !== 'super_admin');
  const activeSuperAdminCount = useMemo(() => team.filter((member) => isSuperAdminMember(member) && member.status === 'active').length, [team]);
  const teamCounts = useMemo(() => ({
    active: team.filter((member) => member.status === 'active').length,
    invited: team.filter((member) => member.status === 'invited').length,
    disabled: team.filter((member) => member.status === 'disabled').length,
    all: team.length,
  }), [team]);
  const visibleTeam = useMemo(() => {
    const query = search.trim().toLowerCase();
    return team.filter((member) => (
      (activeFilter === 'all' || member.status === activeFilter)
      && (roleFilter === 'all' || normalizedTeamRole(member) === roleFilter)
      && (!query || [member.display_name, member.email].some((value) => String(value || '').toLowerCase().includes(query)))
    ));
  }, [activeFilter, roleFilter, search, team]);
  const editingMember = team.find((member) => member.id === editingId);
  const editingCurrentAccount = editingMember?.user_id === adminUser?.user_id;
  const formRoleOptions = editingCurrentAccount ? [normalizedTeamRole(editingMember)] : availableRoleOptions;
  const formStatusOptions = editingMember ? [editingMember.status] : statusOptions;

  async function loadTeam({ showLoading = true } = {}) {
    const requestId = ++loadRequestRef.current;
    if (showLoading) setLoading(true);
    setLoadError('');
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

    if (!mountedRef.current || requestId !== loadRequestRef.current) return;
    if (teamError) setLoadError(teamError.message || 'Unable to load team members.');
    else setTeam(teamRows || []);
    if (!teamError) setCreatives(creativeRows || []);
    if (showLoading) setLoading(false);
  }

  useEffect(() => {
    mountedRef.current = true;
    loadTeam();
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!showMemberForm && !lifecycle) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape' || saving || updatingMemberId) return;
      if (showMemberForm) resetForm();
      else setLifecycle(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape); };
  }, [lifecycle, saving, showMemberForm, updatingMemberId]);

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
    setShowMemberForm(false);
    setError('');
  }

  function openAddMember() {
    setError('');
    setMessage('');
    setEditingId('');
    setForm(emptyForm);
    setShowMemberForm(true);
  }

  function editMember(member) {
    setError('');
    setMessage('');
    setEditingId(member.id);
    setShowMemberForm(true);
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
      <div className="w-full max-w-6xl">
      <AdminPageHeader
        eyebrow="Team CMS"
        title="Team Management"
        description="Add team members, assign roles, link creative profiles, and control access to Lahat Liwa Collectives."
        action={<AdminButton onClick={openAddMember} variant="primary"><Plus size={17} /> Add Member</AdminButton>}
      />

      {error && <AdminNotice className="mb-5">{error}</AdminNotice>}
      {message && <AdminNotice tone="success" className="mb-5">{message}</AdminNotice>}

      <section className="border-b border-white/[0.08] pb-6" aria-labelledby="team-summary-heading">
        <div className="mb-5">
          <h2 id="team-summary-heading" className="text-lg font-semibold text-white">Team Summary</h2>
          <p className="mt-1 text-sm text-zinc-500">Active and disabled access records remain visible here for lifecycle management.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4">
          {[['all', 'Total'], ['active', 'Active'], ['disabled', 'Disabled'], ['invited', 'Invited']].map(([key, label]) => (
            <div key={key} className="border-t border-white/[0.08] py-4 pr-4 sm:px-4 sm:first:pl-0">
              <p className="text-xs uppercase tracking-[0.14em] text-zinc-600">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{teamCounts[key]}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 border-b border-white/[0.08] py-6 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1fr)_12rem]">
        <label className="grid gap-1.5 text-sm text-zinc-300">
          <span>Search members</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name or email" className="w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-2.5 text-white outline-none transition placeholder:text-zinc-700 focus:border-amber-200/60" />
        </label>
        <label className="grid gap-1.5 text-sm text-zinc-300">
          <span>Role</span>
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-2.5 text-white outline-none [color-scheme:dark] focus:border-amber-200/60">
            <option value="all">All roles</option>
            {roleOptions.map((option) => <option key={option} value={option}>{roleLabel(option)}</option>)}
          </select>
        </label>
      </section>

      {loading ? <TeamSkeleton /> : loadError ? (
        <div className="border-b border-red-300/15 py-8">
          <p className="text-sm text-red-200">{loadError}</p>
          <button type="button" onClick={() => loadTeam()} className="mt-3 border-b border-red-200/30 pb-1 text-sm text-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200/50">Retry loading team</button>
        </div>
      ) : (
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

            <p className="max-w-3xl text-xs leading-5 text-zinc-500">Removed users remain visible under All and Disabled so Super Admins can restore access while preserving credits and project history.</p>

            {visibleTeam.length ? <div className="border-b border-white/[0.08]">
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
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-white/[0.04] text-sm font-medium text-zinc-500">
                        {member.avatar_url ? <img src={member.avatar_url} alt="" className="h-full w-full object-cover" /> : String(member.display_name || member.email || '?').slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-2">
                        <h3 className="truncate font-medium text-white">{member.display_name || member.email || 'Unnamed member'}</h3>
                        {currentAccount && <span className="shrink-0 text-[11px] text-zinc-500">You</span>}
                      </div>
                      <p className="mt-1 truncate text-sm leading-5 text-zinc-500" title={member.email || ''}>{member.email || 'No email yet'}</p>
                      </div>
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
          </div> : <AdminEmptyState title={team.length ? 'No members match these filters.' : emptyFilterCopy[activeFilter]} message={team.length ? 'Adjust the search, role, or status filter.' : undefined} />}
          </div>
        ) : <AdminEmptyState title={emptyFilterCopy[activeFilter]} />
      )}
      {showMemberForm && <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="member-form-title">
        <AdminSurface as="form" onSubmit={save} className="grid max-h-[calc(100vh-2rem)] w-full max-w-2xl gap-5 overflow-y-auto border-amber-200/25 bg-zinc-950/98 shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-amber-200/15 pb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Access record</p>
              <h2 id="member-form-title" className="mt-2 text-xl font-semibold text-white">{editingId ? 'Edit Team Member' : 'Add Member'}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">{editingId ? 'Update this member’s existing team record.' : 'Invite a person and assign their initial team access.'}</p>
            </div>
            <button type="button" onClick={resetForm} disabled={saving} aria-label="Close member form" className="text-zinc-400 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/50 disabled:cursor-not-allowed disabled:opacity-50"><X size={20} /></button>
          </div>
          {error && <AdminNotice>{error}</AdminNotice>}
          <div className="grid gap-5 sm:grid-cols-2">
            <AdminInput label="Email" type="email" required value={form.email} onChange={(value) => update('email', value)} />
            <AdminInput label="Display name" value={form.display_name} onChange={(value) => update('display_name', value)} />
            <AdminSelect label="Role" value={form.role} options={formRoleOptions} onChange={(value) => update('role', value)} />
            <AdminSelect label="Status" value={form.status} options={formStatusOptions} onChange={(value) => update('status', value)} />
            <label className="grid gap-2 text-sm text-zinc-300 sm:col-span-2">
              <span>Linked creative profile</span>
              <select value={form.creative_member_id} onChange={(event) => update('creative_member_id', event.target.value)} className="w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-2.5 text-white outline-none [color-scheme:dark] focus:border-amber-200/60">
                <option value="">Not linked</option>
                {creatives.map((creative) => <option key={creative.id} value={creative.id}>{creative.name} / {creative.role}</option>)}
              </select>
            </label>
          </div>
          <p className="text-xs leading-5 text-zinc-500">Create an invited record by email. The person can use “Set up team account” on the admin login page to create their password; their role always comes from this team record.</p>
          <div className="flex flex-wrap gap-3">
            <AdminButton disabled={saving} type="submit" variant="primary"><ShieldCheck size={17} /> {saving ? 'Saving...' : editingId ? 'Save Member' : 'Add Member'}</AdminButton>
            <AdminButton disabled={saving} onClick={resetForm} variant="ghost">Cancel</AdminButton>
          </div>
        </AdminSurface>
      </div>}
      {lifecycle && <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="lifecycle-dialog-title">
        <AdminSurface as="form" onSubmit={runLifecycle} className="grid w-full max-w-lg gap-5 border-amber-200/25 bg-zinc-950/98 shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-amber-200/15 pb-4"><div><p className="text-xs uppercase tracking-[0.2em] text-zinc-500">PIN-protected action</p><h2 id="lifecycle-dialog-title" className="mt-2 text-xl font-semibold text-white">{lifecycle.action === 'permanent_delete' ? 'Permanently Delete' : lifecycle.action === 'restore_access' ? 'Restore Access' : 'Remove Access'}</h2></div><button type="button" onClick={() => setLifecycle(null)} aria-label="Close lifecycle dialog" className="text-zinc-400 hover:text-white"><X size={20} /></button></div>
          <p className="text-sm leading-6 text-zinc-300">{lifecycle.action === 'permanent_delete' ? "This removes the member's website-visible traces and cannot be easily undone." : lifecycle.action === 'restore_access' ? 'This restores access and visibility saved when access was removed.' : 'This temporarily blocks admin access and hides linked public profiles, projects, and credits. It can be restored.'}</p>
          {error && <AdminNotice>{error}</AdminNotice>}
          <AdminInput label="Super Admin PIN" type="password" required value={pin} onChange={setPin} />
          {lifecycle.action === 'permanent_delete' && <AdminInput label="Type DELETE to confirm" required value={confirmation} onChange={setConfirmation} />}
          <div className="flex gap-3"><AdminButton type="submit" variant={lifecycle.action === 'permanent_delete' ? 'danger' : 'primary'} disabled={!pin || (lifecycle.action === 'permanent_delete' && confirmation !== 'DELETE') || updatingMemberId === lifecycle.member.id}>{updatingMemberId ? 'Working...' : 'Confirm action'}</AdminButton><AdminButton onClick={() => setLifecycle(null)} variant="ghost">Cancel</AdminButton></div>
        </AdminSurface>
      </div>}
      </div>
    </AdminLayout>
  );
}

function TeamSkeleton() {
  return <div className="py-5" aria-label="Loading team members">{[0, 1, 2, 3].map((item) => <div key={item} className="grid grid-cols-[2.5rem_1fr] gap-3 border-b border-white/[0.08] py-5"><div className="h-10 w-10 animate-pulse rounded-full bg-white/[0.05]" /><div className="grid content-center gap-3"><div className="h-3 w-40 max-w-full animate-pulse bg-white/[0.05]" /><div className="h-2 w-56 max-w-full animate-pulse bg-white/[0.04]" /></div></div>)}</div>;
}

