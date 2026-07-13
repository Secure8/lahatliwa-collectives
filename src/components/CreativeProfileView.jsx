import { ArrowRight, Dribbble, ExternalLink, Facebook, Github, Globe2, Instagram, Linkedin, Mail, Music2, Twitter, Youtube } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import CreativeHero from './CreativeHero';
import { getPublicImageUrl } from '../lib/storage';
import { socialLinkMeta } from '../lib/socialLinks';
import { publicLocationState } from '../lib/navigationHistory';
import { projectLayout } from '../lib/creativeProfileLayout';
import { isResourceLink } from '../lib/profileResources';
import { inquiryUrl } from '../lib/serviceRequest';

export default function CreativeProfileView({ creative, projects = [], adminPreview = false }) {
  const location = useLocation();
  const skills = Array.isArray(creative.skills) ? creative.skills.filter(Boolean) : [];
  const allLinks = Array.isArray(creative.social_links) ? creative.social_links : [];
  const resources = allLinks.filter(isResourceLink);
  const socials = allLinks.filter((item) => !isResourceLink(item)).map(socialLinkMeta).filter((item) => item.href);
  const bio = creative.full_bio || creative.short_bio;
  return <article className="relative isolate min-w-0 overflow-hidden">
    {!adminPreview && <ProfileRails />}
    {adminPreview && <p className="mb-4 text-xs uppercase tracking-[0.2em] text-amber-200">Admin preview</p>}
    <CreativeHero creative={creative} projectCount={projects.length} socials={socials} resources={resources} adminPreview={adminPreview} renderSocial={(item) => <SocialLink key={`${item.label}-${item.href}`} item={item} />} />

    <div className="mx-auto w-full max-w-[1120px]">
    {!adminPreview && (projects.length || bio || skills.length) > 0 && <nav aria-label="Profile sections" className="public-filter-scroll flex min-w-0 gap-7 overflow-x-auto border-b border-white/[0.09] py-4 text-xs uppercase tracking-[0.16em] text-zinc-500">
      {projects.length > 0 && <a href="#work" className="min-h-11 content-center border-b border-orange-300 text-white">Selected work</a>}
      {bio && <a href="#about" className="min-h-11 content-center transition hover:text-white">About</a>}
      {skills.length > 0 && <a href="#skills" className="min-h-11 content-center transition hover:text-white">Capabilities</a>}
      <a href="#contact" className="min-h-11 content-center transition hover:text-white">Contact</a>
    </nav>}

    {!adminPreview && <section id="work" className="scroll-mt-24 py-8 sm:py-10">
      <SectionHeading number="01" eyebrow="Selected work" title="Portfolio" detail={`${projects.length} published ${projects.length === 1 ? 'project' : 'projects'}`} />
      {projects.length ? <div className="mx-auto mt-7 grid max-w-[1040px] gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-12">{projects.map((project, index) => <ProfileProject key={project.id} project={project} layout={projectLayout(index, projects.length)} linkState={publicLocationState(location, `creative-project-${project.id}`)} />)}</div> : <div className="mt-7 border-y border-white/[0.08] py-8"><p className="text-sm text-zinc-400">Work in progress.</p><p className="mt-2 text-sm text-zinc-600">Published credited projects will appear here.</p></div>}
    </section>}

    {bio && <section id="about" className="scroll-mt-24 border-t border-white/[0.09] py-8 sm:py-10">
      <SectionHeading number="02" eyebrow="About" title="Creative perspective" />
      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-12">
        <div className="max-w-[44rem] whitespace-pre-line text-base leading-7 text-zinc-200 sm:text-lg sm:leading-8">{bio}</div>
        <dl className="self-start border-t border-orange-300/70 text-sm">
          <Fact label="Discipline" value={creative.role} />
          {creative.availability_status && <Fact label="Availability" value={creative.availability_status} />}
          {creative.location && <Fact label="Location" value={creative.location} />}
          <Fact label="Selected work" value={`${projects.length} published`} />
        </dl>
      </div>
    </section>}

    {skills.length > 0 && <section id="skills" className="scroll-mt-24 border-t border-white/[0.09] bg-white/[0.018] px-4 py-8 sm:px-5 sm:py-10">
      <SectionHeading number="03" eyebrow="Capabilities" title="Selected disciplines" detail={`${skills.length} capabilities`} />
      <ol className="mt-7 grid border-t border-white/[0.1] sm:grid-cols-2 lg:grid-cols-3">{skills.map((skill, index) => <li key={skill} className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] gap-2 border-b border-white/[0.09] py-3.5 sm:pr-5"><span className="text-[11px] text-orange-300">{String(index + 1).padStart(2, '0')}</span><span className="[overflow-wrap:anywhere] text-sm text-zinc-200">{skill}</span></li>)}</ol>
    </section>}

    {!adminPreview && <footer id="contact" className="scroll-mt-24 border-t border-orange-300/60 py-8 sm:py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-orange-300">04 / Collaboration</p>
      <div className="mt-5 grid gap-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div><h2 className="max-w-2xl text-[clamp(1.85rem,3.5vw,3.25rem)] font-medium leading-[1.05] tracking-[-0.035em] text-white">Create something meaningful together.</h2>{creative.availability_status && <p className="mt-3 text-sm text-zinc-400">{creative.availability_status}</p>}</div>
        <div className="flex flex-wrap gap-4"><Link to={inquiryUrl({ creative: creative.slug })} className="inline-flex min-h-11 items-center gap-2 bg-orange-300 px-5 text-sm font-semibold text-zinc-950 hover:bg-orange-200">Start a project <ArrowRight size={16} /></Link><Link to="/creatives" className="inline-flex min-h-11 items-center border-b border-white/20 text-sm text-zinc-300 hover:text-white">Explore creatives</Link></div>
      </div>
    </footer>}
    </div>
  </article>;
}

function SectionHeading({ number, eyebrow, title, detail }) {
  return <div className="grid gap-3 border-l border-orange-300/70 pl-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><div><p className="text-[11px] uppercase tracking-[0.18em] text-orange-300">{number} / {eyebrow}</p><h2 className="mt-2 text-[clamp(1.7rem,3vw,2.65rem)] font-medium leading-none tracking-[-0.03em] text-white">{title}</h2></div>{detail && <p className="text-[11px] uppercase tracking-[0.13em] text-zinc-600">{detail}</p>}</div>;
}
function ProfileRails() {
  return <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 hidden xl:block">
    <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-orange-200/40 via-orange-300/10 to-orange-200/40 shadow-[0_0_5px_rgba(251,146,60,0.3)]" />
    <span className="absolute inset-y-0 left-0 w-px bg-gradient-to-b from-orange-200/45 via-orange-300/10 to-orange-200/35 shadow-[0_0_5px_rgba(251,146,60,0.4)]" />
    <span className="absolute inset-y-0 right-0 w-px bg-gradient-to-b from-orange-200/45 via-orange-300/10 to-orange-200/35 shadow-[0_0_5px_rgba(251,146,60,0.4)]" />
    <span className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-orange-200/40 via-orange-300/10 to-orange-200/40 shadow-[0_0_5px_rgba(251,146,60,0.3)]" />
    <span className="absolute bottom-0 left-0 h-1 w-1 -translate-x-[1.5px] translate-y-[1.5px] rounded-full bg-orange-200/80 shadow-[0_0_6px_rgba(251,146,60,0.65)]" />
    <span className="absolute bottom-0 right-0 h-1 w-1 translate-x-[1.5px] translate-y-[1.5px] rounded-full bg-orange-200/80 shadow-[0_0_6px_rgba(251,146,60,0.65)]" />
  </div>;
}
function Fact({ label, value }) { return <div className="border-b border-white/[0.09] py-4"><dt className="text-[10px] uppercase tracking-[0.17em] text-zinc-600">{label}</dt><dd className="mt-1 text-zinc-300">{value}</dd></div>; }
function SocialLink({ item }) { const icons={facebook:Facebook,instagram:Instagram,linkedin:Linkedin,youtube:Youtube,twitter:Twitter,github:Github,dribbble:Dribbble,tiktok:Music2,email:Mail,website:Globe2}; const Icon=icons[item.platform]||Globe2; const external=!item.href.startsWith('mailto:'); return <a href={item.href} target={external?'_blank':undefined} rel={external?'noopener noreferrer':undefined} aria-label={`${item.label}${external?' (opens in a new tab)':''}`} title={item.label} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/10 bg-zinc-900/90 text-zinc-200 transition hover:-translate-y-1 hover:border-orange-200/50 hover:text-orange-200 hover:shadow-[0_0_18px_rgba(251,146,60,0.4)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 motion-reduce:transform-none"><Icon size={18}/></a>; }
function ProfileProject({project,layout,linkState}) { const image=getPublicImageUrl(project.cover_image); const roles=[...(project.credit_roles||[]),project.contribution_role,project.role].filter(Boolean); const span={feature:'sm:col-span-2 lg:col-span-12',half:'lg:col-span-6','offset-large':'lg:col-span-7','offset-small':'lg:col-span-5',cinematic:'sm:col-span-2 lg:col-span-12'}[layout]||'lg:col-span-6'; const ratio=['feature','cinematic'].includes(layout)?'aspect-[16/9]':'aspect-[4/3]'; return <article id={`creative-project-${project.id}`} className={`group min-w-0 scroll-mt-24 ${span}`}><Link to={`/projects/${project.slug}`} state={linkState} className="relative block overflow-hidden bg-zinc-900 transition duration-500 after:pointer-events-none after:absolute after:inset-0 after:border after:border-transparent after:transition after:duration-500 hover:shadow-[0_16px_55px_-28px_rgba(251,146,60,0.5)] hover:after:border-orange-300/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 motion-reduce:transition-none">{image?<img src={image} alt={project.title} loading="lazy" decoding="async" width="1400" height="875" sizes={['feature','cinematic'].includes(layout)?'(max-width: 767px) calc(100vw - 24px), 70vw':'(max-width: 639px) calc(100vw - 24px), 44vw'} className={`${ratio} w-full object-cover transition duration-500 motion-reduce:transition-none group-hover:scale-[1.015]`}/>:<div className={`grid ${ratio} place-items-center text-sm text-zinc-600`}>Project image unavailable</div>}</Link><div className="relative grid border-b border-white/[0.09] pb-5 pt-3.5 after:absolute after:bottom-[-1px] after:left-0 after:h-px after:w-0 after:bg-orange-300 after:shadow-[0_0_12px_rgba(253,186,116,0.8)] after:transition-all after:duration-500 group-hover:after:w-24 motion-reduce:after:transition-none sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"><div><p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.17em] text-orange-300"><span className="h-1.5 w-1.5 rounded-full bg-orange-300 shadow-[0_0_8px_rgba(253,186,116,0.9)]" aria-hidden="true" />{project.category}</p><h3 className="mt-2 [overflow-wrap:anywhere] text-lg font-medium text-white">{project.title}</h3>{roles.length>0&&<p className="mt-1.5 text-xs text-zinc-500">{[...new Set(roles)].join(' · ')}</p>}</div><Link to={`/projects/${project.slug}`} state={linkState} className="mt-2 inline-flex min-h-10 items-center gap-2 self-end text-sm text-zinc-300 transition group-hover:text-orange-200 sm:mt-0">View project <ExternalLink size={14}/></Link></div></article>; }
