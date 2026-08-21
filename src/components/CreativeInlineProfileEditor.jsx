import { Camera, Check, LayoutTemplate, Save, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CREATIVE_DISCIPLINE_MAX_COUNT, CREATIVE_DISCIPLINE_MAX_LENGTH, CREATIVE_SHORT_BIO_MAX_LENGTH, creativeDisciplineError, normalizeCreativeDisciplines } from '../lib/creativeProfile';
import { cleanupReplacedProfileWebsiteMedia, uploadProfileWebsiteMedia } from '../lib/profileExternalStorage';
import { socialLinksFromText } from '../lib/socialLinks';
import { supabase } from '../lib/supabaseClient';
import { CREATIVE_PROFILE_TEMPLATES, normalizeCreativeProfileTemplate } from '../lib/creativeProfileTemplates';
import { groupWorkTaxonomy, loadMemberTermIds, loadWorkTaxonomy, saveMemberTaxonomy, WORK_AVAILABILITY } from '../lib/workTaxonomy';

const sections = [
  ['overview', 'Overview'],
  ['about', 'About'],
  ['professional', 'Professional'],
  ['links', 'Links'],
  ['media', 'Photos'],
  ['design', 'Design'],
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
    profile_template: normalizeCreativeProfileTemplate(creative.profile_template),
  };
}

