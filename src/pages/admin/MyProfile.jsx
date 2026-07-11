import { Copy, ExternalLink, Eye, EyeOff, ImagePlus, Plus, Save, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import CreativeProfileView from '../../components/CreativeProfileView';
import { AdminButton, AdminNotice, AdminPageHeader } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { useAdminAccess } from '../../lib/adminAccess';
import { copyText } from '../../lib/clipboard';
import { uploadSiteAsset } from '../../lib/contentApi';
import { parseList } from '../../lib/helpers';
import { uploadStatusText } from '../../lib/imageCompression';
import { socialLinkMeta, socialLinksFromText } from '../../lib/socialLinks';
import { supabase } from '../../lib/supabaseClient';

function formFromProfile(profile) {
  return {
    ...profile,
    skills: (profile.skills || []).join(', '),
    social_links: (profile.social_links || []).map((item) => `${item.label}: ${item.href}`).join('\n'),
  };
}

const lineInput = 'w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-2.5 text-white outline-none transition placeholder:text-zinc-700 focus:border-amber-200/60';

function ProfileField({ label, value, onChange, required = false }) {
  return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><input required={required} value={value} onChange={(event) => onChange(event.target.value)} className={lineInput} /></label>;
}

function ProfileTextarea({ label, value, onChange, rows = 4, hint }) {
  return <label className="grid gap-1.5 text-sm text-zinc-400"><span>{label}</span><textarea rows={rows} value={value} onChange={(event) => onChange(event.target.value)} className={`${lineInput} resize-y leading-6`} />{hint && <span className="text-xs text-zinc-600">{hint}</span>}</label>;
}

function ProfileSection({ title, description, children }) {
  return <section className="grid gap-5 border-t border-white/[0.08] py-7 first:border-t-0 first:pt-0"><div><h2 className="text-lg font-semibold text-white">{title}</h2>{description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}</div>{children}</section>;
}

export default function MyProfile() {
  const { adminUser, user } = useAdminAccess();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const [previewMode, setPreviewMode] = useState(false);
  const [skillDraft, setSkillDraft] = useState('');
  const [savedSignature, setSavedSignature] = useState('');

  useEffect(() => {
    if (!adminUser?.creative_member_id) {
      setProfile(false);
      return;
    }
    supabase.from('creative_members').select('*').eq('id', adminUser.creative_member_id).maybeSingle().then(({ data, error }) => {
      setProfile(data || false);
      const nextForm = data ? formFromProfile(data) : {};
      setForm(nextForm);
      setSavedSignature(data ? JSON.stringify(nextForm) : '');
      setNotice(error?.message || '');
    });
  }, [adminUser?.creative_member_id]);

  const isDirty = profile && savedSignature && JSON.stringify(form) !== savedSignature;
  useEffect(() => {
    const warn = (event) => { if (!isDirty) return; event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    const parsedSocialLinks = socialLinksFromText(form.social_links || '').map((link) => {
      const meta = socialLinkMeta(link);
      return { label: meta.label, href: meta.href || link.href };
    });
    const invalidSocialLink = parsedSocialLinks.find((link) => !/^(https?:\/\/|mailto:)/i.test(link.href));
    if (invalidSocialLink) { setNotice(`Enter a complete URL for ${invalidSocialLink.label}.`); setSaving(false); return; }
    const payload = {
      name: form.name.trim(), role: form.role.trim(), short_bio: form.short_bio?.trim() || null,
      full_bio: form.full_bio?.trim() || null, skills: parseList(form.skills), social_links: parsedSocialLinks.map(({ label, href }) => ({ label, href })),
      availability_status: form.availability_status?.trim() || null, profile_image_url: form.profile_image_url || null,
      cover_image: form.cover_image || null,
    };
    if (!payload.name || !payload.role) { setNotice('Display name and professional title are required.'); setSaving(false); return; }
    const { data, error } = await supabase.from('creative_members').update(payload).eq('id', profile.id).select('*').single();
    if (error) setNotice(error.message);
    else { const nextForm = formFromProfile(data); setProfile(data); setForm(nextForm); setSavedSignature(JSON.stringify(nextForm)); setNotice('Profile saved.'); }
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
      setForm((current) => ({ ...current, [field]: url }));
      setSavedSignature(JSON.stringify(formFromProfile(data)));
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
    else { setProfile(data); setForm((current) => ({ ...current, [field]: '' })); setSavedSignature(JSON.stringify(formFromProfile(data))); setNotice(`${label[0].toUpperCase()}${label.slice(1)} removed.`); }
    setSaving(false);
  }

  async function copyProfileLink() {
    try { await copyText(`${window.location.origin}/creatives/${profile.slug}`); setNotice('Profile link copied.'); }
    catch (copyError) { setNotice(copyError.message || 'Profile link could not be copied.'); }
  }

  const skills = parseList(form.skills || '');
  const socialRows = socialLinksFromText(form.social_links || '');
  const writeSocialRows = (rows) => update('social_links', rows.map((link) => `${link.label || ''}: ${link.href || ''}`.replace(/^:\s*/, '')).join('\n'));
  const updateSocialRow = (index, patch) => writeSocialRows(socialRows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
  const addSkill = () => {
    const value = skillDraft.trim().replace(/\s+/g, ' ');
    if (!value || skills.some((skill) => skill.toLowerCase() === value.toLowerCase())) return;
    update('skills', [...skills, value].join(', ')); setSkillDraft('');
  };
  const previewProfile = { ...profile, ...form, skills, social_links: socialRows };

  if (profile === null) return <AdminLayout><LoadingState label="Loading your profile" /></AdminLayout>;
  if (profile === false) return <AdminLayout><AdminPageHeader eyebrow="My profile" title="Profile link needed" description="Your dashboard account is not linked to a creative profile. Ask an administrator to link your team account to the correct profile." /></AdminLayout>;
  const success = /saved|updated|removed|copied|compressing|uploading/i.test(notice);

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow="Creative profile"
        title="My Profile"
        description="Manage how your creative portfolio appears publicly."
        action={<><AdminButton type="button" onClick={() => setPreviewMode((current) => !current)}>{previewMode ? <EyeOff size={16} /> : <Eye size={16} />} {previewMode ? 'Hide Preview' : 'Preview Profile'}</AdminButton><AdminButton type="button" onClick={copyProfileLink}><Copy size={16} /> Copy Link</AdminButton>{profile.slug && profile.is_published && <AdminButton to={`/creatives/${profile.slug}`}><ExternalLink size={16} /> Open Public</AdminButton>}</>}
      />
      {notice && <AdminNotice tone={success ? 'success' : 'error'} className="mb-5">{notice}</AdminNotice>}
      <form onSubmit={save} className="mx-auto max-w-5xl">
        <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-y border-white/[0.08] py-4"><div><p className="text-xs uppercase tracking-[0.18em] text-zinc-600">Public profile status</p><p className={`mt-1 text-sm ${profile.is_published ? 'text-emerald-200' : 'text-zinc-400'}`}>{profile.is_published ? 'Published' : 'Draft / Hidden'} <span className="text-zinc-600">— separate from team access</span></p></div>{isDirty && <span className="text-xs text-amber-200">Unsaved changes</span>}</div>
        <ProfileSection title="Basic Information">
          <div className="grid gap-6 md:grid-cols-2"><ProfileField label="Display name" required value={form.name || ''} onChange={(value) => update('name', value)} /><ProfileField label="Professional title / discipline" required value={form.role || ''} onChange={(value) => update('role', value)} /><label className="grid gap-1.5 text-sm text-zinc-400"><span>Public slug</span><input readOnly value={profile.slug || ''} className={`${lineInput} cursor-not-allowed text-zinc-500`} /><span className="text-xs text-zinc-600">Managed by an administrator.</span></label></div>
        </ProfileSection>
        <ProfileSection title="Profile Content">
          <div className="grid gap-6"><ProfileTextarea label="Short introduction" rows={3} value={form.short_bio || ''} onChange={(value) => update('short_bio', value)} hint="Appears in cards and compact previews." /><ProfileTextarea label="Biography" rows={6} value={form.full_bio || ''} onChange={(value) => update('full_bio', value)} hint="Appears on your full public profile." /></div>
        </ProfileSection>
        <ProfileSection title="Profile and Cover Media" description="Existing image compression and optimization rules remain active.">
          <div className="grid gap-8 md:grid-cols-2">
            <div className="grid content-start gap-3"><p className="text-sm text-zinc-400">Profile photo</p><div className="grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-white/[0.04]">{form.profile_image_url ? <img src={form.profile_image_url} alt="Profile preview" className="h-full w-full object-cover" /> : <span className="text-3xl text-zinc-600">{form.name?.slice(0, 1)}</span>}</div><div className="flex flex-wrap gap-2"><label className="inline-flex h-10 cursor-pointer items-center gap-2 px-3 text-sm text-zinc-300 hover:text-white"><ImagePlus size={15} />{uploading ? 'Uploading...' : form.profile_image_url ? 'Replace photo' : 'Upload photo'}<input className="sr-only" disabled={uploading || saving} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { uploadImage(event.target.files?.[0], 'profile'); event.target.value = ''; }} /></label>{form.profile_image_url && <AdminButton type="button" variant="ghost" disabled={uploading || saving} onClick={() => removeImage('profile_image_url', 'profile photo')}><Trash2 size={15} /> Remove</AdminButton>}</div><p className="text-xs text-zinc-600">JPEG, PNG, or WebP; optimized to 300 KB.</p></div>
            <div className="grid content-start gap-3"><p className="text-sm text-zinc-400">Cover photo</p>{form.cover_image ? <img src={form.cover_image} alt="Cover preview" className="aspect-[16/6] w-full bg-zinc-900 object-cover" /> : <div className="grid aspect-[16/6] w-full place-items-center bg-white/[0.025] text-sm text-zinc-600">No cover photo</div>}<div className="flex flex-wrap gap-2"><label className="inline-flex h-10 cursor-pointer items-center gap-2 px-3 text-sm text-zinc-300 hover:text-white"><ImagePlus size={15} />{uploading ? 'Uploading...' : form.cover_image ? 'Replace cover' : 'Upload cover'}<input className="sr-only" disabled={uploading || saving} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { uploadImage(event.target.files?.[0], 'cover'); event.target.value = ''; }} /></label>{form.cover_image && <AdminButton type="button" variant="ghost" disabled={uploading || saving} onClick={() => removeImage('cover_image', 'cover photo')}><Trash2 size={15} /> Remove</AdminButton>}</div><p className="text-xs text-zinc-600">Resized to 1800px and optimized to 1 MB.</p></div>
          </div>
        </ProfileSection>
        <ProfileSection title="Skills and Availability"><div className="grid gap-6 md:grid-cols-2"><div className="grid gap-3"><label className="grid gap-1.5 text-sm text-zinc-400"><span>Add a skill</span><div className="flex items-end gap-2"><input value={skillDraft} onChange={(event) => setSkillDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSkill(); } }} className={lineInput} /><button type="button" onClick={addSkill} className="grid h-10 w-10 shrink-0 place-items-center text-zinc-300 hover:text-white" aria-label="Add skill"><Plus size={16} /></button></div></label><div className="flex flex-wrap gap-x-4 gap-y-2">{skills.map((skill) => <span key={skill} className="inline-flex items-center gap-2 border-b border-white/[0.12] pb-1 text-sm text-zinc-400">{skill}<button type="button" onClick={() => update('skills', skills.filter((item) => item !== skill).join(', '))} aria-label={`Remove ${skill}`}><X size={13} /></button></span>)}</div>{skills.length > 12 && <p className="text-xs text-amber-200">Consider keeping skills to 12 or fewer for a balanced public profile.</p>}</div><ProfileField label="Availability" value={form.availability_status || ''} onChange={(value) => update('availability_status', value)} /></div></ProfileSection>
        <ProfileSection title="Social Links" description="Platform labels are detected from each URL."><div className="grid gap-3">{socialRows.map((link, index) => { const meta = socialLinkMeta(link); return <div key={`${index}-${link.href}`} className="grid gap-3 border-b border-white/[0.07] pb-4 md:grid-cols-[9rem_minmax(0,1fr)_auto] md:items-end"><label className="grid gap-1.5 text-sm text-zinc-400"><span>Detected: {meta.platform}</span><input value={link.label || meta.label} onChange={(event) => updateSocialRow(index, { label: event.target.value })} className={lineInput} /></label><label className="grid gap-1.5 text-sm text-zinc-400"><span>{meta.label} URL</span><input value={link.href} onChange={(event) => updateSocialRow(index, { href: event.target.value.trimStart() })} className={lineInput} /></label><button type="button" onClick={() => writeSocialRows(socialRows.filter((_, rowIndex) => rowIndex !== index))} className="grid h-10 w-10 place-items-center text-zinc-500 hover:text-red-200" aria-label={`Remove ${meta.label} link`}><Trash2 size={15} /></button></div>;})}<button type="button" onClick={() => writeSocialRows([...socialRows, { label: 'Website', href: 'https://' }])} className="inline-flex h-10 w-fit items-center gap-2 px-2 text-sm text-zinc-300 hover:text-white"><Plus size={15} /> Add social link</button></div></ProfileSection>
        {previewMode && <ProfileSection title="Public Profile Preview" description={isDirty ? 'Preview includes unsaved changes.' : 'Preview reflects your saved profile.'}><div className="overflow-hidden border-y border-white/[0.08] py-5"><CreativeProfileView creative={previewProfile} adminPreview /></div></ProfileSection>}
        <div className="sticky bottom-0 flex flex-wrap gap-2 border-t border-white/[0.1] bg-zinc-950/92 py-4 backdrop-blur"><AdminButton type="submit" disabled={saving || uploading} variant="primary"><Save size={16} />{saving ? 'Saving...' : 'Save Changes'}</AdminButton><AdminButton type="button" onClick={() => setPreviewMode((current) => !current)}>{previewMode ? <EyeOff size={16} /> : <Eye size={16} />}{previewMode ? 'Hide Preview' : 'Preview'}</AdminButton></div>
      </form>
    </AdminLayout>
  );
}
