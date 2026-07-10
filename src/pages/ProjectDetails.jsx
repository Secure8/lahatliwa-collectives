import { ArrowUpRight, Calendar, ExternalLink, FileText, Github, Play, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import LoadingState from '../components/LoadingState';
import { actionLabelForItem, getGalleryItemMediaUrl, getGalleryItemThumbnailUrl, getYouTubeVideoId, normalizeProjectGallery } from '../lib/galleryItems';
import { formatDate } from '../lib/helpers';
import { normalizeCreditRoleList } from '../lib/projectCredits';
import { usePublicContent } from '../lib/contentApi';
import { supabase } from '../lib/supabaseClient';
import { getPublicImageUrl } from '../lib/storage';

function isMissingCreditRolesColumn(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`;
  return /credit_roles/i.test(message) && /(column|schema cache|does not exist)/i.test(message);
}

export default function ProjectDetails() {
  const { slug } = useParams();
  const [project, setProject] = useState(null);
  const [contributors, setContributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { content } = usePublicContent([]);

  useEffect(() => {
    async function loadProject() {
      const { data, error: projectError } = await supabase.from('projects').select('*').eq('slug', slug).eq('status', 'published').single();
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
  }, [slug]);

  if (loading) return <div className="page-shell py-20"><LoadingState label="Loading project" /></div>;
  if (error) return <div className="page-shell py-20"><p className="major-border-y py-8 text-zinc-300">{error}</p></div>;

  const cover = getPublicImageUrl(project.cover_image);
  const gallery = normalizeProjectGallery(project);
  const primaryContributor = contributors.find((creative) => creative.isPrimary) || contributors[0];

  return (
    <article className="page-shell py-20">
      <Link to="/projects" className="fine-link site-hover-accent text-sm text-zinc-400">Back to projects</Link>
      <div className={`mt-10 grid gap-10 ${cover ? 'lg:grid-cols-[0.92fr_1.08fr]' : 'lg:grid-cols-1'}`}>
        {cover && (
          <div className="overflow-hidden rounded-[1.5rem] bg-zinc-900">
            <img className="aspect-[4/3] h-full w-full object-cover" src={cover} alt={project.title} decoding="async" fetchpriority="high" width="1200" height="900" />
          </div>
        )}
        <div>
          <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.18em] text-zinc-500">
            <span>{project.category}</span>
            {project.featured && <span style={{ color: content.accentColor }}>Selected</span>}
          </div>
          <h1 className="mt-5 text-4xl font-semibold leading-tight sm:text-5xl" style={{ color: content.primaryTextColor }}>{project.title}</h1>
          <p className="mt-5 text-lg leading-8" style={{ color: content.secondaryTextColor }}>{project.description}</p>
          <div className="mt-6 grid gap-2 text-sm" style={{ color: content.mutedTextColor }}>
            {primaryContributor && (
              <p>Work by <Link to={`/creatives/${primaryContributor.slug}`} className="site-hover-accent text-zinc-200">{primaryContributor.name}</Link></p>
            )}
            <p>Published under <span className="text-zinc-200">Lahat Liwa Collectives</span></p>
          </div>
          <p className="mt-5 inline-flex items-center gap-2 text-sm" style={{ color: content.mutedTextColor }}><Calendar size={16} /> {formatDate(project.project_date)}</p>
          {project.tools?.length > 0 && (
            <div className="major-border-y mt-7 flex flex-wrap gap-x-4 gap-y-2 py-5">
              {project.tools.map((tool) => <span key={tool} className="text-sm" style={{ color: content.secondaryTextColor }}>{tool}</span>)}
            </div>
          )}
          <div className="mt-8 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            <Action href={project.video_url} icon={Play} label="Watch Video" accentColor={content.accentColor} />
            <Action href={project.social_post_url} icon={Share2} label="View Post" accentColor={content.accentColor} />
            <Action href={project.live_url} icon={ArrowUpRight} label="Live Project" accentColor={content.accentColor} />
            <Action href={project.github_url} icon={Github} label="GitHub" accentColor={content.accentColor} />
          </div>
          {contributors.length > 0 && (
            <div className="major-border-top mt-8 pt-6">
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Creative Credits</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {contributors.map((creative) => (
                  <Link key={creative.id} to={`/creatives/${creative.slug}`} className="group flex min-w-0 items-start gap-3 rounded-md border border-white/10 px-3 py-3 text-sm text-zinc-200 transition hover:border-[var(--site-accent)]">
                    {creative.profile_image_url && <img src={creative.profile_image_url} alt="" loading="lazy" decoding="async" width="40" height="40" className="h-10 w-10 shrink-0 rounded-full object-cover" />}
                    <span className="min-w-0">
                      <span className="block font-medium group-hover:text-[var(--site-accent)]">{creative.name}</span>
                      <span className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-xs leading-5 text-zinc-500">
                        {creative.creditRoles.map((creditRole, index) => (
                          <span key={creditRole}>{creditRole}{index < creative.creditRoles.length - 1 ? ',' : ''}</span>
                        ))}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {gallery.length > 0 && (
        <section className="major-border-top mt-16 pt-10">
          <h2 className="text-2xl font-medium" style={{ color: content.primaryTextColor }}>Gallery</h2>
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

function GalleryItem({ item, projectTitle }) {
  const mediaUrl = getGalleryItemMediaUrl(item);
  const thumbnailUrl = getGalleryItemThumbnailUrl(item);
  const youtubeId = item.type === 'youtube' ? getYouTubeVideoId(item.url) : '';

  if (item.type === 'image') {
    return <img className="mb-5 h-auto w-full break-inside-avoid rounded-lg bg-zinc-900" src={mediaUrl} alt={item.title || `${projectTitle} gallery`} loading="lazy" decoding="async" />;
  }

  if (item.type === 'pdf') {
    return (
      <a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="mb-5 flex min-h-40 break-inside-avoid items-center justify-center gap-3 rounded-lg border border-white/10 bg-zinc-900/70 text-zinc-200 transition hover:border-[var(--site-accent)] hover:text-[var(--site-accent)]">
        <FileText size={22} /> Open PDF
      </a>
    );
  }

  if (youtubeId) {
    return <YouTubeGalleryItem item={item} youtubeId={youtubeId} thumbnailUrl={thumbnailUrl} />;
  }

  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className="mb-5 block break-inside-avoid overflow-hidden rounded-lg border border-white/10 bg-zinc-900/70 text-zinc-200 transition hover:border-[var(--site-accent)]">
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

  return (
    <div className="mb-5 break-inside-avoid overflow-hidden rounded-lg border border-white/10 bg-zinc-900/70">
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
          <span className="absolute inset-0 grid place-items-center bg-black/15">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-zinc-950/85 text-white ring-1 ring-white/20 transition group-hover:scale-105 group-hover:text-[var(--site-accent)]">
              <Play size={20} fill="currentColor" />
            </span>
          </span>
        </button>
      )}
      <ExternalGalleryCardContent item={item} compact />
      <div className="px-4 pb-4">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-[var(--site-accent)]">
          Open on YouTube <ExternalLink size={15} />
        </a>
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

function Action({ href, icon: Icon, label, accentColor }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center justify-center gap-2 border px-3 py-3 text-center text-sm text-zinc-200 transition hover:opacity-80 sm:px-4" style={{ borderColor: `${accentColor}55`, color: accentColor }}>
      <Icon size={17} /> {label}
    </a>
  );
}
