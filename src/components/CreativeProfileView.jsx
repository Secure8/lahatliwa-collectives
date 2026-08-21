import { ArrowRight, Dribbble, Edit3, Facebook, Github, Globe2, Instagram, Linkedin, Mail, Music2, PenLine, Plus, Trash2, Twitter, Youtube } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import CreativeHero from './CreativeHero';
import { getPublicImageUrl } from '../lib/storage';
import { socialLinkMeta } from '../lib/socialLinks';
import { publicLocationState } from '../lib/navigationHistory';
import { isResourceLink, resourceMeta } from '../lib/profileResources';
import { publicImageVariant } from '../lib/publicImages';
import CreativePostCard from './CreativePostCard';
import CreativeInlineProfileEditor from './CreativeInlineProfileEditor';
import IconLabelAction from './IconLabelAction';
import CreativeInlineField from './CreativeInlineField';

export default function CreativeProfileView({ creative, projects = [], posts = [], isOwner = false, moderator = false, onArchivePost, onRestorePost, onDeletePost, onModeratePost, onEditProject, onDeleteProject, adminPreview = false, onBack = null, onCreativeChange }) {
  const location = useLocation();
  const [editingSection, setEditingSection] = useState('');
  const skills = Array.isArray(creative.skills) ? creative.skills.filter(Boolean) : [];
  const allLinks = Array.isArray(creative.social_links) ? creative.social_links : [];
  const resources = allLinks.filter(isResourceLink);
  const socials = allLinks.filter((item) => !isResourceLink(item)).map(socialLinkMeta).filter((item) => item.href);
  const bio = creative.full_bio || creative.short_bio;
  const professional = creative.professional_details && typeof creative.professional_details === 'object' ? creative.professional_details : {};
  const legacyTools = resources.map(resourceMeta).map((item) => item.name).filter(Boolean);
  const tools = Object.prototype.hasOwnProperty.call(professional, 'tools')
    ? (Array.isArray(professional.tools) ? professional.tools.filter(Boolean) : [])
    : legacyTools;
  const ownerActions = isOwner && !adminPreview ? <Link to="/create" className="ll-primary-action"><PenLine size={17} /> Add work</Link> : null;
  return <article className="ll-profile-page ll-profile-template--studio" data-profile-template="studio">
    {adminPreview && <p className="ll-preview-label">Admin preview</p>}
    <CreativeHero creative={creative} socials={socials} tools={tools} adminPreview={adminPreview} actions={ownerActions} onBack={onBack} onEdit={isOwner && !adminPreview ? setEditingSection : null} onSaved={onCreativeChange} renderSocial={(item) => <SocialLink key={`${item.label}-${item.href}`} item={item} />} />

    {!adminPreview && <nav className="ll-profile-tabs" aria-label="Profile sections">
      <a href="#work">Work <span>{posts.filter((post) => post.status === 'published').length + projects.length || ''}</span></a>
      {bio && <a href="#about">About</a>}
      <a href="#contact">Contact</a>
    </nav>}

    {!adminPreview && <div className="ll-profile-layout">
      <main className="min-w-0">
        {isOwner && <Link to="/create" className="ll-composer-prompt"><span className="ll-composer-prompt__icon"><Plus size={20} /></span><span><strong>Add work</strong><small>Publish a project, visual story, essay, or process.</small></span><ArrowRight size={17} /></Link>}
        <section id="work" className="ll-profile-section"><SectionHeading eyebrow="Portfolio" title="Selected work" />
          {posts.length ? <div className="ll-feed-list">{posts.map((post) => <CreativePostCard key={post.id} post={post} creative={creative} owner={isOwner} moderator={moderator} onArchive={onArchivePost} onRestore={onRestorePost} onDelete={onDeletePost} onModerate={onModeratePost} />)}</div> : projects.length === 0 && <div className="ll-profile-empty"><p>No work published yet.</p>{isOwner && <Link to="/create"><Plus size={16} /> Add your first work</Link>}</div>}
          {projects.length > 0 && <div className="ll-profile-projects ll-legacy-work-list">{projects.map((project) => <ProfileProject key={project.id} project={project} linkState={publicLocationState(location, `creative-project-${project.id}`)} canManage={isOwner && project.canEdit} onEdit={onEditProject} onDelete={onDeleteProject} />)}</div>}
        </section>
      </main>
      <aside className="ll-profile-about" id="about">
        {(bio || isOwner) && <section><p className="ll-kicker">About</p><h2>Creative perspective</h2><CreativeInlineField creative={creative} owner={isOwner} field="full_bio" value={bio || ''} label="Edit professional biography" type="textarea" as="p" className={!bio ? 'll-profile-placeholder' : ''} onSaved={onCreativeChange}>{bio || 'Add a professional biography.'}</CreativeInlineField></section>}
        {(skills.length > 0 || isOwner) && <section><p className="ll-kicker">Disciplines</p><CreativeInlineField creative={creative} owner={isOwner} field="skills" value={skills} label="Edit disciplines" type="list" as="ul" onSaved={onCreativeChange}>{skills.length ? skills.map((skill) => <li key={skill}>{skill}</li>) : <li className="ll-profile-placeholder">Add your creative disciplines.</li>}</CreativeInlineField></section>}
        <ProfessionalSection title="Experience" items={professional.experience} owner={isOwner} creative={creative} onSaved={onCreativeChange} />
        <ProfessionalSection title="Education" items={professional.education} owner={isOwner} creative={creative} onSaved={onCreativeChange} />
        <ProfessionalSection title="Achievements" items={professional.achievements} owner={isOwner} creative={creative} onSaved={onCreativeChange} />
      </aside>
    </div>}

    {!adminPreview && <footer id="contact" className="ll-profile-contact"><div><p className="ll-kicker">Direct inquiry</p><h2>Work with {creative.name}.</h2><p>Your inquiry goes directly to this Creative and remains private.</p></div><Link to={`/inquiry?creative=${encodeURIComponent(creative.slug)}`} className="ll-primary-action">Start an inquiry <ArrowRight size={16} /></Link></footer>}
    {editingSection && <CreativeInlineProfileEditor creative={creative} initialSection={editingSection} onClose={() => setEditingSection('')} onSaved={onCreativeChange} />}
  </article>;
}

