import { ArrowRight, Camera, ChevronLeft, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicImageUrl } from '../lib/storage';
import { publicImageVariant } from '../lib/publicImages';
import { CREATIVE_DISCIPLINE_MAX_COUNT, normalizeCreativeDisciplines } from '../lib/creativeProfile';
import CreativeInlineField from './CreativeInlineField';

export default function CreativeHero({ creative, socials, tools = [], renderSocial, adminPreview = false, actions = null, onBack = null, onEdit = null, onSaved = null }) {
  const profileImage = publicImageVariant(getPublicImageUrl(creative.profile_image_url), 'display');
  const coverImage = publicImageVariant(getPublicImageUrl(creative.cover_image), 'expanded');
  const disciplines = normalizeCreativeDisciplines(creative.skills).slice(0, CREATIVE_DISCIPLINE_MAX_COUNT);
  const availabilityLabel = { available: 'Available for work', limited: 'Limited availability', unavailable: 'Not currently available' }[creative.availability_status] || creative.availability_status;
  return <header className="ll-profile-header">
    <div className="ll-profile-cover">
      {coverImage ? <SafeImage src={coverImage} alt={`${creative.name} cover`} loading={adminPreview ? 'lazy' : 'eager'} style={{ objectPosition: creative.cover_image_position || '50% 50%' }} /> : <div className="ll-profile-cover__fallback" aria-hidden="true" />}
      {onBack && <button type="button" className="ll-profile-cover-back" onClick={onBack} aria-label="Back to Creatives" title="Back to Creatives"><ChevronLeft size={30} strokeWidth={2.2} /></button>}
      {onEdit && <button type="button" className="ll-profile-cover-edit" onClick={() => onEdit('media')}><Camera size={17} /> Change cover photo</button>}
    </div>
    <div className="ll-profile-identity">
      {onEdit ? <button type="button" className="ll-profile-avatar is-editable" onClick={() => onEdit('media')} aria-label="Change profile photo">{profileImage ? <SafeImage src={profileImage} alt={`${creative.name} profile`} style={{ objectPosition: creative.profile_image_position || '50% 50%' }} /> : <span>{creative.name?.slice(0, 1) || 'L'}</span>}<i><Camera size={18} /></i></button> : <div className="ll-profile-avatar">{profileImage ? <SafeImage src={profileImage} alt={`${creative.name} profile`} style={{ objectPosition: creative.profile_image_position || '50% 50%' }} /> : <span>{creative.name?.slice(0, 1) || 'L'}</span>}</div>}
      <div className="ll-profile-identity__copy">
        <p className="ll-kicker">Creative profile</p>
        <CreativeInlineField creative={creative} owner={Boolean(onEdit)} field="name" value={creative.name} label="Edit display name" as="h1" onSaved={onSaved}>{creative.name}</CreativeInlineField>
        <CreativeInlineField creative={creative} owner={Boolean(onEdit)} field="role" value={creative.role || 'Creative'} label="Edit professional title" as="p" className="ll-profile-professional-title" onSaved={onSaved}>{creative.role || 'Creative'}</CreativeInlineField>
        {(disciplines.length > 0 || onEdit) && <CreativeInlineField creative={creative} owner={Boolean(onEdit)} field="skills" value={disciplines} label="Edit disciplines" type="list" as="ul" className="ll-profile-disciplines" aria-label="Creative disciplines" onSaved={onSaved}>{disciplines.length ? disciplines.map((discipline) => <li key={discipline}>{discipline}</li>) : <li>Add disciplines</li>}</CreativeInlineField>}
        {(creative.short_bio || onEdit) && <CreativeInlineField creative={creative} owner={Boolean(onEdit)} field="short_bio" value={creative.short_bio || ''} label="Edit short bio" type="textarea" maxLength={160} as="p" className="ll-profile-intro" onSaved={onSaved}>{creative.short_bio || 'Add a short professional bio.'}</CreativeInlineField>}
        <div className="ll-profile-meta">
          {(creative.location || onEdit) && <CreativeInlineField creative={creative} owner={Boolean(onEdit)} field="location" value={creative.location || ''} label="Edit location" as="span" onSaved={onSaved}><MapPin size={15} /> {creative.location || 'Add location'}</CreativeInlineField>}
          {(creative.availability_status || onEdit) && <CreativeInlineField creative={creative} owner={Boolean(onEdit)} field="availability_status" value={creative.availability_status || 'available'} label="Edit availability" type="select" options={[["available","Available for work"],["limited","Limited availability"],["unavailable","Not currently available"]]} as="span" className={`is-available is-${creative.availability_status || 'available'}`} onSaved={onSaved}><i /> {availabilityLabel || 'Available for work'}</CreativeInlineField>}
        </div>
      </div>
      <div className="ll-profile-actions">{actions || (!adminPreview && <Link to={`/inquiry?creative=${encodeURIComponent(creative.slug)}`} className="ll-primary-action">Ask about working together <ArrowRight size={16} /></Link>)}<div className="ll-profile-socials">{socials.map(renderSocial)}</div></div>
    </div>
    {(tools.length > 0 || onEdit) && <section className="ll-profile-tools" aria-label="Creative tools"><strong>Tools</strong><CreativeInlineField creative={creative} owner={Boolean(onEdit)} field="professional_details.tools" value={tools} label="Edit tools" type="list" as="ul" onSaved={onSaved}>{tools.length ? tools.slice(0, 12).map((tool) => <li key={tool}>{tool}</li>) : <li>Add the tools you use</li>}</CreativeInlineField></section>}
  </header>;
}

function SafeImage({ ...props }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img {...props} onError={() => setFailed(true)} />;
}
