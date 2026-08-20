import { ArrowRight, Camera, ChevronLeft, Edit3, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { getPublicImageUrl } from '../lib/storage';
import { publicImageVariant } from '../lib/publicImages';
import { resourceMeta } from '../lib/profileResources';
import { CREATIVE_DISCIPLINE_MAX_COUNT, normalizeCreativeDisciplines } from '../lib/creativeProfile';

export default function CreativeHero({ creative, socials, resources = [], renderSocial, adminPreview = false, actions = null, onBack = null, onEdit = null }) {
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
        {onEdit && <button type="button" className="ll-profile-identity-edit" onClick={() => onEdit('overview')} aria-label="Edit profile introduction"><Edit3 size={15} /></button>}
        <p className="ll-kicker">Creative profile</p>
        <h1>{creative.name}</h1>
        <p className="ll-profile-professional-title">{creative.role || 'Creative'}</p>
        {disciplines.length > 0 && <ul className="ll-profile-disciplines" aria-label="Creative disciplines">{disciplines.map((discipline) => <li key={discipline}>{discipline}</li>)}</ul>}
        {creative.short_bio && <p className="ll-profile-intro">{creative.short_bio}</p>}
        <div className="ll-profile-meta">
          {creative.location && <span><MapPin size={15} /> {creative.location}</span>}
          {creative.availability_status && <span className={`is-available is-${creative.availability_status}`}><i /> {availabilityLabel}</span>}
        </div>
      </div>
      <div className="ll-profile-actions">{actions || (!adminPreview && <Link to={`/inquiry?creative=${encodeURIComponent(creative.slug)}`} className="ll-primary-action">Ask about working together <ArrowRight size={16} /></Link>)}<div className="ll-profile-socials">{socials.map(renderSocial)}</div></div>
    </div>
    {resources.length > 0 && <div className="ll-profile-resources" aria-label="Creative tools and resources">{resources.slice(0, 10).map((resource) => <ResourceLink key={`${resource.name}-${resource.url}`} resource={resource} />)}</div>}
  </header>;
}

function SafeImage({ ...props }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img {...props} onError={() => setFailed(true)} />;
}

function ResourceLink({ resource }) {
  const meta = resourceMeta(resource);
  const [failed, setFailed] = useState(false);
  if (!meta.href) return null;
  return <a href={meta.href} target="_blank" rel="noopener noreferrer" aria-label={`${meta.name} (opens in a new tab)`} title={meta.name}>{meta.icon && !failed ? <img src={meta.icon} alt="" onError={() => setFailed(true)} /> : <span>{meta.name.slice(0, 2)}</span>}<small>{meta.name}</small></a>;
}
