import { useEffect, useState } from 'react';
import CreativePostCard from '../../components/CreativePostCard';
import AdminLayout from '../../components/admin/AdminLayout';
import { AdminButton, AdminEmptyState, AdminNotice, AdminPageHeader } from '../../components/admin/AdminUI';
import LoadingState from '../../components/LoadingState';
import { loadPostsForModeration, moderateCreativePost } from '../../lib/creativePosts';

const actions = [['flag', 'Flag'], ['request_changes', 'Request changes'], ['hide', 'Hide'], ['restore', 'Restore'], ['remove', 'Remove']];

export default function AdminPostModeration() {
  const [posts, setPosts] = useState([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  async function load() { setLoading(true); setError(''); try { setPosts(await loadPostsForModeration()); } catch (reason) { setError(reason.message); } finally { setLoading(false); } }
  useEffect(() => { load(); }, []);
  async function act(post, action) { const reason = window.prompt(`Reason for “${action.replace('_', ' ')}” (at least 8 characters):`, post.moderation_reason || ''); if (reason === null) return; if (reason.trim().length < 8) { setError('Enter a clear moderation reason of at least 8 characters.'); return; } setBusy(post.id); try { await moderateCreativePost(post.id, action, reason.trim()); await load(); } catch (cause) { setError(cause.message); } finally { setBusy(''); } }
  return <AdminLayout><AdminPageHeader eyebrow="Platform safety" title="Post moderation" description="Review Creative posts and take transparent, reasoned moderation actions. Super Admin cannot edit or publish as a Creative." />{error && <AdminNotice className="mb-5">{error}</AdminNotice>}{loading ? <LoadingState label="Loading Creative posts" /> : posts.length ? <div className="grid gap-7">{posts.map((post) => <section key={post.id} className="grid gap-3"><CreativePostCard post={post} creative={post.creative_members} /><div className="flex flex-wrap gap-2">{actions.map(([action, label]) => <AdminButton key={action} onClick={() => act(post, action)} disabled={busy === post.id} variant={action === 'remove' ? 'danger' : action === 'restore' ? 'primary' : 'secondary'}>{label}</AdminButton>)}</div></section>)}</div> : <AdminEmptyState title="No Creative posts" message="Posts will appear here when Creatives start drafting and publishing." />}</AdminLayout>;
}