function SectionHeading({ eyebrow, title }) { return <div className="ll-section-heading"><p className="ll-kicker">{eyebrow}</p><h2>{title}</h2></div>; }
function ProfessionalSection({ title, items, owner, creative, onSaved }) { const values = Array.isArray(items) ? items.filter(Boolean) : []; if (!owner && !values.length) return null; const key = title.toLowerCase(); return <section><p className="ll-kicker">{title}</p><CreativeInlineField creative={creative} owner={owner} field={`professional_details.${key}`} value={values} label={`Edit ${key}`} type="list" as="ul" onSaved={onSaved}>{values.length ? values.map((item) => <li key={item}>{item}</li>) : <li className="ll-profile-placeholder">Add {key}.</li>}</CreativeInlineField></section>; }
function SocialLink({ item }) { const icons={facebook:Facebook,instagram:Instagram,linkedin:Linkedin,youtube:Youtube,twitter:Twitter,github:Github,dribbble:Dribbble,tiktok:Music2,email:Mail,website:Globe2}; const Icon=icons[item.platform]||Globe2; const external=!item.href.startsWith('mailto:'); return <a href={item.href} target={external?'_blank':undefined} rel={external?'noopener noreferrer':undefined} aria-label={`${item.label}${external?' (opens in a new tab)':''}`} title={item.label}><Icon size={17}/></a>; }
function ProfileProject({project,linkState,canManage,onEdit,onDelete}) {
  const image=publicImageVariant(getPublicImageUrl(project.cover_image),'display');
  const roles=[...(project.credit_roles||[]),project.contribution_role,project.role].filter(Boolean);
  const content=<>{image?<img src={image} alt="" loading="lazy" decoding="async"/>:<span className="ll-profile-project__fallback"/>}<span><small>{project.status === 'published' ? project.category : `${project.category} · ${project.status}`}</small><strong>{project.title}</strong>{roles.length>0&&<em>{[...new Set(roles)].join(' · ')}</em>}</span>{project.status==='published'&&<ArrowRight size={17}/>}</>;
  return <article id={`creative-project-${project.id}`} className="ll-profile-project">{project.status==='published'?<Link to={`/projects/${project.slug}`} state={linkState}>{content}</Link>:<div className="ll-profile-project__draft">{content}</div>}{project.moderation_reason&&<p className="ll-moderation-note">Super Admin note: {project.moderation_reason}</p>}{canManage&&<div className="ll-profile-project-controls"><IconLabelAction icon={<Edit3 size={15}/>} label="Edit" onClick={()=>onEdit?.(project)}/><IconLabelAction icon={<Trash2 size={15}/>} label="Delete" tone="danger" onClick={()=>onDelete?.(project)}/></div>}</article>;
}
