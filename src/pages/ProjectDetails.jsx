import { ArrowLeft, ArrowRight, ArrowUpRight, Calendar, ExternalLink, FileText, Github, Play, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import LoadingState from '../components/LoadingState';
import { actionLabelForItem, getGalleryItemMediaUrl, getGalleryItemThumbnailUrl, getYouTubeVideoId, normalizeProjectGallery } from '../lib/galleryItems';
import { formatDate } from '../lib/helpers';
import { normalizeCreditRoleList } from '../lib/projectCredits';
import { detailBackAction } from '../lib/navigationHistory';
import { supabase } from '../lib/supabaseClient';
import { getPublicImageUrl } from '../lib/storage';
import { publicImageVariant } from '../lib/publicImages';
import { safeExternalUrl } from '../lib/externalUrls';
import { applyPublicMetadata } from '../lib/publicMetadata';
import { getSingleProjectExternalLink, projectExternalLinkLabel, projectExternalLinkText } from '../lib/projectExternalLinks';
import { inquiryUrl } from '../lib/serviceRequest';
import { normalizeProjectUpdates, projectWorkStatus } from '../lib/projectProgress';

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

  useEffect(() => {
    let active = true;
    async function loadProject() {
      setLoading(true);
      setError('');
      setProject(null);
      setContributors([]);
      const { data, error: projectError } = await supabase.from('projects').select('id, title, slug, category, description, cover_image, gallery_images, gallery_items, featured, project_date, tools, video_url, social_post_url, live_url, github_url, work_status, progress_updates').eq('slug', slug).eq('status', 'published').single();
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
      description: String(project.description || 'View the complete output and contributor credits for this published project.').slice(0, 160),
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
  const workStatus = projectWorkStatus(project.work_status);
  const updates = normalizeProjectUpdates(project.progress_updates);
  const goBack = () => { const action = detailBackAction(location.state, window.history.state?.idx, workStatus === 'active' ? '/work' : '/projects'); if (action.delta) navigate(action.delta); else navigate(action.to); };

  return (
    <article className="page-shell ll-project-detail">
      <header className="ll-project-detail__header">
        <button type="button" onClick={goBack} aria-label="Back to projects"><ArrowLeft size={21}/></button>
        {primaryContributor ? <Link to={`/creatives/${primaryContributor.slug}`} className="ll-project-detail__author">
          {primaryContributor.profile_image_url && <img src={publicImageVariant(primaryContributor.profile_image_url, 'thumbnail')} alt=""/>}
          <span><strong>{primaryContributor.name}</strong><small>Published a formal project · {formatDate(project.project_date)}</small></span>
        </Link> : <div className="ll-project-detail__author"><span><strong>Published project</strong><small>{formatDate(project.project_date)}</small></span></div>}
      </header>
      {cover && <ProjectCover cover={cover} title={project.title} externalLink={coverExternalLink} />}
      <div className="ll-project-detail__body">
          <p className="ll-kicker">{workStatus === 'active' ? 'Work in progress' : project.featured ? 'Selected completed work' : 'Completed project'}</p>
          <h1>{project.title}</h1>
          <p className="ll-project-detail__description">{project.description}</p>
          <p className="ll-project-detail__date"><Calendar size={16} /> {formatDate(project.project_date)}</p>
          {project.tools?.length > 0 && (
            <div className="ll-project-detail__tools">
              {project.tools.map((tool) => <span key={tool}>{tool}</span>)}
            </div>
          )}
          <div className="ll-project-detail__actions">
            <Action href={project.video_url} icon={Play} label="Watch Video" />
            <Action href={project.social_post_url} icon={Share2} label="Open Post" />
            <Action href={project.live_url} icon={ArrowUpRight} label="Open Full Project" />
            <Action href={project.github_url} icon={Github} label="GitHub" />
            <Link to={inquiryUrl({ context: { type: 'project', id: project.id, slug: project.slug, title: project.title, sourceAction: 'project-detail-inquiry' } })} className="inline-flex min-h-11 items-center justify-center gap-2 bg-[var(--site-accent)] px-4 text-sm font-semibold text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Ask about this project <ArrowRight size={16} /></Link>
          </div>
      </div>

      {contributors.length > 0 && (
        <section className="major-border-top mt-12 pt-8">
          <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-orange-300"><span className="h-1.5 w-1.5 rounded-full bg-orange-300 shadow-[0_0_9px_rgba(253,186,116,0.9)]" />Credited contributors</p>
          <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {contributors.map((creative) => (
              <Link key={creative.id} to={`/creatives/${creative.slug}`} className="group flex min-w-0 items-start gap-3 border-b border-white/[0.09] px-1 py-3 text-sm text-zinc-200 transition hover:border-orange-300/50">
                {creative.profile_image_url && <img src={publicImageVariant(creative.profile_image_url, 'thumbnail')} alt="" loading="lazy" decoding="async" width="40" height="40" className="h-10 w-10 shrink-0 rounded-full object-cover" />}
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

      {updates.length > 0 && <section className="major-border-top mt-16 pt-10" aria-labelledby="project-progress-heading"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.18em] text-orange-300">Project journal</p><h2 id="project-progress-heading" className="mt-3 text-3xl font-semibold text-white">Progress and updates</h2></div><span className="text-sm text-zinc-500">{updates.length} public {updates.length === 1 ? 'update' : 'updates'}</span></div><ol className="mt-8 grid gap-4">{updates.map((update) => <li key={update.id} className="grid gap-3 border-l border-orange-300/35 bg-white/[0.018] px-5 py-5 sm:grid-cols-[9rem_1fr]"><div><p className="text-xs uppercase tracking-[0.15em] text-orange-200">{update.type.replace('_', ' ')}</p>{update.date && <p className="mt-2 text-sm text-zinc-500">{formatDate(update.date)}</p>}</div><div><h3 className="text-lg font-medium text-white">{update.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-zinc-400">{update.body}</p>{update.linkUrl && <a href={update.linkUrl} target="_blank" rel="noopener noreferrer" className="fine-link mt-3 inline-flex min-h-11 items-center gap-2 text-sm text-zinc-200">{update.linkLabel || 'View update'} <ExternalLink size={14} /></a>}</div></li>)}</ol></section>}

      {gallery.length > 0 && (
        <section className="major-border-top mt-16 pt-10">
          <h2 className="text-2xl font-medium" style={{ color: 'var(--site-primary-text)' }}>Full output and gallery</h2>
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
  const frameClass = 'll-project-detail__cover';
  const image = <img src={cover} alt={title} decoding="async" fetchpriority="high" width="1200" height="1200" />;

  if (!externalLink) return <div className={frameClass}>{image}</div>;

  return (
    <a href={externalLink.url} target="_blank" rel="noopener noreferrer" aria-label={projectExternalLinkLabel(externalLink)} className={`${frameClass} group`}>
      {image}
      <span className="ll-project-detail__cover-link">
        <span>{projectExternalLinkText(externalLink)} <ExternalLink size={14} aria-hidden="true" /></span>
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
    return <a href={publicImageVariant(mediaUrl, 'expanded')} target="_blank" rel="noopener noreferrer" className="mb-5 block break-inside-avoid"><img className="h-auto w-full rounded-[10px] bg-zinc-900" src={publicImageVariant(mediaUrl, 'display')} alt={item.title || `${projectTitle} gallery`} loading="lazy" decoding="async" /></a>;
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
    <a href={safeHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 min-w-0 items-center justify-center gap-2 border border-[var(--site-accent-border)] px-3 py-3 text-center text-sm text-[var(--site-accent-text)] transition hover:bg-[var(--site-accent-surface)] sm:px-4">
      <Icon size={17} /> {label}
    </a>
  );
}
