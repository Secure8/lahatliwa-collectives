import { Camera, Save, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CREATIVE_DISCIPLINE_MAX_COUNT, CREATIVE_DISCIPLINE_MAX_LENGTH, CREATIVE_SHORT_BIO_MAX_LENGTH, creativeDisciplineError, normalizeCreativeDisciplines } from '../lib/creativeProfile';
import { cleanupReplacedProfileWebsiteMedia, uploadProfileWebsiteMedia } from '../lib/profileExternalStorage';
import { socialLinksFromText } from '../lib/socialLinks';
import { supabase } from '../lib/supabaseClient';

const sections = [
  ['overview', 'Overview'],
  ['about', 'About'],
  ['professional', 'Professional'],
  ['links', 'Links'],
  ['media', 'Photos'],
];

const lines = (value) => (Array.isArray(value) ? value : []).join('\n');
const lineList = (value) => String(value || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const details = (creative) => creative.professional_details && typeof creative.professional_details === 'object' ? creative.professional_details : {};

function initialForm(creative) {
  const professional = details(creative);
  return {
    name: creative.name || '', role: creative.role || '', short_bio: creative.short_bio || '', full_bio: creative.full_bio || '',
    location: creative.location || '', availability_status: creative.availability_status || '', skills: lines(creative.skills),
    education: lines(professional.education), experience: lines(professional.experience), achievements: lines(professional.achievements),
    social_links: (creative.social_links || []).map((item) => `${item.label}: ${item.href}`).join('\n'),
  };
}

export default function CreativeInlineProfileEditor({ creative, initialSection = 'overview', onClose, onSaved }) {
  const [section, setSection] = useState(initialSection);
  const [form, setForm] = useState(() => initialForm(creative));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [error, setError] = useState('');
  const profileInput = useRef(null);
  const coverInput = useRef(null);

  useEffect(() => setSection(initialSection), [initialSection]);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function save(event) {
    event.preventDefault();
    const shortBio = form.short_bio.trim();
    const skills = normalizeCreativeDisciplines(form.skills);
    const disciplineError = creativeDisciplineError(skills);
    if (!form.name.trim() || !form.role.trim()) { setError('Name and professional title are required.'); return; }
    if (shortBio.length > CREATIVE_SHORT_BIO_MAX_LENGTH) { setError(`Keep the short bio within ${CREATIVE_SHORT_BIO_MAX_LENGTH} characters.`); return; }
    if (disciplineError) { setError(disciplineError); return; }
    setSaving(true); setError('');
    const payload = {
      name: form.name.trim(), role: form.role.trim(), short_bio: shortBio || null, full_bio: form.full_bio.trim() || null,
      location: form.location.trim() || null, availability_status: form.availability_status.trim() || null,
      skills, social_links: socialLinksFromText(form.social_links),
      professional_details: {
        education: lineList(form.education), experience: lineList(form.experience), achievements: lineList(form.achievements),
      }, updated_at: new Date().toISOString(),
    };
    const { data, error: saveError } = await supabase.from('creative_members').update(payload).eq('id', creative.id).select('*').single();
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    onSaved?.(data); onClose();
  }

  async function upload(kind, file) {
    if (!file) return;
    setUploading(kind); setError('');
    const field = kind === 'cover' ? 'cover_image' : 'profile_image_url';
    const previous = creative[field] || '';
    try {
      const result = await uploadProfileWebsiteMedia(file, { creativeMemberId: creative.id, kind });
      const { data, error: updateError } = await supabase.from('creative_members').update({ [field]: result.url, updated_at: new Date().toISOString() }).eq('id', creative.id).select('*').single();
      if (updateError) throw updateError;
      await cleanupReplacedProfileWebsiteMedia(previous, result.url).catch(() => null);
      onSaved?.(data);
    } catch (reason) { setError(reason.message || 'The photo could not be replaced.'); }
    finally { setUploading(''); }
  }

  return <div className="ll-profile-editor-layer" role="dialog" aria-modal="true" aria-label="Edit Creative profile">
    <button type="button" className="ll-profile-editor-scrim" onClick={onClose} aria-label="Close profile editor" />
    <section className="ll-profile-editor">
      <header><div><p className="ll-kicker">Edit on your wall</p><h2>Profile details</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={21} /></button></header>
      <nav aria-label="Profile editor sections">{sections.map(([key, label]) => <button key={key} type="button" aria-pressed={section === key} onClick={() => setSection(key)}>{label}</button>)}</nav>
      <form onSubmit={save}>
        {section === 'overview' && <div className="ll-profile-editor-fields"><ProfileField label="Display name" value={form.name} onChange={(value) => update('name', value)} /><ProfileField label="Professional title" value={form.role} onChange={(value) => update('role', value)} /><ProfileField label="Location" value={form.location} onChange={(value) => update('location', value)} placeholder="Kalibo, Aklan" /><ProfileField label="Availability" value={form.availability_status} onChange={(value) => update('availability_status', value)} placeholder="Available for selected projects" /><ProfileTextarea label="Short bio" value={form.short_bio} onChange={(value) => update('short_bio', value)} maxLength={CREATIVE_SHORT_BIO_MAX_LENGTH} hint={`${form.short_bio.length}/${CREATIVE_SHORT_BIO_MAX_LENGTH}`} /><ProfileTextarea label="Disciplines" value={form.skills} onChange={(value) => update('skills', value)} hint={`One per line. Up to ${CREATIVE_DISCIPLINE_MAX_COUNT}, ${CREATIVE_DISCIPLINE_MAX_LENGTH} characters each.`} /></div>}
        {section === 'about' && <div className="ll-profile-editor-fields"><ProfileTextarea label="Full biography" value={form.full_bio} onChange={(value) => update('full_bio', value)} rows={9} hint="Tell clients about your perspective, background, and approach." /></div>}
        {section === 'professional' && <div className="ll-profile-editor-fields"><ProfileTextarea label="Experience" value={form.experience} onChange={(value) => update('experience', value)} hint="One role or professional milestone per line." /><ProfileTextarea label="Education" value={form.education} onChange={(value) => update('education', value)} hint="One school, course, or qualification per line." /><ProfileTextarea label="Achievements" value={form.achievements} onChange={(value) => update('achievements', value)} hint="One award, recognition, or meaningful achievement per line." /></div>}
        {section === 'links' && <div className="ll-profile-editor-fields"><ProfileTextarea label="Professional and social links" value={form.social_links} onChange={(value) => update('social_links', value)} rows={8} hint="One per line, for example Instagram: https://instagram.com/yourname" /></div>}
        {section === 'media' && <div className="ll-profile-media-choices"><input ref={profileInput} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={(event) => upload('profile', event.target.files?.[0])} /><input ref={coverInput} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={(event) => upload('cover', event.target.files?.[0])} /><button type="button" onClick={() => profileInput.current?.click()} disabled={Boolean(uploading)}><Camera size={21} /><span><strong>{uploading === 'profile' ? 'Uploading…' : 'Choose profile photo'}</strong><small>Square images work best.</small></span></button><button type="button" onClick={() => coverInput.current?.click()} disabled={Boolean(uploading)}><Camera size={21} /><span><strong>{uploading === 'cover' ? 'Uploading…' : 'Choose cover photo'}</strong><small>Use a wide landscape image.</small></span></button></div>}
        {error && <p className="ll-profile-editor-error" role="alert">{error}</p>}
        {section !== 'media' && <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="ll-primary-action" disabled={saving}><Save size={16} /> {saving ? 'Saving…' : 'Save changes'}</button></footer>}
      </form>
    </section>
  </div>;
}

function ProfileField({ label, value, onChange, placeholder }) { return <label><span>{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
function ProfileTextarea({ label, value, onChange, rows = 5, hint, maxLength }) { return <label><span>{label}</span><textarea rows={rows} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />{hint && <small>{hint}</small>}</label>; }
