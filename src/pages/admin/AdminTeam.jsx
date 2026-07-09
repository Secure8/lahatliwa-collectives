import { Edit, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
  AdminButton,
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

const emptyForm = {
  email: '',
  display_name: '',
  role: 'creative',
  status: 'invited',
  creative_member_id: '',
};

export default function AdminTeam() {
  const { role, adminUser } = useAdminAccess();
  const [team, setTeam] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isSuperAdmin = role === 'super_admin';
  const superAdminCount = useMemo(() => team.filter((member) => ['super_admin', 'owner'].includes(member.role) && member.status !== 'disabled').length, [team]);

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
    const currentRole = member?.role === 'owner' ? 'super_admin' : member?.role;
    const isLastSuperAdmin = currentRole === 'super_admin' && superAdminCount <= 1;
    return isLastSuperAdmin && (nextRole !== 'super_admin' || nextStatus === 'disabled');
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const existing = team.find((member) => member.id === editingId);
      if (!isSuperAdmin && form.role === 'super_admin') {
        throw new Error('Only a Super Admin can create or edit Super Admin accounts.');
      }
      if (!isSuperAdmin && existing?.role === 'super_admin') {
        throw new Error('Only a Super Admin can edit a Super Admin account.');
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
        ? supabase.from('admin_users').update(payload).eq('id', editingId)
        : supabase.from('admin_users').insert(payload);
      const { error: saveError } = await query;
      if (saveError) throw saveError;
      resetForm();
      await loadTeam();
    } catch (saveError) {
      setError(saveError.message || 'Could not save this team member.');
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(member) {
    if (member.user_id === adminUser?.user_id) {
      setError('You cannot remove your own team access.');
      return;
    }
    if (protectedSuperAdminChange(member, 'viewer', 'disabled')) {
      setError('You cannot remove the last active Super Admin.');
      return;
    }
    if (!window.confirm(`Remove ${member.email || member.display_name || 'this team member'}?`)) return;
    const { error: deleteError } = await supabase.from('admin_users').delete().eq('id', member.id);
    if (deleteError) setError(deleteError.message);
    else setTeam((current) => current.filter((item) => item.id !== member.id));
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

      <AdminSurface as="form" onSubmit={save} className="mb-8 grid gap-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Access record</p>
          <h2 className="mt-2 text-xl font-semibold text-white">{editingId ? 'Edit team member' : 'Add team member'}</h2>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <AdminInput label="Email" type="email" required value={form.email} onChange={(value) => update('email', value)} />
          <AdminInput label="Display name" value={form.display_name} onChange={(value) => update('display_name', value)} />
          <AdminSelect label="Role" value={form.role} options={roleOptions} onChange={(value) => update('role', value)} />
          <AdminSelect label="Status" value={form.status} options={statusOptions} onChange={(value) => update('status', value)} />
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
        <p className="text-xs leading-5 text-zinc-500">Create an invited record by email. When that person signs in with Supabase Auth using the same email, their account links to this role.</p>
        <div className="flex flex-wrap gap-3">
          <AdminButton disabled={saving} type="submit" variant="primary"><ShieldCheck size={17} /> {saving ? 'Saving...' : editingId ? 'Save member' : 'Add member'}</AdminButton>
          {editingId && <AdminButton onClick={resetForm} variant="ghost">Cancel</AdminButton>}
        </div>
      </AdminSurface>

      {loading ? <LoadingState label="Loading team" /> : (
        team.length ? (
          <AdminSurface>
            <div className="grid gap-1">
              {team.map((member) => (
                <article key={member.id} className="grid gap-4 border-b border-white/[0.06] py-4 last:border-b-0 lg:grid-cols-[1.2fr_0.8fr_0.9fr_auto] lg:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-white">{member.display_name || member.email || 'Unnamed member'}</h3>
                      <AdminStatusBadge status={member.status}>{member.status}</AdminStatusBadge>
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
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <AdminButton onClick={() => editMember(member)} variant="secondary"><Edit size={15} /> Edit</AdminButton>
                    <AdminButton onClick={() => removeMember(member)} variant="danger"><Trash2 size={15} /> Remove</AdminButton>
                  </div>
                </article>
              ))}
            </div>
          </AdminSurface>
        ) : <AdminEmptyState title="No team members yet" message="Create the first team record above." />
      )}
    </AdminLayout>
  );
}
