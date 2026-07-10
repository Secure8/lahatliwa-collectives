import { ImagePlus, Save, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminInput, AdminNotice, AdminPageHeader, AdminSurface, AdminTextarea } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { useAdminAccess } from '../../lib/adminAccess';
import { uploadSiteAsset } from '../../lib/contentApi';
import { parseList } from '../../lib/helpers';
import { uploadStatusText } from '../../lib/imageCompression';
import { supabase } from '../../lib/supabaseClient';

function linksFromText(value) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [label, ...rest] = line.split(':');
    return { label: rest.length ? label.trim() : 'Link', href: rest.length ? rest.join(':').trim() : line };
  });
}

export default function MyProfile() {
  const { adminUser, user } = useAdminAccess();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const previewRef = useRef('');

  useEffect(() => {
    if (!adminUser?.creative_member_id) { setProfile(false); return; }
    supabase.from('creative_members').select('*').eq('id', adminUser.creative_member_id).maybeSingle().then(({ data, error }) => {
      setProfile(data || false);
      setForm(data ? { ...data, skills: (data.skills || []).join(', '), social_links: (data.social_links || []).map((item) => `${item.label}: ${item.href}`).join('\n') } : {});
      setNotice(error?.message || '');
    });
    return () => { if (previewRef.current) URL.revokeObjectURL(previewRef.current); };
  }, [adminUser?.creative_member_id]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function save(event) {
    event.preventDefault(); setSaving(true); setNotice('');
    const payload = { name: form.name.trim(), role: form.role.trim(), short_bio: form.short_bio?.trim() || null, full_bio: form.full_bio?.trim() || null, skills: parseList(form.skills), social_links: linksFromText(form.social_links || ''), availability_status: form.availability_status?.trim() || null, profile_image_url: form.profile_image_url || null };
    const { data, error } = await supabase.from('creative_members').update(payload).eq('id', profile.id).select('*').single();
    if (error) setNotice(error.message); else { setProfile(data); setForm((current) => ({ ...current, ...data, skills: (data.skills || []).join(', '), social_links: (data.social_links || []).map((item) => `${item.label}: ${item.href}`).join('\n') })); setNotice('Profile saved.'); }
    setSaving(false);
  }

  async function uploadPhoto(file) {
    if (!file || !user?.id) return;
    setUploading(true); setNotice('');
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = URL.createObjectURL(file); update('profile_image_url', previewRef.current);
    try {
      const url = await uploadSiteAsset(file, `creative-profiles/${user.id}/profile`, 'creativeProfile', { onStatus: (status) => setNotice(uploadStatusText(status)) });
      const { data, error } = await supabase.from('creative_members').update({ profile_image_url: url }).eq('id', profile.id).select('*').single();
      if (error) throw error;
      if (previewRef.current) { URL.revokeObjectURL(previewRef.current); previewRef.current = ''; }
      setProfile(data); update('profile_image_url', data.profile_image_url); setNotice('Profile photo updated.');
    } catch (error) { update('profile_image_url', profile.profile_image_url || ''); setNotice(error.message || 'Profile photo upload failed.'); }
    finally { setUploading(false); }
  }

  async function removePhoto() {
    if (!window.confirm('Remove your current profile photo?')) return;
    setSaving(true); const { data, error } = await supabase.from('creative_members').update({ profile_image_url: null }).eq('id', profile.id).select('*').single();
    if (error) setNotice(error.message); else { setProfile(data); update('profile_image_url', ''); setNotice('Profile photo removed.'); }
    setSaving(false);
  }

  if (profile === null) return <AdminLayout><LoadingState label="Loading your profile" /></AdminLayout>;
  if (profile === false) return <AdminLayout><AdminPageHeader eyebrow="My profile" title="Profile link needed" description="Your dashboard account is not linked to a creative profile. Ask an administrator to link your team account to the correct profile." /></AdminLayout>;
  const success = /saved|updated|removed|compressing|uploading/i.test(notice);
  return <AdminLayout><AdminPageHeader eyebrow="Creative profile" title="My Profile" description="Manage the public details connected to your dashboard account." />
    {notice && <AdminNotice tone={success ? 'success' : 'error'} className="mb-5">{notice}</AdminNotice>}
    <AdminSurface as="form" onSubmit={save} className="grid gap-5">
      <div className="grid gap-5 md:grid-cols-[auto_1fr]"><div className="grid gap-3"><div className="grid h-32 w-32 place-items-center overflow-hidden rounded-lg bg-white/[0.055] ring-1 ring-white/[0.08]">{form.profile_image_url ? <img src={form.profile_image_url} alt="Profile preview" className="h-full w-full object-cover" /> : <span className="text-3xl text-zinc-600">{form.name?.slice(0, 1)}</span>}</div><div className="flex flex-wrap gap-2"><label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-white/[0.055] px-3 py-2 text-sm text-zinc-200 ring-1 ring-white/[0.08]"><ImagePlus size={15} />{uploading ? 'Uploading...' : form.profile_image_url ? 'Replace photo' : 'Upload photo'}<input className="sr-only" disabled={uploading || saving} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { uploadPhoto(event.target.files?.[0]); event.target.value = ''; }} /></label>{form.profile_image_url && <AdminButton type="button" variant="danger" disabled={uploading || saving} onClick={removePhoto}><Trash2 size={15} /> Remove</AdminButton>}</div><p className="text-xs leading-5 text-zinc-500">JPEG, PNG, or WebP. Large images are resized and optimized to 300 KB.</p></div>
        <div className="grid gap-5 md:grid-cols-2"><AdminInput label="Display name" required value={form.name || ''} onChange={(value) => update('name', value)} /><AdminInput label="Professional title / discipline" required value={form.role || ''} onChange={(value) => update('role', value)} /><AdminInput label="Availability" value={form.availability_status || ''} onChange={(value) => update('availability_status', value)} /><AdminInput label="Skills, comma-separated" value={form.skills || ''} onChange={(value) => update('skills', value)} /></div></div>
      <AdminTextarea label="Short introduction" value={form.short_bio || ''} onChange={(value) => update('short_bio', value)} /><AdminTextarea label="Biography" value={form.full_bio || ''} onChange={(value) => update('full_bio', value)} /><AdminTextarea label="Public social links, one per line as Label: URL" value={form.social_links || ''} onChange={(value) => update('social_links', value)} />
      <AdminButton type="submit" disabled={saving || uploading} variant="primary" className="w-fit"><Save size={16} />{saving ? 'Saving...' : 'Save profile'}</AdminButton>
    </AdminSurface></AdminLayout>;
}
