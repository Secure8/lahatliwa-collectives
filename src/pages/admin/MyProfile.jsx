import { Copy, ExternalLink, Eye, ImagePlus, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import CreativeProfileView from '../../components/CreativeProfileView';
import { AdminButton, AdminInput, AdminNotice, AdminPageHeader, AdminSurface, AdminTextarea } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { useAdminAccess } from '../../lib/adminAccess';
import { copyText } from '../../lib/clipboard';
import { uploadSiteAsset } from '../../lib/contentApi';
import { parseList } from '../../lib/helpers';
import { uploadStatusText } from '../../lib/imageCompression';
import { socialLinksFromText } from '../../lib/socialLinks';
import { supabase } from '../../lib/supabaseClient';

function formFromProfile(profile) {
  return {
    ...profile,
    skills: (profile.skills || []).join(', '),
    social_links: (profile.social_links || []).map((item) => `${item.label}: ${item.href}`).join('\n'),
  };
}

export default function MyProfile() {
  const { adminUser, user } = useAdminAccess();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    if (!adminUser?.creative_member_id) {
      setProfile(false);
      return;
    }
    supabase.from('creative_members').select('*').eq('id', adminUser.creative_member_id).maybeSingle().then(({ data, error }) => {
      setProfile(data || false);
      setForm(data ? formFromProfile(data) : {});
      setNotice(error?.message || '');
    });
  }, [adminUser?.creative_member_id]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    const payload = {
      name: form.name.trim(), role: form.role.trim(), short_bio: form.short_bio?.trim() || null,
      full_bio: form.full_bio?.trim() || null, skills: parseList(form.skills), social_links: socialLinksFromText(form.social_links || ''),
      availability_status: form.availability_status?.trim() || null, profile_image_url: form.profile_image_url || null,
      cover_image: form.cover_image || null,
    };
    const { data, error } = await supabase.from('creative_members').update(payload).eq('id', profile.id).select('*').single();
    if (error) setNotice(error.message);
    else { setProfile(data); setForm(formFromProfile(data)); setNotice('Profile saved.'); }
    setSaving(false);
  }

  async function uploadImage(file, kind) {
    if (!file || !user?.id) return;
    setUploading(true);
    setNotice('');
    const isCover = kind === 'cover';
    try {
      const url = await uploadSiteAsset(file, `creative-profiles/${user.id}/${isCover ? 'cover' : 'profile'}`, isCover ? 'creativeCover' : 'creativeProfile', {
        onStatus: (status) => setNotice(uploadStatusText(status)),
      });
      const field = isCover ? 'cover_image' : 'profile_image_url';
      const { data, error } = await supabase.from('creative_members').update({ [field]: url }).eq('id', profile.id).select('*').single();
      if (error) throw error;
      setProfile(data);
      setForm(formFromProfile(data));
      setNotice(isCover ? 'Cover photo updated.' : 'Profile photo updated.');
    } catch (uploadError) {
      setNotice(uploadError.message || `${isCover ? 'Cover' : 'Profile'} photo upload failed.`);
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(field, label) {
    if (!window.confirm(`Remove your current ${label}?`)) return;
    setSaving(true);
    const { data, error } = await supabase.from('creative_members').update({ [field]: null }).eq('id', profile.id).select('*').single();
    if (error) setNotice(error.message);
    else { setProfile(data); setForm(formFromProfile(data)); setNotice(`${label[0].toUpperCase()}${label.slice(1)} removed.`); }
    setSaving(false);
  }

  async function copyProfileLink() {
    try { await copyText(`${window.location.origin}/creatives/${profile.slug}`); setNotice('Profile link copied.'); }
    catch (copyError) { setNotice(copyError.message || 'Profile link could not be copied.'); }
  }

  if (profile === null) return <AdminLayout><LoadingState label="Loading your profile" /></AdminLayout>;
  if (profile === false) return <AdminLayout><AdminPageHeader eyebrow="My profile" title="Profile link needed" description="Your dashboard account is not linked to a creative profile. Ask an administrator to link your team account to the correct profile." /></AdminLayout>;
  const success = /saved|updated|removed|copied|compressing|uploading/i.test(notice);

  if (previewMode) {
    return <AdminLayout><AdminPageHeader eyebrow="Creative profile" title="My Profile Preview" description="Preview your public profile appearance." action={<AdminButton onClick={() => setPreviewMode(false)} variant="ghost">Back to my profile</AdminButton>} />{notice && <AdminNotice tone={success ? 'success' : 'error'} className="mb-5">{notice}</AdminNotice>}<section className="border-y border-white/[0.08] py-7"><div className="mb-7 flex flex-wrap justify-end gap-2"><AdminButton onClick={copyProfileLink}><Copy size={16} /> Copy link</AdminButton>{profile.is_published && <AdminButton to={`/creatives/${profile.slug}`}><ExternalLink size={16} /> Open public</AdminButton>}</div><CreativeProfileView creative={profile} adminPreview /></section></AdminLayout>;
  }

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow="Creative profile"
        title="My Profile"
        description="Manage the public details connected to your dashboard account."
        action={<><AdminButton onClick={() => setPreviewMode(true)}><Eye size={16} /> Preview profile</AdminButton><AdminButton onClick={copyProfileLink}><Copy size={16} /> Copy link</AdminButton>{profile.is_published && <AdminButton to={`/creatives/${profile.slug}`}><ExternalLink size={16} /> Open public</AdminButton>}</>}
      />
      {notice && <AdminNotice tone={success ? 'success' : 'error'} className="mb-5">{notice}</AdminNotice>}
      <AdminSurface as="form" onSubmit={save} className="grid gap-5">
        <div className="grid gap-5 md:grid-cols-[auto_1fr]">
          <div className="grid gap-3">
            <div className="grid h-32 w-32 place-items-center overflow-hidden rounded-full bg-white/[0.055] ring-1 ring-white/[0.08]">{form.profile_image_url ? <img src={form.profile_image_url} alt="Profile preview" className="h-full w-full object-cover" /> : <span className="text-3xl text-zinc-600">{form.name?.slice(0, 1)}</span>}</div>
            <div className="flex flex-wrap gap-2"><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-white/[0.055] px-4 text-sm text-zinc-200 ring-1 ring-white/[0.08]"><ImagePlus size={15} />{uploading ? 'Uploading...' : form.profile_image_url ? 'Replace photo' : 'Upload photo'}<input className="sr-only" disabled={uploading || saving} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { uploadImage(event.target.files?.[0], 'profile'); event.target.value = ''; }} /></label>{form.profile_image_url && <AdminButton type="button" variant="danger" disabled={uploading || saving} onClick={() => removeImage('profile_image_url', 'profile photo')}><Trash2 size={15} /> Remove</AdminButton>}</div>
            <p className="text-xs leading-5 text-zinc-500">JPEG, PNG, or WebP. Large images are resized and optimized to 300 KB.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2"><AdminInput label="Display name" required value={form.name || ''} onChange={(value) => update('name', value)} /><AdminInput label="Professional title / discipline" required value={form.role || ''} onChange={(value) => update('role', value)} /><AdminInput label="Availability" value={form.availability_status || ''} onChange={(value) => update('availability_status', value)} /><AdminInput label="Skills, comma-separated" value={form.skills || ''} onChange={(value) => update('skills', value)} /></div>
        </div>
        <div className="grid gap-3 border-y border-white/[0.07] py-5">
          <div className="flex flex-wrap items-center gap-3"><label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-white/[0.055] px-4 text-sm text-zinc-200 ring-1 ring-white/[0.08]"><ImagePlus size={15} />{form.cover_image ? 'Replace cover photo' : 'Add cover photo'}<input className="sr-only" disabled={uploading || saving} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { uploadImage(event.target.files?.[0], 'cover'); event.target.value = ''; }} /></label>{form.cover_image && <AdminButton type="button" variant="danger" disabled={uploading || saving} onClick={() => removeImage('cover_image', 'cover photo')}><Trash2 size={15} /> Remove</AdminButton>}<span className="text-xs text-zinc-500">Cover images are resized to 1800px and optimized to 1 MB.</span></div>
          {form.cover_image && <img src={form.cover_image} alt="Cover preview" className="aspect-[16/5] w-full bg-zinc-900 object-cover" />}
        </div>
        <AdminTextarea label="Short introduction" value={form.short_bio || ''} onChange={(value) => update('short_bio', value)} />
        <AdminTextarea label="Biography" value={form.full_bio || ''} onChange={(value) => update('full_bio', value)} />
        <AdminTextarea label="Public social links, one per line as Label: URL" value={form.social_links || ''} onChange={(value) => update('social_links', value)} />
        <AdminButton type="submit" disabled={saving || uploading} variant="primary" className="w-fit"><Save size={16} />{saving ? 'Saving...' : 'Save profile'}</AdminButton>
      </AdminSurface>
    </AdminLayout>
  );
}
