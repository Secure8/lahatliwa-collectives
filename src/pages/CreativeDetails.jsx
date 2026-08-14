import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import CreativeProfileView from '../components/CreativeProfileView';
import LoadingState from '../components/LoadingState';
import { supabase } from '../lib/supabaseClient';
import { detailBackAction } from '../lib/navigationHistory';
import { applyPublicMetadata } from '../lib/publicMetadata';
import { getPublicImageUrl } from '../lib/storage';
import { useAuthSession } from '../lib/authSession';
import { archiveCreativePost, deleteCreativePost, loadOwnCreativePosts, loadPublicCreativePosts, restoreCreativePost } from '../lib/creativePosts';
import { useAdminConfirmation } from '../components/admin/AdminDialog';

export default function CreativeDetails() {
  const { session } = useAuthSession();
  const location = useLocation(); const navigate = useNavigate();
  const { slug } = useParams();
  const [creative, setCreative] = useState(null);
  const [projects, setProjects] = useState([]);
  const [posts, setPosts] = useState([]);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { requestConfirmation, confirmationDialog } = useAdminConfirmation();

  useEffect(() => {
    let active = true;
    async function loadCreative() {
      setLoading(true);
      setError('');
      setCreative(null);
      setProjects([]);
      setPosts([]);
      const { data, error: creativeError } = await supabase.from('creative_members').select('id, name, slug, role, short_bio, full_bio, profile_image_url, cover_image, skills, social_links, availability_status').eq('slug', slug).eq('is_published', true).single();
      if (!active) return;
      if (creativeError) {
        setError('Creative profile not found or not published yet.');
        setLoading(false);
        return;
      }
      setCreative(data);
      let ownsProfile = false;
      if (session?.user?.id) {
        const { data: account } = await supabase.from('admin_users').select('role,creative_member_id,status').eq('user_id', session.user.id).maybeSingle();
        ownsProfile = account?.role === 'creative' && account?.status === 'active' && account?.creative_member_id === data.id;
      }
      if (!active) return;
      setIsOwner(ownsProfile);
      const [{ data: links }, loadedPosts] = await Promise.all([
        supabase.from('project_creatives').select('credit_roles, contribution_role, role, projects(id, title, slug, category, cover_image, status)').eq('creative_id', data.id).order('is_primary', { ascending: false }).order('display_order', { ascending: true, nullsFirst: false }),
        ownsProfile ? loadOwnCreativePosts() : loadPublicCreativePosts(data.id),
      ]);
      if (!active) return;
      setProjects((links || []).map((link) => link.projects ? ({ ...link.projects, credit_roles: link.credit_roles, contribution_role: link.contribution_role, role: link.role }) : null).filter((project) => project?.status === 'published'));
      setPosts(loadedPosts);
      setLoading(false);
    }
    loadCreative();
    return () => { active = false; };
  }, [slug, session?.user?.id]);

  async function changePost(post, action) {
    try {
      if (action === 'archive') await archiveCreativePost(post.id);
      if (action === 'restore') await restoreCreativePost(post.id);
      if (action === 'delete') await deleteCreativePost(post.id);
      setPosts(await loadOwnCreativePosts());
    } catch (reason) { setError(reason.message); }
  }
  function confirmPostChange(post, action) {
    requestConfirmation({
      title: action === 'delete' ? 'Permanently delete this post?' : `${action === 'archive' ? 'Archive' : 'Restore'} this post?`,
      description: action === 'delete' ? 'Its R2 images will be queued for safe cleanup. This cannot be undone.' : action === 'archive' ? 'It will disappear from your public feed but remain recoverable.' : 'It will return as a private draft for editing.',
      confirmLabel: action === 'delete' ? 'Delete permanently' : action === 'archive' ? 'Archive post' : 'Restore draft',
      destructive: action !== 'restore',
      onConfirm: () => changePost(post, action),
    });
  }

  useEffect(() => {
    if (!creative) return;
    applyPublicMetadata({
      title: `${creative.name} | Lahat Liwa Collectives`,
      description: String(creative.short_bio || creative.full_bio || 'View a published creative profile from Lahat Liwa Collectives.').slice(0, 160),
      pathname: `/creatives/${creative.slug}`,
      type: 'profile',
      image: getPublicImageUrl(creative.cover_image || creative.profile_image_url),
    });
  }, [creative]);

  if (loading) return <div className="page-shell py-20"><LoadingState label="Loading creative" /></div>;
  if (error || !creative) return <div className="page-shell py-20"><p className="major-border-y py-8 text-zinc-300">{error || 'Creative profile not found.'}</p></div>;

  const goBack = () => { const action = detailBackAction(location.state, window.history.state?.idx, '/creatives'); if (action.delta) navigate(action.delta); else navigate(action.to); };
  return <article className="ll-profile-route">
    <button type="button" onClick={goBack} className="ll-back-action"><ArrowLeft size={16} /> Back to Creatives</button>
    <CreativeProfileView creative={creative} projects={projects} posts={posts} isOwner={isOwner} onArchivePost={(post) => confirmPostChange(post, 'archive')} onRestorePost={(post) => confirmPostChange(post, 'restore')} onDeletePost={(post) => confirmPostChange(post, 'delete')} />
    {confirmationDialog}
  </article>;
}
