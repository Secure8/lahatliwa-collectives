import { ArrowRight, Dribbble, Edit3, Facebook, Github, Globe2, Instagram, Linkedin, Mail, Music2, PenLine, Plus, Twitter, Youtube } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import CreativeHero from './CreativeHero';
import { getPublicImageUrl } from '../lib/storage';
import { socialLinkMeta } from '../lib/socialLinks';
import { publicLocationState } from '../lib/navigationHistory';
import { isResourceLink } from '../lib/profileResources';
import { publicImageVariant } from '../lib/publicImages';
import CreativePostCard from './CreativePostCard';

export default function CreativeProfileView({ creative, projects = [], posts = [], isOwner = false, onArchivePost, onRestorePost, onDeletePost, adminPreview = false, onBack = null }) {
  const location = useLocation();
  const skills = Array.isArray(creative.skills) ? creative.skills.filter(Boolean) : [];
  const allLinks = Array.isArray(creative.social_links) ? creative.social_links : [];
  const resources = allLinks.filter(isResourceLink);
  const socials = allLinks.filter((item) => !isResourceLink(item)).map(socialLinkMeta).filter((item) => item.href);
  const bio = creative.full_bio || creative.short_bio;
  const ownerActions = isOwner && !adminPreview ? <><Link to="/create" className="ll-primary-action"><PenLine size={17} /> Create post</Link><Link to="/admin/my-profile" className="ll-secondary-action"><Edit3 size={16} /> Edit profile</Link></> : null;
  return <article className="ll-profile-page">
    {adminPreview && <p className="ll-preview-label">Admin preview</p>}
    <CreativeHero creative={creative} socials={socials} resources={resources} adminPreview={adminPreview} actions={ownerActions} onBack={onBack} renderSocial={(item) => <SocialLink key={`${item.label}-${item.href}`} item={item} />} />

    {!adminPreview && <nav className="ll-profile-tabs" aria-label="Profile sections">
      <a href="#feed">Posts <span>{posts.filter((post) => post.status === 'published').length || ''}</span></a>
      {projects.length > 0 && <a href="#work">Projects <span>{projects.length}</span></a>}
      {bio && <a href="#about">About</a>}
      <a href="#contact">Contact</a>
    </nav>}

    {!adminPreview && <div className="ll-profile-layout">
      <main className="min-w-0">
        {isOwner && <Link to="/create" className="ll-composer-prompt"><span className="ll-composer-prompt__icon"><Plus size={20} /></span><span><strong>Create a post</strong><small>Share work, process, photography, or a reflection.</small></span><ArrowRight size={17} /></Link>}
        <section id="feed" className="ll-profile-section"><SectionHeading eyebrow="Personal wall" title="Published work and stories" />
          {posts.length ? <div className="ll-feed-list">{posts.map((post) => <CreativePostCard key={post.id} post={post} creative={creative} owner={isOwner} onArchive={onArchivePost} onRestore={onRestorePost} onDelete={onDeletePost} />)}</div> : <div className="ll-profile-empty"><p>No posts published yet.</p>{isOwner && <Link to="/create"><Plus size={16} /> Create your first post</Link>}</div>}
        </section>
        {projects.length > 0 && <section id="work" className="ll-profile-section"><SectionHeading eyebrow="Formal portfolio" title="Projects" /><div className="ll-profile-projects">{projects.map((project) => <ProfileProject key={project.id} project={project} linkState={publicLocationState(location, `creative-project-${project.id}`)} />)}</div></section>}
      </main>
      <aside className="ll-profile-about" id="about">
        {bio && <section><p className="ll-kicker">About</p><h2>Creative perspective</h2><p>{bio}</p></section>}
        {skills.length > 0 && <section><p className="ll-kicker">Disciplines</p><ul>{skills.map((skill) => <li key={skill}>{skill}</li>)}</ul></section>}
      </aside>
    </div>}

    {!adminPreview && <footer id="contact" className="ll-profile-contact"><div><p className="ll-kicker">Professional inquiry</p><h2>Interested in this Creative's work?</h2><p>Tell us about the project, collaboration, or opportunity. Lahat Liwa will help guide the right next step.</p></div><Link to="/inquiry" className="ll-primary-action">Ask about working together <ArrowRight size={16} /></Link></footer>}
  </article>;
}

function SectionHeading({ eyebrow, title }) { return <div className="ll-section-heading"><p className="ll-kicker">{eyebrow}</p><h2>{title}</h2></div>; }
function SocialLink({ item }) { const icons={facebook:Facebook,instagram:Instagram,linkedin:Linkedin,youtube:Youtube,twitter:Twitter,github:Github,dribbble:Dribbble,tiktok:Music2,email:Mail,website:Globe2}; const Icon=icons[item.platform]||Globe2; const external=!item.href.startsWith('mailto:'); return <a href={item.href} target={external?'_blank':undefined} rel={external?'noopener noreferrer':undefined} aria-label={`${item.label}${external?' (opens in a new tab)':''}`} title={item.label}><Icon size={17}/></a>; }
function ProfileProject({project,linkState}) {
  const image=publicImageVariant(getPublicImageUrl(project.cover_image),'display');
  const roles=[...(project.credit_roles||[]),project.contribution_role,project.role].filter(Boolean);
  return <article id={`creative-project-${project.id}`} className="ll-profile-project"><Link to={`/projects/${project.slug}`} state={linkState}>{image?<img src={image} alt="" loading="lazy" decoding="async"/>:<span className="ll-profile-project__fallback"/>}<span><small>{project.category}</small><strong>{project.title}</strong>{roles.length>0&&<em>{[...new Set(roles)].join(' · ')}</em>}</span><ArrowRight size={17}/></Link></article>;
}
