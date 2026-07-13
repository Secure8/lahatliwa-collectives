import {
  Copy,
  Dribbble,
  ExternalLink,
  Eye,
  EyeOff,
  Facebook,
  Github,
  Globe2,
  ImagePlus,
  Instagram,
  Linkedin,
  Mail,
  Music2,
  Plus,
  Save,
  Trash2,
  Twitter,
  Youtube,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import CreativeProfileView from '../../components/CreativeProfileView';
import { AdminButton, AdminNotice, AdminPageHeader, AdminStatusBadge } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { useAdminAccess } from '../../lib/adminAccess';
import { copyText } from '../../lib/clipboard';
import { uploadSiteAsset } from '../../lib/contentApi';
import { parseList, slugify } from '../../lib/helpers';
import { uploadStatusText } from '../../lib/imageCompression';
import { socialLinkMeta, socialLinksFromText } from '../../lib/socialLinks';
import { isResourceLink, resourceLink, resourceName } from '../../lib/profileResources';
import { supabase } from '../../lib/supabaseClient';

const lineInput = 'w-full border-0 border-b border-white/[0.12] bg-transparent px-0 py-2.5 text-white outline-none transition placeholder:text-zinc-700 focus:border-amber-200/60';
const lineTextarea = `${lineInput} min-h-28 resize-y leading-6`;

const socialIcons = {
  facebook: Facebook,
  instagram: Instagram,
  linkedin: Linkedin,
  youtube: Youtube,
  twitter: Twitter,
  github: Github,
  dribbble: Dribbble,
  tiktok: Music2,
  email: Mail,
  website: Globe2,
};

function normalizeSocialHref(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const compact = trimmed.replace(/\s+/g, '');
  if (/^www\./i.test(compact)) return `https://${compact}`;
  if (/^mailto:/i.test(compact)) return compact;
  if (/^https?:\/\//i.test(compact)) return compact;
  if (/^https?:\s*\/\//i.test(trimmed)) return trimmed.replace(/\s+/g, '');
  return trimmed;
}

function normalizeSocialRow(row = {}) {
  const href = normalizeSocialHref(row.href || '');
  const meta = socialLinkMeta({ label: row.label, href });
  return {
    label: (row.label || '').trim() || meta.label,
    href: meta.href || href,
  };
}

function formFromProfile(profile) {
  return {
    name: profile.name || '',
    slug: profile.slug || '',
    role: profile.role || '',
    short_bio: profile.short_bio || '',
    full_bio: profile.full_bio || '',
    skills: parseList(profile.skills),
    social_links: (profile.social_links || []).map(normalizeSocialRow),
    availability_status: profile.availability_status || '',
    profile_image_url: profile.profile_image_url || '',
    cover_image: profile.cover_image || '',
    is_published: profile.is_published !== false,
    is_featured: profile.is_featured === true,
    display_order: profile.display_order ?? '',
    notification_email: profile.notification_email || '',
  };
}

function formSignature(form) {
  return JSON.stringify({
    name: form.name || '',
    slug: form.slug || '',
    role: form.role || '',
    short_bio: form.short_bio || '',
    full_bio: form.full_bio || '',
    skills: form.skills || [],
    social_links: form.social_links || [],
    availability_status: form.availability_status || '',
    profile_image_url: form.profile_image_url || '',
    cover_image: form.cover_image || '',
    is_published: form.is_published === true,
    is_featured: form.is_featured === true,
    display_order: form.display_order ?? '',
    notification_email: form.notification_email || '',
  });
}

function ProfileField({ label, value, onChange, required = false, type = 'text', onBlur, error, hint, placeholder, disabled = false }) {
  return (
    <label className="grid gap-1.5 text-sm text-zinc-300">
      <span>{label}</span>
      <input
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        className={`${lineInput} disabled:cursor-not-allowed disabled:text-zinc-500`}
      />
      {error ? <span className="text-xs text-red-200">{error}</span> : hint ? <span className="text-xs text-zinc-600">{hint}</span> : null}
    </label>
  );
}

function ProfileTextarea({ label, value, onChange, rows = 4, hint, error, placeholder }) {
  return (
    <label className="grid gap-1.5 text-sm text-zinc-300">
      <span>{label}</span>
      <textarea
        rows={rows}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        className={`${lineTextarea} disabled:cursor-not-allowed disabled:text-zinc-500`}
      />
      {error ? <span className="text-xs text-red-200">{error}</span> : hint ? <span className="text-xs text-zinc-600">{hint}</span> : null}
    </label>
  );
}

function ProfileSection({ title, description, children }) {
  return (
    <section className="grid gap-5 border-t border-white/[0.08] py-7 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function InlineActionButton({ children, onClick, href, disabled = false, subtle = false }) {
  const classes = `inline-flex h-10 items-center gap-2 border-b px-2 text-sm transition ${subtle ? 'border-white/[0.08] text-zinc-400 hover:border-amber-200/35 hover:text-white' : 'border-white/[0.12] text-zinc-300 hover:border-amber-200/40 hover:text-white'} disabled:cursor-not-allowed disabled:opacity-50`;

  if (href) {
    return href.startsWith('/') ? <Link to={href} className={classes}>{children}</Link> : <a href={href} className={classes}>{children}</a>;
  }

  return <button type="button" onClick={onClick} disabled={disabled} className={classes}>{children}</button>;
}

export default function MyProfile() {
  const { adminUser, user } = useAdminAccess();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [savedSignature, setSavedSignature] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKind, setUploadingKind] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const [flash, setFlash] = useState({ tone: '', text: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [previewMode, setPreviewMode] = useState(false);
  const [skillDraft, setSkillDraft] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!adminUser?.creative_member_id) {
        if (!cancelled) {
          setProfile(false);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const [{ data, error }, { data: preference, error: preferenceError }] = await Promise.all([
        supabase.from('creative_members').select('*').eq('id', adminUser.creative_member_id).maybeSingle(),
        supabase.from('creative_notification_preferences').select('notification_email').eq('creative_member_id', adminUser.creative_member_id).maybeSingle(),
      ]);

      if (cancelled) return;

      if (error || preferenceError) {
        setFlash({ tone: 'error', text: (error || preferenceError).message });
        setProfile(false);
        setLoading(false);
        return;
      }

      if (!data) {
        setProfile(false);
        setLoading(false);
        return;
      }

      const loadedProfile = { ...data, notification_email: preference?.notification_email || user?.email || '' };
      const nextForm = formFromProfile(loadedProfile);
      setProfile(loadedProfile);
      setForm(nextForm);
      setSavedSignature(formSignature(nextForm));
      setFieldErrors({});
      setPreviewMode(false);
      setLoading(false);
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, [adminUser?.creative_member_id, user?.email]);

  const isDirty = profile && savedSignature && formSignature(form) !== savedSignature;
  const publicSlug = profile?.slug || '';
  const publicProfileUrl = publicSlug ? `${window.location.origin}/creatives/${publicSlug}` : '';
  const publicProfilePath = publicSlug ? `/creatives/${publicSlug}` : '';
  const skills = Array.isArray(form.skills) ? form.skills : parseList(form.skills);
  const socialRows = Array.isArray(form.social_links)
    ? form.social_links
    : socialLinksFromText(form.social_links || '').map(normalizeSocialRow);
  const resourceRows = socialRows.map((link, index) => ({ link, index })).filter(({ link }) => isResourceLink(link));
  const previewProfile = profile ? {
    ...profile,
    ...form,
    skills,
    social_links: socialRows.map(normalizeSocialRow),
  } : null;
  const visibilityLabel = form.is_published ? 'Published publicly' : 'Hidden from public view';
  const hasAdminManagedFields = typeof profile?.is_featured === 'boolean' || profile?.display_order !== null || profile?.display_order !== undefined;

  useEffect(() => {
    const warn = (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updateSocialRow(index, patch) {
    setForm((current) => ({
      ...current,
      social_links: socialRows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
    setFieldErrors((current) => {
      if (!current.social_links) return current;
      const next = { ...current };
      delete next.social_links;
      return next;
    });
  }

  function addSkill() {
    const value = skillDraft.trim().replace(/\s+/g, ' ');
    if (!value) return;
    if (skills.some((skill) => skill.toLowerCase() === value.toLowerCase())) return;
    update('skills', [...skills, value]);
    setSkillDraft('');
  }

  function removeSkill(skill) {
    update('skills', skills.filter((item) => item !== skill));
  }

  function addSocialRow() {
    update('social_links', [...socialRows, { label: '', href: '' }]);
  }

  function addResourceRow() {
    update('social_links', [...socialRows, resourceLink('', '')]);
  }

  function removeSocialRow(index) {
    update('social_links', socialRows.filter((_, rowIndex) => rowIndex !== index));
  }

  function resetToSaved() {
    if (!profile) return;
    if (isDirty && !window.confirm('Discard your unsaved changes and reload the saved profile?')) return;
    const nextForm = formFromProfile(profile);
    setForm(nextForm);
    setSavedSignature(formSignature(nextForm));
    setSkillDraft('');
    setFieldErrors({});
    setFlash({ tone: 'success', text: 'Unsaved changes discarded.' });
  }

  async function save(event) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setFlash({ tone: '', text: '' });
    setFieldErrors({});

    const nextName = (form.name || '').trim();
    const nextRole = (form.role || '').trim();
    const nextSlug = slugify((form.slug || '').trim() || nextName);
    const nextShortBio = (form.short_bio || '').trim();
    const nextFullBio = (form.full_bio || '').trim();
    const nextAvailability = (form.availability_status || '').trim();
    const nextNotificationEmail = (form.notification_email || '').trim().toLowerCase();
    const nextSkills = Array.from(new Set((Array.isArray(form.skills) ? form.skills : parseList(form.skills))
      .map((skill) => skill.trim().replace(/\s+/g, ' '))
      .filter(Boolean)
      .filter((skill, index, list) => list.findIndex((item) => item.toLowerCase() === skill.toLowerCase()) === index)));
    const normalizedSocialLinks = (Array.isArray(form.social_links) ? form.social_links : socialLinksFromText(form.social_links || '').map(normalizeSocialRow))
      .map(normalizeSocialRow)
      .filter((item) => item.href || item.label);
    const invalidSocialIndex = normalizedSocialLinks.findIndex((item) => !/^(https?:\/\/|mailto:)/i.test(item.href));

    const nextFieldErrors = {};
    if (!nextName) nextFieldErrors.name = 'Display name is required.';
    if (!nextRole) nextFieldErrors.role = 'Role / title is required.';
    if (!nextSlug) nextFieldErrors.slug = 'A public slug is required.';
    if (invalidSocialIndex !== -1) nextFieldErrors.social_links = 'Each social link needs a complete URL such as https://example.com.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextNotificationEmail)) nextFieldErrors.notification_email = 'Enter a valid private notification email.';

    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      setFlash({ tone: 'error', text: 'Fix the highlighted fields before saving.' });
      setSaving(false);
      return;
    }

    const { data: duplicateSlug, error: slugCheckError } = await supabase
      .from('creative_members')
      .select('id, slug')
      .eq('slug', nextSlug)
      .neq('id', profile.id)
      .maybeSingle();

    if (slugCheckError) {
      setFlash({ tone: 'error', text: slugCheckError.message });
      setSaving(false);
      return;
    }

    if (duplicateSlug) {
      setFieldErrors({ slug: 'That slug is already in use by another profile.' });
      setFlash({ tone: 'error', text: 'Choose a different public slug.' });
      setSaving(false);
      return;
    }

    const payload = {
      name: nextName,
      slug: nextSlug,
      role: nextRole,
      short_bio: nextShortBio || null,
      full_bio: nextFullBio || null,
      skills: nextSkills,
      social_links: normalizedSocialLinks.map(({ label, href }) => {
        const meta = socialLinkMeta({ label, href });
        return { label: meta.label, href: normalizeSocialHref(href) };
      }),
      availability_status: nextAvailability || null,
      profile_image_url: form.profile_image_url || null,
      cover_image: form.cover_image || null,
      is_published: Boolean(form.is_published),
      is_featured: profile?.is_featured === true,
      display_order: profile?.display_order ?? null,
    };

    const { data, error } = await supabase
      .from('creative_members')
      .update(payload)
      .eq('id', profile.id)
      .select('*')
      .single();

    if (error) {
      setFlash({ tone: 'error', text: error.message });
      setSaving(false);
      return;
    }

    const { error: preferenceSaveError } = await supabase.from('creative_notification_preferences').upsert({ creative_member_id: profile.id, notification_email: nextNotificationEmail, updated_at: new Date().toISOString() }, { onConflict: 'creative_member_id' });
    if (preferenceSaveError) {
      setFlash({ tone: 'error', text: `Profile saved, but the private inquiry notification email could not be saved: ${preferenceSaveError.message}` });
      setSaving(false);
      return;
    }

    const savedProfile = { ...data, notification_email: nextNotificationEmail };
    const nextForm = formFromProfile(savedProfile);
    setProfile(savedProfile);
    setForm(nextForm);
    setSavedSignature(formSignature(nextForm));
    setSkillDraft('');
    setFlash({ tone: 'success', text: 'Profile saved.' });
    setSaving(false);
  }

  async function uploadImage(file, kind) {
    if (!file || !user?.id || !profile?.id) return;
    const isCover = kind === 'cover';
    setUploadingKind(kind);
    setUploadMessage('');
    setFieldErrors((current) => {
      if (!current[kind]) return current;
      const next = { ...current };
      delete next[kind];
      return next;
    });

    try {
      const url = await uploadSiteAsset(
        file,
        `creative-profiles/${user.id}/${isCover ? 'cover' : 'profile'}`,
        isCover ? 'creativeCover' : 'creativeProfile',
        {
          onStatus: (status) => setUploadMessage(uploadStatusText(status)),
        },
      );

      const field = isCover ? 'cover_image' : 'profile_image_url';
      const { data, error } = await supabase
        .from('creative_members')
        .update({ [field]: url })
        .eq('id', profile.id)
        .select('*')
        .single();

      if (error) throw error;

      const nextForm = formFromProfile({ ...data, notification_email: form.notification_email });
      setProfile({ ...data, notification_email: form.notification_email });
      setForm((current) => ({ ...current, [field]: url }));
      setSavedSignature(formSignature(nextForm));
      setFlash({ tone: 'success', text: isCover ? 'Cover photo updated.' : 'Profile photo updated.' });
    } catch (uploadError) {
      setFlash({ tone: 'error', text: uploadError.message || `${isCover ? 'Cover' : 'Profile'} photo upload failed.` });
    } finally {
      setUploadingKind('');
      setUploadMessage('');
    }
  }

  async function removeImage(field, label) {
    if (!window.confirm(`Remove your current ${label}?`)) return;
    setUploadingKind(field);
    setUploadMessage('');
    try {
      const { data, error } = await supabase
        .from('creative_members')
        .update({ [field]: null })
        .eq('id', profile.id)
        .select('*')
        .single();

      if (error) throw error;

      const nextForm = formFromProfile({ ...data, notification_email: form.notification_email });
      setProfile({ ...data, notification_email: form.notification_email });
      setForm(nextForm);
      setSavedSignature(formSignature(nextForm));
      setFlash({ tone: 'success', text: `${label[0].toUpperCase()}${label.slice(1)} removed.` });
    } catch (removeError) {
      setFlash({ tone: 'error', text: removeError.message || `Could not remove the ${label}.` });
    } finally {
      setUploadingKind('');
    }
  }

  async function copyProfileLink() {
    if (!publicSlug) return;
    try {
      await copyText(publicProfileUrl);
      setFlash({ tone: 'success', text: 'Profile link copied.' });
    } catch (copyError) {
      setFlash({ tone: 'error', text: copyError.message || 'Profile link could not be copied.' });
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <LoadingState label="Loading your profile" />
      </AdminLayout>
    );
  }

  if (profile === false) {
    return (
      <AdminLayout>
        <AdminPageHeader
          eyebrow="My profile"
          title="My Profile"
          description="Manage how your creative portfolio appears publicly."
        />
        {flash.text && <AdminNotice tone={flash.tone === 'success' ? 'success' : 'error'} className="mb-5">{flash.text}</AdminNotice>}
        <div className="grid gap-6">
          <div className="flex flex-wrap items-center gap-3 border-y border-white/[0.08] py-4 text-sm text-zinc-400">
            <AdminStatusBadge status="draft">Not linked</AdminStatusBadge>
            <span>This account is not linked to a public creative profile.</span>
          </div>
          <div className="max-w-2xl text-sm leading-6 text-zinc-500">
            Contact a Super Admin to link this account to a public creative profile before you can edit it.
          </div>
          <AdminButton to="/admin/dashboard" variant="ghost" className="w-fit">Back to dashboard</AdminButton>
        </div>
      </AdminLayout>
    );
  }

  const success = flash.tone === 'success';
  const headerActions = [
    <InlineActionButton key="preview" onClick={() => setPreviewMode((current) => !current)}>
      {previewMode ? <EyeOff size={16} /> : <Eye size={16} />}
      {previewMode ? 'Hide Preview' : 'Preview Profile'}
    </InlineActionButton>,
  ];

  if (publicSlug) {
    headerActions.push(
      <InlineActionButton key="copy-link" onClick={copyProfileLink} subtle>
        <Copy size={16} /> Copy Profile Link
      </InlineActionButton>,
    );
    if (form.is_published) {
      headerActions.push(
        <InlineActionButton key="open-public" href={publicProfilePath} subtle>
          <ExternalLink size={16} /> Open Public Profile
        </InlineActionButton>,
      );
    }
  }

  const canEditVisibility = true;

  return (
    <AdminLayout>
      <AdminPageHeader
        eyebrow="Creative profile"
        title="My Profile"
        description="Manage how your creative portfolio appears publicly."
        action={headerActions}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3 border-y border-white/[0.08] py-4 text-sm text-zinc-400">
        <AdminStatusBadge status={form.is_published ? 'published' : 'draft'}>{visibilityLabel}</AdminStatusBadge>
        {isDirty && <span className="text-xs uppercase tracking-[0.18em] text-amber-200">Unsaved changes</span>}
        {publicSlug && <span className="text-xs text-zinc-600">Open public uses the saved slug.</span>}
      </div>

      {flash.text && <AdminNotice tone={success ? 'success' : 'error'} className="mb-5">{flash.text}</AdminNotice>}

      <form onSubmit={save} className="mx-auto max-w-5xl">
        <ProfileSection
          title="Basic Information"
          description="Update the identity details that appear across your public profile and cards."
        >
          <div className="grid gap-6 md:grid-cols-2">
            <ProfileField
              label="Display name"
              required
              value={form.name || ''}
              onChange={(value) => update('name', value)}
              error={fieldErrors.name}
              placeholder="Your public name"
            />
            <ProfileField
              label="Role / title"
              required
              value={form.role || ''}
              onChange={(value) => update('role', value)}
              error={fieldErrors.role}
              placeholder="Creative director, designer, and so on"
            />
            <ProfileField
              label="Public slug"
              required
              value={form.slug || ''}
              onChange={(value) => update('slug', value)}
              onBlur={() => update('slug', slugify(form.slug || form.name || ''))}
              error={fieldErrors.slug}
              hint={publicSlug ? `/creatives/${publicSlug}` : 'Used for your public profile link.'}
              placeholder="your-public-handle"
            />
            <ProfileField
              label="Availability"
              value={form.availability_status || ''}
              onChange={(value) => update('availability_status', value)}
              placeholder="Open to commissions, booked for Q3, and so on"
              hint="Shown publicly in your header when filled in."
            />
          </div>
        </ProfileSection>

        <ProfileSection
          title="Profile Content"
          description="Keep the short bio concise for cards and previews. Use the full bio for the complete public profile page."
        >
          <div className="grid gap-6">
            <ProfileTextarea
              label="Short bio"
              rows={3}
              value={form.short_bio || ''}
              onChange={(value) => update('short_bio', value)}
              placeholder="A compact introduction for profile cards and preview surfaces."
              hint="Use this for profile cards and compact previews."
            />
            <ProfileTextarea
              label="Full bio"
              rows={7}
              value={form.full_bio || ''}
              onChange={(value) => update('full_bio', value)}
              placeholder="A longer description that keeps your line breaks and paragraph rhythm."
              hint="Shown on your full public profile page. Line breaks are preserved."
            />
          </div>
        </ProfileSection>

        <ProfileSection
          title="Profile Media"
          description="Your cover photo fills the public hero background. Your profile photo appears as a compact circular portrait above the Creative portfolio label."
        >
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(14rem,0.5fr)]">
            <div className="grid content-start gap-3">
              <p className="text-sm text-zinc-400">Cover photo</p>
              <div className="grid aspect-video w-full place-items-center overflow-hidden rounded-[10px] bg-white/[0.04]">
                {form.cover_image ? (
                  <img src={form.cover_image} alt={`${form.name || 'Profile'} cover preview`} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_70%_20%,rgba(246,213,139,0.1),transparent_38%),linear-gradient(135deg,#18181b,#0f0f11)] px-6 text-center text-sm text-zinc-600">No cover photo yet</div>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 border-b border-white/[0.12] px-2 text-sm text-zinc-300 transition hover:border-amber-200/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
                  <ImagePlus size={15} />
                  {uploadingKind === 'cover' ? 'Uploading...' : form.cover_image ? 'Replace cover' : 'Upload cover'}
                  <input
                    className="sr-only"
                    disabled={Boolean(uploadingKind) || saving}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      uploadImage(event.target.files?.[0], 'cover');
                      event.target.value = '';
                    }}
                  />
                </label>
                {form.cover_image && (
                  <AdminButton
                    type="button"
                    variant="ghost"
                    disabled={Boolean(uploadingKind) || saving}
                    onClick={() => removeImage('cover_image', 'cover photo')}
                  >
                    <Trash2 size={15} /> Remove
                  </AdminButton>
                )}
              </div>
              <p className="text-xs leading-5 text-zinc-600">Use a landscape campaign image with enough space around the subject for wide desktop and tighter mobile cropping.</p>
              {uploadingKind === 'cover' && uploadMessage && <p className="text-xs text-amber-200">{uploadMessage}</p>}
            </div>

            <div className="grid content-start gap-3">
              <p className="text-sm text-zinc-400">Profile photo</p>
              <div className="grid h-32 w-32 place-items-center overflow-hidden rounded-full border border-white/[0.1] bg-white/[0.04]">
                {form.profile_image_url ? <img src={form.profile_image_url} alt={`${form.name || 'Profile'} portrait preview`} className="h-full w-full object-cover" /> : <span className="text-3xl text-zinc-600">{(form.name || 'L').slice(0, 1)}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex h-10 cursor-pointer items-center gap-2 border-b border-white/[0.12] px-2 text-sm text-zinc-300 transition hover:border-amber-200/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-50">
                  <ImagePlus size={15} />
                  {uploadingKind === 'profile' ? 'Uploading...' : form.profile_image_url ? 'Replace photo' : 'Upload photo'}
                  <input className="sr-only" disabled={Boolean(uploadingKind) || saving} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { uploadImage(event.target.files?.[0], 'profile'); event.target.value = ''; }} />
                </label>
                {form.profile_image_url && <AdminButton type="button" variant="ghost" disabled={Boolean(uploadingKind) || saving} onClick={() => removeImage('profile_image_url', 'profile photo')}><Trash2 size={15} /> Remove</AdminButton>}
              </div>
              <p className="text-xs leading-5 text-zinc-600">A square portrait works best. It appears as a small circle in the public hero.</p>
              {uploadingKind === 'profile' && uploadMessage && <p className="text-xs text-amber-200">{uploadMessage}</p>}
            </div>
          </div>
        </ProfileSection>

        <ProfileSection
          title="Skills and Availability"
          description="Skills are stored in the existing list format and keep their order. Availability appears in the public header when present."
        >
          <div className="grid gap-6 md:grid-cols-2">
            <div className="grid gap-4">
              <label className="grid gap-1.5 text-sm text-zinc-300">
                <span>Add a skill</span>
                <div className="flex items-end gap-2">
                  <input
                    value={skillDraft}
                    onChange={(event) => setSkillDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addSkill();
                      }
                    }}
                    placeholder="Type a skill and press Enter"
                    className={lineInput}
                  />
                  <button
                    type="button"
                    onClick={addSkill}
                    className="grid h-10 w-10 shrink-0 place-items-center border-b border-white/[0.12] text-zinc-300 transition hover:border-amber-200/40 hover:text-white"
                    aria-label="Add skill"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </label>

              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {skills.map((skill) => (
                  <span key={skill} className="inline-flex min-w-0 items-center gap-2 border-b border-white/[0.12] pb-1 text-sm text-zinc-400">
                    <span className="max-w-full break-words">{skill}</span>
                    <button type="button" onClick={() => removeSkill(skill)} aria-label={`Remove ${skill}`} className="text-zinc-500 transition hover:text-zinc-200">
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>

              {skills.length === 0 && <p className="text-xs text-zinc-600">Add a few concise skills to improve the compact cards and profile preview.</p>}
              {skills.length > 12 && <p className="text-xs text-amber-200">Consider trimming this list to 12 or fewer skills for a cleaner public profile.</p>}
            </div>

            <ProfileField
              label="Availability"
              value={form.availability_status || ''}
              onChange={(value) => update('availability_status', value)}
              placeholder="Available for commissions, booked, or limited availability"
              hint="This text appears in the public profile header when filled in."
            />
          </div>
        </ProfileSection>

        <ProfileSection
          title="Tools and Resources"
          description="Add the apps, platforms, references, or resources you use. Their website icon appears as a clickable glowing app in your public profile dock."
        >
          <div className="grid gap-4">
            {resourceRows.map(({ link, index }) => <div key={index} className="grid gap-3 border-b border-white/[0.06] pb-4 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto] md:items-end">
              <label className="grid gap-1.5 text-sm text-zinc-300"><span className="text-xs uppercase tracking-[0.18em] text-zinc-500">Tool or resource</span><input value={resourceName(link) === 'Resource' ? '' : resourceName(link)} onChange={(event) => updateSocialRow(index, resourceLink(event.target.value, link.href))} placeholder="Canva" className={lineInput} /></label>
              <label className="grid gap-1.5 text-sm text-zinc-300"><span className="text-xs uppercase tracking-[0.18em] text-zinc-500">Website URL</span><input value={link.href || ''} onChange={(event) => updateSocialRow(index, resourceLink(resourceName(link) === 'Resource' ? '' : resourceName(link), event.target.value))} placeholder="https://www.canva.com" className={lineInput} /></label>
              <button type="button" onClick={() => removeSocialRow(index)} className="grid h-10 w-10 place-items-center border-b border-white/[0.12] text-zinc-500 transition hover:border-red-300/35 hover:text-red-100" aria-label={`Remove ${resourceName(link)}`}><Trash2 size={15} /></button>
            </div>)}
            {resourceRows.length === 0 && <p className="text-xs text-zinc-600">No tools or resources added yet.</p>}
            <button type="button" onClick={addResourceRow} className="inline-flex h-10 w-fit items-center gap-2 border-b border-white/[0.12] px-2 text-sm text-zinc-300 transition hover:border-amber-200/40 hover:text-white"><Plus size={15} /> Add tool or resource</button>
          </div>
        </ProfileSection>

        <ProfileSection
          title="Social Links"
          description="Each row keeps the existing platform detection and normalizes safe URL spacing before save."
        >
          <div className="grid gap-4">
            {socialRows.map((link, index) => {
              if (isResourceLink(link)) return null;
              const meta = socialLinkMeta(link);
              const Icon = socialIcons[meta.platform] || Globe2;
              return (
                <div key={index} className="grid gap-3 border-b border-white/[0.06] pb-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
                  <div className="grid gap-1.5 text-sm text-zinc-300">
                    <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-zinc-500">
                      <Icon size={13} /> {meta.label}
                    </span>
                    <input
                      value={link.label || ''}
                      onChange={(event) => updateSocialRow(index, { label: event.target.value })}
                      placeholder={meta.label}
                      className={lineInput}
                    />
                  </div>
                  <div className="grid gap-1.5 text-sm text-zinc-300">
                    <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">URL</span>
                    <input
                      value={link.href || ''}
                      onChange={(event) => updateSocialRow(index, { href: event.target.value })}
                      placeholder={meta.platform === 'email' ? 'mailto:name@example.com' : 'https://example.com'}
                      className={lineInput}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSocialRow(index)}
                    className="grid h-10 w-10 place-items-center border-b border-white/[0.12] text-zinc-500 transition hover:border-red-300/35 hover:text-red-100"
                    aria-label={`Remove ${meta.label} link`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}

            {fieldErrors.social_links && <p className="text-xs text-red-200">{fieldErrors.social_links}</p>}

            <button
              type="button"
              onClick={addSocialRow}
              className="inline-flex h-10 w-fit items-center gap-2 border-b border-white/[0.12] px-2 text-sm text-zinc-300 transition hover:border-amber-200/40 hover:text-white"
            >
              <Plus size={15} /> Add social link
            </button>
          </div>
        </ProfileSection>

        <ProfileSection
          title="Inquiry Notifications"
          description="This private address receives project requests when a client selects your public profile. It is never included in public profile data."
        >
          <div className="max-w-xl">
            <ProfileField
              label="Private notification email"
              type="email"
              required
              value={form.notification_email || ''}
              onChange={(value) => update('notification_email', value)}
              error={fieldErrors.notification_email}
              placeholder="name@example.com"
              hint={`Defaults to your authenticated account email${user?.email ? ` (${user.email})` : ''}.`}
            />
          </div>
        </ProfileSection>

        <ProfileSection
          title="Visibility"
          description="Published publicly shows your profile on the site. Hidden from public view keeps it off the public directory without affecting team access."
        >
          <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <label className="flex items-start gap-3 border-b border-white/[0.08] py-3 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(event) => update('is_published', event.target.checked)}
                className="mt-1 h-4 w-4 accent-amber-300"
                disabled={!canEditVisibility}
              />
              <span className="grid gap-1">
                <span className="text-white">Published publicly</span>
                <span className="text-xs leading-5 text-zinc-500">Toggle this to make the public profile visible or hidden.</span>
              </span>
            </label>

            <div className="grid gap-2 border-b border-white/[0.08] py-3 text-sm text-zinc-300">
              <span className="text-xs uppercase tracking-[0.18em] text-zinc-500">Admin-managed fields</span>
              <div className="flex flex-wrap gap-2">
                {typeof profile?.is_featured === 'boolean' && (
                  <AdminStatusBadge status={form.is_featured ? 'featured' : 'draft'}>
                    {form.is_featured ? 'Featured' : 'Not featured'}
                  </AdminStatusBadge>
                )}
                {profile?.display_order !== null && profile?.display_order !== undefined && profile?.display_order !== '' && (
                  <span className="inline-flex items-center rounded-md border border-white/[0.08] px-2.5 py-1 text-xs text-zinc-400">Order {profile.display_order}</span>
                )}
              </div>
              <p className="text-xs text-zinc-600">Featured status and sort order remain managed separately.</p>
            </div>
          </div>
        </ProfileSection>

        {previewMode && (
          <ProfileSection
            title="Public Profile Preview"
            description={isDirty ? 'Preview includes unsaved changes.' : 'Preview reflects your saved profile.'}
          >
            <div className="overflow-hidden border-y border-white/[0.08] py-4">
              <CreativeProfileView creative={previewProfile} adminPreview />
            </div>
          </ProfileSection>
        )}

        <ProfileSection
          title="Save Actions"
          description="Save updates locally and keep you on this page. Discard reloads the last saved profile without leaving the editor."
        >
          <div className="flex flex-wrap items-center gap-3">
            <AdminButton type="submit" disabled={saving || Boolean(uploadingKind)} variant="primary">
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Changes'}
            </AdminButton>
            <AdminButton type="button" onClick={resetToSaved} variant="ghost" disabled={!isDirty || saving || Boolean(uploadingKind)}>
              Discard Changes
            </AdminButton>
            <InlineActionButton onClick={() => setPreviewMode((current) => !current)}>
              {previewMode ? <EyeOff size={16} /> : <Eye size={16} />}
              {previewMode ? 'Hide Preview' : 'Preview Profile'}
            </InlineActionButton>
            {publicSlug && (
              <InlineActionButton onClick={copyProfileLink} disabled={saving || Boolean(uploadingKind)} subtle>
                <Copy size={16} /> Copy Profile Link
              </InlineActionButton>
            )}
          </div>
        </ProfileSection>
      </form>
    </AdminLayout>
  );
}