export default function CreativeInlineProfileEditor({ creative, initialSection = 'overview', onClose, onSaved }) {
  const [section, setSection] = useState(initialSection);
  const [form, setForm] = useState(() => initialForm(creative));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [pendingMedia, setPendingMedia] = useState(null);
  const [taxonomy, setTaxonomy] = useState([]);
  const [termIds, setTermIds] = useState([]);
  const [error, setError] = useState('');
  const profileInput = useRef(null);
  const coverInput = useRef(null);

  useEffect(() => setSection(initialSection), [initialSection]);
  useEffect(() => {
    let active = true;
    Promise.all([loadWorkTaxonomy(), loadMemberTermIds(creative.id)]).then(([terms, selected]) => {
      if (!active) return;
      setTaxonomy(terms); setTermIds(selected);
    }).catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [creative.id]);
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
      profile_template: normalizeCreativeProfileTemplate(form.profile_template),
      professional_details: {
        education: lineList(form.education), experience: lineList(form.experience), achievements: lineList(form.achievements),
      }, updated_at: new Date().toISOString(),
    };
    const { data, error: saveError } = await supabase.from('creative_members').update(payload).eq('id', creative.id).select('*').single();
    if (saveError) { setSaving(false); setError(saveError.message); return; }
    try { await saveMemberTaxonomy(creative.id, termIds); }
    catch (reason) { setSaving(false); setError(reason.message); return; }
    setSaving(false);
    onSaved?.(data); onClose();
  }

  function prepareMedia(kind, file) {
    if (!file) return;
    setPendingMedia({ kind, file, preview: URL.createObjectURL(file), x: 50, y: 50 });
  }

  async function upload(kind, file, position = '50% 50%') {
    if (!file) return;
    setUploading(kind); setError('');
    const field = kind === 'cover' ? 'cover_image' : 'profile_image_url';
    const positionField = kind === 'cover' ? 'cover_image_position' : 'profile_image_position';
    const previous = creative[field] || '';
    try {
      const result = await uploadProfileWebsiteMedia(file, { creativeMemberId: creative.id, kind });
      const { data, error: updateError } = await supabase.from('creative_members').update({ [field]: result.url, [positionField]: position, updated_at: new Date().toISOString() }).eq('id', creative.id).select('*').single();
      if (updateError) throw updateError;
      await cleanupReplacedProfileWebsiteMedia(previous, result.url).catch(() => null);
      onSaved?.(data);
    } catch (reason) { setError(reason.message || 'The photo could not be replaced.'); }
    finally { setUploading(''); }
  }

  async function confirmMedia() {
    if (!pendingMedia) return;
    const media = pendingMedia;
    await upload(media.kind, media.file, `${media.x}% ${media.y}%`);
    URL.revokeObjectURL(media.preview);
    setPendingMedia(null);
  }

  return <div className="ll-profile-editor-layer" role="dialog" aria-modal="true" aria-label="Edit Creative profile">
    <button type="button" className="ll-profile-editor-scrim" onClick={onClose} aria-label="Close profile editor" />
    <section className="ll-profile-editor">
      <header><div><p className="ll-kicker">Edit on your wall</p><h2>Profile details</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={21} /></button></header>
      <nav aria-label="Profile editor sections">{sections.map(([key, label]) => <button key={key} type="button" aria-pressed={section === key} onClick={() => setSection(key)}>{label}</button>)}</nav>
      <form onSubmit={save}>
        {section === 'overview' && <div className="ll-profile-editor-fields"><ProfileField label="Display name" value={form.name} onChange={(value) => update('name', value)} /><ProfileField label="Professional title" value={form.role} onChange={(value) => update('role', value)} /><ProfileField label="Location" value={form.location} onChange={(value) => update('location', value)} placeholder="Kalibo, Aklan" /><label><span>Availability</span><select value={form.availability_status || 'available'} onChange={(event) => update('availability_status', event.target.value)}>{WORK_AVAILABILITY.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><ProfileTextarea label="Short bio" value={form.short_bio} onChange={(value) => update('short_bio', value)} maxLength={CREATIVE_SHORT_BIO_MAX_LENGTH} hint={`${form.short_bio.length}/${CREATIVE_SHORT_BIO_MAX_LENGTH}`} /><ProfileTextarea label="Disciplines" value={form.skills} onChange={(value) => update('skills', value)} hint={`One per line. Up to ${CREATIVE_DISCIPLINE_MAX_COUNT}, ${CREATIVE_DISCIPLINE_MAX_LENGTH} characters each.`} /><TaxonomyPicker terms={taxonomy} selected={termIds} onChange={setTermIds}/></div>}
        {section === 'about' && <div className="ll-profile-editor-fields"><ProfileTextarea label="Full biography" value={form.full_bio} onChange={(value) => update('full_bio', value)} rows={9} hint="Tell clients about your perspective, background, and approach." /></div>}
        {section === 'professional' && <div className="ll-profile-editor-fields"><ProfileTextarea label="Experience" value={form.experience} onChange={(value) => update('experience', value)} hint="One role or professional milestone per line." /><ProfileTextarea label="Education" value={form.education} onChange={(value) => update('education', value)} hint="One school, course, or qualification per line." /><ProfileTextarea label="Achievements" value={form.achievements} onChange={(value) => update('achievements', value)} hint="One award, recognition, or meaningful achievement per line." /></div>}
        {section === 'links' && <div className="ll-profile-editor-fields"><ProfileTextarea label="Social links" value={form.social_links} onChange={(value) => update('social_links', value)} rows={8} hint="One per line, for example Instagram: https://instagram.com/yourname. Add tools directly from the Tools section on your profile." /></div>}
        {section === 'media' && <div className="ll-profile-media-choices"><input ref={profileInput} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={(event) => prepareMedia('profile', event.target.files?.[0])} /><input ref={coverInput} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={(event) => prepareMedia('cover', event.target.files?.[0])} /><button type="button" onClick={() => profileInput.current?.click()} disabled={Boolean(uploading)}><Camera size={21} /><span><strong>{uploading === 'profile' ? 'Uploading…' : 'Choose profile photo'}</strong><small>Position it before saving.</small></span></button><button type="button" onClick={() => coverInput.current?.click()} disabled={Boolean(uploading)}><Camera size={21} /><span><strong>{uploading === 'cover' ? 'Uploading…' : 'Choose cover photo'}</strong><small>Position it before saving.</small></span></button></div>}
        {section === 'design' && <div className="ll-template-picker"><div className="ll-template-picker__intro"><LayoutTemplate size={21}/><div><strong>Choose your portfolio style</strong><p>Every option is responsive. The two previews show how the same profile adapts on desktop and mobile.</p></div></div>{CREATIVE_PROFILE_TEMPLATES.map((template) => <button key={template.key} type="button" className={`ll-template-option is-${template.key}${form.profile_template === template.key ? ' is-selected' : ''}`} onClick={() => update('profile_template', template.key)}><TemplatePreview template={template.key}/><span className="ll-template-option__copy"><strong>{template.name}</strong><small>{template.description}</small></span>{form.profile_template === template.key && <Check size={18}/>}</button>)}</div>}
        {error && <p className="ll-profile-editor-error" role="alert">{error}</p>}
        {section !== 'media' && <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="ll-primary-action" disabled={saving}><Save size={16} /> {saving ? 'Saving…' : section === 'design' ? 'Use this template' : 'Save changes'}</button></footer>}
      </form>
    </section>
    {pendingMedia && <section className="ll-image-positioner" aria-label={`Position ${pendingMedia.kind} photo`}><header><div><p className="ll-kicker">Photo framing</p><h3>Position your {pendingMedia.kind} photo</h3></div><button type="button" onClick={() => { URL.revokeObjectURL(pendingMedia.preview); setPendingMedia(null); }} aria-label="Close"><X size={19}/></button></header><div className={`ll-image-positioner__preview is-${pendingMedia.kind}`}><img src={pendingMedia.preview} alt="Preview" style={{objectPosition:`${pendingMedia.x}% ${pendingMedia.y}%`}}/></div><label>Move left or right<input type="range" min="0" max="100" value={pendingMedia.x} onChange={(event)=>setPendingMedia((current)=>({...current,x:Number(event.target.value)}))}/></label><label>Move up or down<input type="range" min="0" max="100" value={pendingMedia.y} onChange={(event)=>setPendingMedia((current)=>({...current,y:Number(event.target.value)}))}/></label><footer><button type="button" onClick={() => { URL.revokeObjectURL(pendingMedia.preview); setPendingMedia(null); }}>Cancel</button><button type="button" className="ll-primary-action" disabled={Boolean(uploading)} onClick={confirmMedia}><Save size={16}/>{uploading ? 'Uploading…' : 'Use this framing'}</button></footer></section>}
  </div>;
}

