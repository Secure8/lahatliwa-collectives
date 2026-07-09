import { Edit, Plus, RotateCcw, ShieldCheck, ShieldOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { supabase } from '../../lib/supabaseClient';

const roleOptions = ['super_admin', 'admin', 'editor', 'creative', 'viewer'];
const statusOptions = ['active', 'invited', 'disabled'];
const teamFilters = ['active', 'invited', 'disabled', 'all'];
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
  const formStatusOptions = editingCurrentAccount ? [editingMember.status] : statusOptions;

  async function loadTeam() {
    setLoading(true);
    const [{ data: teamRows, error: teamError }, { data: creativeRows }] = await Promise.all([
      supabase
        .from('admin_users')
        .select('id, user_id, email, display_name, avatar_url, role, status, creative_member_id, created_at, updated_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('creative_members')
        .select('id, name, role')
        .order('display_order', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true }),
    ]);

    if (teamError) setError(teamError.message);
    else setTeam(teamRows || []);
    setCreatives(creativeRows || []);
    setLoading(false);
  }

  useEffect(() => {
    loadTeam();
  }, []);

  function update(name, value) {
    setForm((current) => ({ ...current, [name]: value }));
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

  async function disableMember(member) {
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
    if (!window.confirm(`Remove admin access for ${member.email || member.display_name || 'this team member'}? Their team record and project history will be retained.`)) return;

    setUpdatingMemberId(member.id);
    setError('');
    setMessage('');
    const { data: disabledMember, error: updateError } = await supabase
      .from('admin_users')
      .update({ status: 'disabled', updated_at: new Date().toISOString() })
      .eq('id', member.id)
      .select(teamRecordSelect)
      .single();
    if (updateError) setError(updateError.message);
    else {
      setTeam((current) => sortTeam(current.map((item) => item.id === member.id ? disabledMember : item)));
      setMessage('Access removed. The retained team record is available under Disabled or All.');
    }
    setUpdatingMemberId('');
  }

  async function restoreMember(member) {
    if (!isSuperAdmin && isSuperAdminMember(member)) {
      setError('Only a Super Admin can restore another Super Admin account.');
      return;
    }

    const restoredStatus = member.user_id ? 'active' : 'invited';
    setUpdatingMemberId(member.id);
    setError('');
    setMessage('');
    const { data: restoredMember, error: updateError } = await supabase
      .from('admin_users')
      .update({ status: restoredStatus, updated_at: new Date().toISOString() })
      .eq('id', member.id)
      .select(teamRecordSelect)
      .single();
    if (updateError) setError(updateError.message);
    else {
      setTeam((current) => sortTeam(current.map((item) => item.id === member.id ? restoredMember : item)));
      setMessage(restoredStatus === 'active' ? 'Team access restored.' : 'Invitation restored. The member can now set up their account.');
    }
    setUpdatingMemberId('');
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
            <div className="flex gap-5 overflow-x-auto border-b border-white/[0.06]">
              {teamFilters.map((filter) => {
                const isActive = activeFilter === filter;
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActiveFilter(filter)}
                    className={`shrink-0 border-b-2 px-0 pb-3 text-sm capitalize transition ${isActive ? 'border-amber-200 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-200'}`}
                  >
                    {filter} <span className="ml-1 text-xs text-zinc-600">{teamCounts[filter]}</span>
                  </button>
                );
              })}
            </div>

            <p className="max-w-3xl text-xs leading-5 text-zinc-500">Removed users are disabled and hidden from the active team list, but their records remain for credits, project history, and security audit.</p>

            {visibleTeam.length ? <AdminSurface>
            <div className="grid gap-1">
              {visibleTeam.map((member) => {
                const currentAccount = member.user_id === adminUser?.user_id;
                const protectedSuperAdmin = isSuperAdminMember(member) && member.status === 'active' && activeSuperAdminCount <= 1;
                const canManageMember = isSuperAdmin || !isSuperAdminMember(member);
                const canDisable = member.status !== 'disabled' && !currentAccount && !protectedSuperAdmin && canManageMember;
                const canRestore = member.status === 'disabled' && canManageMember;
                return (
                <article key={member.id} className="grid gap-4 border-b border-white/[0.06] py-4 last:border-b-0 lg:grid-cols-[1.2fr_0.8fr_0.9fr_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-white">{member.display_name || member.email || 'Unnamed member'}</h3>
                      <AdminStatusBadge status={member.status}>{member.status}</AdminStatusBadge>
                      {currentAccount && <AdminStatusBadge>Current account</AdminStatusBadge>}
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">{member.email || 'No email yet'}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">Role</p>
                    <p className="mt-1 text-sm capitalize text-zinc-300">{roleLabel(member.role)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">Creative profile</p>
                    <p className="mt-1 text-sm text-zinc-300">{linkedCreativeName(member.creative_member_id)}</p>
                    <p className="mt-1 text-xs text-zinc-600">{formatDate(member.created_at)}</p>
                  </div>
                  <AdminActionGroup className="lg:justify-end">
                    {canManageMember && <AdminActionButton disabled={updatingMemberId === member.id} onClick={() => editMember(member)}><Edit size={14} /> Edit</AdminActionButton>}
                    {canDisable && <AdminActionButton disabled={updatingMemberId === member.id} onClick={() => disableMember(member)} variant="danger"><ShieldOff size={14} /> Remove Access</AdminActionButton>}
                    {canRestore && <AdminActionButton disabled={updatingMemberId === member.id} onClick={() => restoreMember(member)}><RotateCcw size={14} /> Restore Access</AdminActionButton>}
                  </AdminActionGroup>
                </article>
              );})}
            </div>
          </AdminSurface> : <AdminEmptyState title={`No ${activeFilter} team members`} message={activeFilter === 'disabled' ? 'Removed team members will appear here.' : `There are no team records in the ${activeFilter} view.`} />}
          </div>
        ) : <AdminEmptyState title="No team members yet" message="Create the first team record above." />
      )}
    </AdminLayout>
  );
}

