import { Check, Copy, Dribbble, ExternalLink, Facebook, Github, Globe2, Instagram, Linkedin, Mail, Music2, Twitter, Youtube } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { copyText } from '../lib/clipboard';
import { usePublicContent } from '../lib/contentApi';
import { getPublicImageUrl } from '../lib/storage';
import { socialLinkMeta } from '../lib/socialLinks';
import { publicLocationState } from '../lib/navigationHistory';

export default function CreativeProfileView({ creative, projects = [], adminPreview = false }) {
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const [coverFailed, setCoverFailed] = useState(false);
  const [profileFailed, setProfileFailed] = useState(false);
  const { content } = usePublicContent([]);
  const skills = Array.isArray(creative.skills) ? creative.skills : [];
  const socialLinks = Array.isArray(creative.social_links) ? creative.social_links : [];
  const bio = adminPreview ? creative.short_bio || creative.full_bio : creative.full_bio || creative.short_bio;
  const coverImage = getPublicImageUrl(creative.cover_image);
  const profileImage = getPublicImageUrl(creative.profile_image_url);

  async function copyProfileLink() {
    try {
      await copyText(`${window.location.origin}/creatives/${creative.slug}`);
      setCopied(true);
      setCopyError('');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError('Profile link could not be copied.');
    }
  }

  return (
    <article className="min-w-0">
      {adminPreview && <p className="mb-6 text-xs font-medium uppercase tracking-[0.2em] text-amber-200">Admin preview</p>}
      <div className={`relative overflow-hidden bg-zinc-900 ${adminPreview ? 'h-36 sm:h-44 md:h-52' : 'h-44 sm:h-56 md:h-64'}`}>
        {coverImage && !coverFailed ? (
          <img src={coverImage} alt="" decoding="async" fetchPriority="high" sizes="100vw" width="1800" height="720" className="h-full w-full object-cover" onError={() => setCoverFailed(true)} />
        ) : <div className="h-full w-full bg-zinc-900" />}
        <div className="absolute inset-0 bg-black/15" />
      </div>
      <section className="grid gap-7 border-b border-white/[0.08] pb-10 md:grid-cols-[10rem_minmax(0,1fr)] md:items-start md:gap-10">
        <div className="relative z-10 -mt-14 flex justify-center md:-mt-16 md:justify-start">
          {profileImage && !profileFailed ? (
            <img src={profileImage} alt={creative.name} decoding="async" fetchPriority="high" sizes="(max-width: 639px) 128px, 160px" width="240" height="240" className={`${adminPreview ? 'h-28 w-28 sm:h-36 sm:w-36' : 'h-32 w-32 sm:h-40 sm:w-40'} rounded-full bg-zinc-900 object-cover ring-4 ring-zinc-950`} onError={() => setProfileFailed(true)} />
          ) : (
            <div className={`${adminPreview ? 'h-28 w-28 text-4xl sm:h-36 sm:w-36' : 'h-32 w-32 text-5xl sm:h-40 sm:w-40'} grid place-items-center rounded-full bg-zinc-900 font-semibold text-zinc-600 ring-4 ring-zinc-950`}>{creative.name?.slice(0, 1)}</div>
          )}
        </div>
        <div className="min-w-0 pt-2 text-center md:pt-7 md:text-left">
          <p className="text-xs uppercase tracking-[0.22em]" style={{ color: content.accentColor }}>{creative.role}</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: content.primaryTextColor }}>{creative.name}</h1>
          {creative.availability_status && <p className="mt-3 text-sm text-zinc-400">{creative.availability_status}</p>}
          {bio && <p className={`mt-5 max-w-3xl ${adminPreview ? 'text-sm leading-6 sm:text-base sm:leading-7' : 'text-base leading-7 sm:text-lg sm:leading-8'}`} style={{ color: content.secondaryTextColor }}>{bio}</p>}
          <div className="mt-6 flex flex-wrap justify-center gap-2 md:justify-start">
            <button type="button" onClick={copyProfileLink} className="inline-flex items-center gap-2 border border-white/[0.12] px-3.5 py-2.5 text-sm text-zinc-200 transition hover:border-[var(--site-accent)] hover:text-[var(--site-accent)]">
              {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Profile link copied' : 'Copy profile link'}
            </button>
            {socialLinks.map((link) => <SocialLink key={`${link.label}-${link.href}`} link={link} />)}
          </div>
          {copyError && <p className="mt-3 text-sm text-red-200">{copyError}</p>}
        </div>
      </section>

      <section className={`grid items-start gap-4 border-b border-white/[0.07] pt-5 ${adminPreview ? 'pb-4' : 'pb-5'} sm:grid-cols-[9rem_minmax(0,1fr)]`}>
        {!adminPreview && <div className="text-center sm:text-left"><span className="block text-2xl font-medium text-white">{projects.length}</span><span className="text-xs uppercase tracking-[0.16em] text-zinc-500">Published works</span></div>}
        {skills.length > 0 && <div className={`flex flex-wrap justify-center gap-x-4 gap-y-2 self-start sm:justify-start ${adminPreview ? 'sm:col-span-2' : ''}`}>{skills.map((skill) => <span key={skill} className="border-b border-white/[0.12] pb-1 text-sm text-zinc-400">{skill}</span>)}</div>}
      </section>

      {!adminPreview && <section className="pt-10">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Selected work</p><h2 className="mt-2 text-2xl font-medium" style={{ color: content.primaryTextColor }}>Works by {creative.name}</h2></div><p className="text-sm text-zinc-500">Published under Lahat Liwa Collectives</p></div>
        {projects.length ? <div className="mt-7 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">{projects.map((project) => <ProfileProject key={project.id} project={project} adminPreview={adminPreview} linkState={publicLocationState(location, `creative-project-${project.id}`)} />)}</div> : <p className="mt-7 border-t border-white/[0.07] pt-6 text-sm text-zinc-500">{adminPreview ? 'No linked projects yet.' : 'Credited works will appear here when they are published.'}</p>}
      </section>}
    </article>
  );
}

function SocialLink({ link }) {
  const { platform, label, href } = socialLinkMeta(link);
  const Icon = {
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
  }[platform] || Globe2;
  const external = !href.startsWith('mailto:');
  return <a href={href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} className="inline-flex items-center gap-2 border border-white/[0.12] px-3.5 py-2.5 text-sm text-zinc-200 transition hover:border-[var(--site-accent)] hover:text-[var(--site-accent)]"><Icon size={16} /> {label}{external && <ExternalLink size={14} />}</a>;
}

function ProfileProject({ project, adminPreview, linkState }) {
  const image = getPublicImageUrl(project.cover_image);
  const content = <><p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{project.category}{adminPreview && project.status !== 'published' ? ` / ${project.status}` : ''}</p><h3 className="mt-1 text-lg font-medium text-white transition group-hover:text-[var(--site-accent)]">{project.title}</h3></>;
  const imageContent = image ? <img src={image} alt={project.title} loading="lazy" decoding="async" sizes="(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) 50vw, 33vw" width="800" height="600" className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:opacity-85" /> : <div className="grid aspect-[4/3] place-items-center px-5 text-center text-sm text-zinc-500">Open project</div>;
  if (adminPreview && project.status !== 'published') return <article className="group"><div className="block bg-zinc-900">{imageContent}</div><div className="mt-3">{content}</div></article>;
  return <article id={`creative-project-${project.id}`} className="group scroll-mt-24"><Link to={`/projects/${project.slug}`} state={linkState} className="block bg-zinc-900">{imageContent}</Link><Link to={`/projects/${project.slug}`} state={linkState} className="mt-3 block">{content}</Link></article>;
}