function ProfileField({ label, value, onChange, placeholder }) { return <label><span>{label}</span><input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>; }
function ProfileTextarea({ label, value, onChange, rows = 5, hint, maxLength }) { return <label><span>{label}</span><textarea rows={rows} value={value} maxLength={maxLength} onChange={(event) => onChange(event.target.value)} />{hint && <small>{hint}</small>}</label>; }
function TemplatePreview({ template }) { return <span className="ll-template-option__previews" aria-hidden="true"><span className="ll-template-device is-desktop"><i className="is-cover"/><i className="is-avatar"/><i className="is-title"/><i className="is-work"/><i className="is-work"/><i className="is-side"/></span><span className="ll-template-device is-mobile"><i className="is-cover"/><i className="is-avatar"/><i className="is-title"/><i className="is-work"/><i className="is-work"/></span></span>; }
function TaxonomyPicker({ terms, selected, onChange }) {
  const groups = groupWorkTaxonomy(terms);
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  return <fieldset className="ll-profile-taxonomy"><legend>Portfolio categories</legend><small>Use the same categories that help visitors discover your Work.</small>{Object.entries(groups).map(([kind, items]) => <div key={kind}><strong>{kind}</strong><div>{items.map((term) => <button key={term.id} type="button" aria-pressed={selected.includes(term.id)} onClick={() => toggle(term.id)}>{term.name}</button>)}</div></div>)}</fieldset>;
}
