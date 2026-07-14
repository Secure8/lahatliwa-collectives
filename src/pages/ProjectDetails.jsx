import { ArrowUpRight, Calendar, ExternalLink, FileText, Github, Play, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import LoadingState from '../components/LoadingState';
import { actionLabelForItem, getGalleryItemMediaUrl, getGalleryItemThumbnailUrl, getYouTubeVideoId, normalizeProjectGallery } from '../lib/galleryItems';
import { formatDate } from '../lib/helpers';
import { normalizeCreditRoleList } from '../lib/projectCredits';
import { usePublicContent } from '../lib/contentApi';
import { detailBackAction } from '../lib/navigationHistory';
import { supabase } from '../lib/supabaseClient';
import { getPublicImageUrl } from '../lib/storage';
import { safeExternalUrl } from '../lib/externalUrls';
import { applyPublicMetadata } from '../lib/publicMetadata';
import { getSingleProjectExternalLink, projectExternalLinkLabel, projectExternalLinkText } from '../lib/projectExternalLinks';
import BrandWordmark from '../components/BrandWordmark';

function isMissingCreditRolesColumn(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`;
  return /credit_roles/i.test(message) && /(column|schema cache|does not exist)/i.test(message);
}

export default function ProjectDetails() {
  const location = useLocation();
  const navigate = useNavigate();
  const { slug } = useParams();
  const [project, setProject] = useState(null);
  const [contributors, setContributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { content } = usePublicContent([]);

  useEffect(() => {
    let active = true;
    async function loadProject() {
      setLoading(true);
      setError('');
      setProject(null);
      setContributors([]);
      const { data, error: projectError } = await supabase.from('projects').select('id, title, slug, category, description, cover_image, gallery_images, gallery_items, featured, project_date, tools, video_url, social_post_url, live_url, github_url').eq('slug', slug).eq('status', 'published').single();
      if (!active) return;
      if (projectError) setError('Project not found or not published yet.');
      else {
        setProject(data);
        let { data: contributorRows, error: contributorError } = await supabase
          .from('project_creatives')
          .select('role, contribution_role, credit_roles, is_primary, display_order, creative_members!project_creatives_creative_member_id_fkey(id, name, slug, role, profile_image_url)')
          .eq('project_id', data.id)
          .order('is_primary', { ascending: false })
          .order('display_order', { ascending: true, nullsFirst: false });
        if (isMissingCreditRolesColumn(contributorError)) {
          ({ data: contributorRows } = await supabase
            .from('project_creatives')
            .select('role, contribution_role, is_primary, display_order, creative_members!project_creatives_creative_member_id_fkey(id, name, slug, role, profile_image_url)')
            .eq('project_id', data.id)
            .order('is_primary', { ascending: false })
            .order('display_order', { ascending: true, nullsFirst: false }));
        }
        if (!active) return;
        setContributors((contributorRows || []).map((row) => row.creative_members ? {
          ...row.creative_members,
          creditRoles: normalizeCreditRoleList(row.credit_roles?.length
            ? row.credit_roles
            : [row.role || row.contribution_role || row.creative_members.role].filter(Boolean)),
          isPrimary: row.is_primary === true,
        } : null).filter(Boolean));
      }
      setLoading(false);
    }
    loadProject();
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!project) return;
    applyPublicMetadata({
      title: `${project.title} | Lahat Liwa Collectives`,
      description: String(project.description || 'View a published project from Lahat Liwa Collectives.').slice(0, 160),
      pathname: `/projects/${project.slug}`,
      type: 'article',
      image: getPublicImageUrl(project.cover_image),
    });
  }, [project]);

  if (loading) return <div className="page-shell py-20"><LoadingState label="Loading project" /></div>;
  if (error) return <div className="page-shell py-20"><p className="major-border-y py-8 text-zinc-300">{error}</p></div>;

  const cover = getPublicImageUrl(project.cover_image);
  const gallery = normalizeProjectGallery(project);
  const coverExternalLink = getSingleProjectExternalLink(project);
  const primaryContributor = contributors.find((creative) => creative.isPrimary) || contributors[0];
  const goBack = () => { const action = detailBackAction(location.state, window.history.state?.idx, '/projects'); if (action.delta) navigate(action.delta); else navigate(action.to); };

  return (
    <article className="page-shell py-20">
      <button type="button" onClick={goBack} className="fine-link site-hover-accent text-sm text-zinc-400">Back</button>
      <div className={`mt-10 grid gap-10 ${cover ? 'lg:grid-cols-[minmax(0,1.12fr)_minmax(20rem,0.88fr)] lg:items-center' : 'lg:grid-cols-1'}`}>
        {cover && (
          <ProjectCover cover={cover} title={project.title} externalLink={coverExternalLink} />
        )}
        <div className="min-w-0 lg:py-4">
          <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.18em] text-zinc-500">
            <span>{project.category}</span>
            {project.featured && <span className="text-[var(--site-accent-text)]">Selected</span>}
          </div>
          <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: 'var(--site-primary-text)' }}>{project.title}</h1>
          <p className="mt-5 text-lg leading-8" style={{ color: 'var(--site-secondary-text)' }}>{project.description}</p>
          <div className="mt-6 grid gap-2 text-sm" style={{ color: 'var(--site-muted-text)' }}>
            {primaryContributor && (
              <p>Work by <Link to={`/creatives/${primaryContributor.slug}`} className="site-hover-accent text-zinc-200">{primaryContributor.name}</Link></p>
            )}
            <p>Published under <BrandWordmark name={content.displayName} variant="inline" /></p>
          </div>
          <p className="mt-5 inline-flex items-center gap-2 text-sm" style={{ color: 'var(--site-muted-text)' }}><Calendar size={16} /> {formatDate(project.project_date)}</p>
          {project.tools?.length > 0 && (
            <div className="major-border-y mt-7 flex flex-wrap gap-x-4 gap-y-2 py-5">
              {project.tools.map((tool) => <span key={tool} className="text-sm" style={{ color: 'var(--site-secondary-text)' }}>{tool}</span>)}
            </div>
          )}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <Action href={project.video_url} icon={Play} label="Watch Video" />
            <Action href={project.social_post_url} icon={Share2} label="View Post" />
            <Action href={project.live_url} icon={ArrowUpRight} label="Live Project" />
            <Action href={project.github_url} icon={Github} label="GitHub" />
          </div>
        </div>
      </div>

      {contributors.length > 0 && (
        <section className="major-border-top mt-12 pt-8">
          <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-orange-300"><span className="h-1.5 w-1.5 rounded-full bg-orange-300 shadow-[0_0_9px_rgba(253,186,116,0.9)]" />Creative credits</p>
          <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {contributors.map((creative) => (
              <Link key={creative.id} to={`/creatives/${creative.slug}`} className="group flex min-w-0 items-start gap-3 border-b border-white/[0.09] px-1 py-3 text-sm text-zinc-200 transition hover:border-orange-300/50">
                {creative.profile_image_url && <img src={creative.profile_image_url} alt="" loading="lazy" decoding="async" width="40" height="40" className="h-10 w-10 shrink-0 rounded-full object-cover" />}
                <span className="min-w-0">
                  <span className="block font-medium group-hover:text-[var(--site-accent)]">{creative.name}</span>
                  <span className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-medium uppercase leading-5 tracking-[0.12em] text-orange-200">
                    {creative.creditRoles.map((creditRole, index) => (
                      <span key={creditRole}>{creditRole}{index < creative.creditRoles.length - 1 ? ',' : ''}</span>
                    ))}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {gallery.length > 0 && (
        <section className="major-border-top mt-16 pt-10">
          <h2 className="text-2xl font-medium" style={{ color: 'var(--site-primary-text)' }}>Gallery</h2>
          <div className="mt-6 columns-1 gap-5 sm:columns-2 lg:columns-3">
            {gallery.map((item) => (
              <GalleryItem key={item.id} item={item} projectTitle={project.title} />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function ProjectCover({ cover, title, externalLink }) {
  const frameClass = 'overflow-hidden rounded-[10px] border border-white/10 bg-zinc-900 shadow-[0_18px_58px_-32px_rgba(251,146,60,0.35)]';
  const image = <img className={`aspect-[4/3] w-full object-cover ${externalLink ? 'transition duration-500 group-hover:scale-[1.015] group-hover:opacity-95 motion-reduce:transition-none' : ''}`} src={cover} alt={title} decoding="async" fetchpriority="high" width="1200" height="900" />;

  if (!externalLink) return <div className={frameClass}>{image}</div>;

  return (
    <a href={externalLink.url} target="_blank" rel="noopener noreferrer" aria-label={projectExternalLinkLabel(externalLink)} className={`${frameClass} group relative block cursor-pointer transition hover:border-orange-300/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950`}>
      {image}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-end bg-gradient-to-t from-black/75 via-black/20 to-transparent px-4 pb-4 pt-12 text-xs font-medium text-white opacity-90 sm:px-5 sm:pb-5">
        <span className="theme-inverse inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-3 py-2 backdrop-blur-sm">{projectExternalLinkText(externalLink)} <ExternalLink size={14} aria-hidden="true" /></span>
      </span>
    </a>
  );
}

function GalleryItem({ item, projectTitle }) {
  const mediaUrl = getGalleryItemMediaUrl(item);
  const thumbnailUrl = getGalleryItemThumbnailUrl(item);
  const youtubeId = item.type === 'youtube' ? getYouTubeVideoId(item.url) : '';
  const externalUrl = safeExternalUrl(item.url);

  if (item.type === 'image') {
    return <img className="mb-5 h-auto w-full break-inside-avoid rounded-[10px] bg-zinc-900" src={mediaUrl} alt={item.title || `${projectTitle} gallery`} loading="lazy" decoding="async" />;
  }

  if (item.type === 'pdf') {
    if (!safeExternalUrl(mediaUrl)) return null;
    return (
      <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="mb-5 flex min-h-40 break-inside-avoid items-center justify-center gap-3 rounded-[10px] border border-white/10 bg-zinc-900/70 text-zinc-200 transition hover:border-[var(--site-accent)] hover:text-[var(--site-accent)]">
        <FileText size={22} /> Open PDF
      </a>
    );
  }

  if (youtubeId) {
    return <YouTubeGalleryItem item={item} youtubeId={youtubeId} thumbnailUrl={thumbnailUrl} />;
  }

  if (!externalUrl) return null;

  return (
    <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="mb-5 block break-inside-avoid overflow-hidden rounded-[10px] border border-white/10 bg-zinc-900/70 text-zinc-200 transition hover:border-[var(--site-accent)] hover:shadow-[0_14px_45px_-28px_rgba(251,146,60,0.45)]">
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt={item.title || item.platform} loading="lazy" decoding="async" width="800" height="600" className="aspect-[4/3] w-full object-cover" />
      ) : (
        <div className="grid min-h-44 place-items-center bg-zinc-950 px-6 text-center">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{item.platform}</p>
            <p className="mt-3 text-lg font-medium text-zinc-100">{item.title || 'External gallery link'}</p>
          </div>
        </div>
      )}
      <ExternalGalleryCardContent item={item} />
    </a>
  );
}

function YouTubeGalleryItem({ item, youtubeId, thumbnailUrl }) {
  const [playerOpen, setPlayerOpen] = useState(false);
  const previewUrl = thumbnailUrl || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  const youtubeUrl = safeExternalUrl(item.url);

  return (
    <div className="mb-5 break-inside-avoid overflow-hidden rounded-[10px] border border-white/10 bg-zinc-900/70">
      {playerOpen ? (
        <iframe
          className="aspect-video w-full"
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
          title={item.title || 'YouTube video'}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <button type="button" onClick={() => setPlayerOpen(true)} className="group relative block aspect-video w-full overflow-hidden bg-zinc-950" aria-label={`Play ${item.title || 'YouTube video'}`}>
          <img src={previewUrl} alt="" loading="lazy" decoding="async" width="800" height="450" className="h-full w-full object-cover opacity-80 transition duration-300 group-hover:opacity-95" />
          <span className="theme-inverse absolute inset-0 grid place-items-center bg-black/15">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-zinc-950/85 text-white ring-1 ring-white/20 transition group-hover:scale-105 group-hover:text-[var(--site-accent)]">
              <Play size={20} fill="currentColor" />
            </span>
          </span>
        </button>
      )}
      <ExternalGalleryCardContent item={item} compact />
      <div className="px-4 pb-4">
        {youtubeUrl && <a href={youtubeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-[var(--site-accent)]">
          Open on YouTube <ExternalLink size={15} />
        </a>}
      </div>
    </div>
  );
}

function ExternalGalleryCardContent({ item, compact = false }) {
  return (
    <div className={compact ? 'p-4' : 'p-5'}>
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{item.platform}</p>
      {item.title && <h3 className="mt-2 text-lg font-medium text-zinc-100">{item.title}</h3>}
      {item.description && <p className="mt-2 text-sm leading-6 text-zinc-400">{item.description}</p>}
      <span className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--site-accent)]">
        {actionLabelForItem(item)} <ExternalLink size={15} />
      </span>
    </div>
  );
}

function Action({ href, icon: Icon, label }) {
  const safeHref = safeExternalUrl(href);
  if (!safeHref) return null;
  return (
    <a href={safeHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center justify-center gap-2 border border-[var(--site-accent-border)] px-3 py-3 text-center text-sm text-[var(--site-accent-text)] transition hover:bg-[var(--site-accent-surface)] sm:px-4">
      <Icon size={17} /> {label}
    </a>
  );
}
