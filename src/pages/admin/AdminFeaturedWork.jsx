import { Check, Image as ImageIcon, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import LoadingState from '../../components/LoadingState';
import {
  clearFeaturedWorkSlot,
  FEATURED_WORK_SLOT_COUNT,
  loadFeaturedEligiblePosts,
  loadFeaturedWorkRequests,
  reviewFeaturedWorkRequest,
  setFeaturedWorkSlot,
} from '../../lib/featuredWork';

const slots = Array.from({ length: FEATURED_WORK_SLOT_COUNT }, (_, index) => index + 1);

function mediaLabel(media, index) {
  return `Image ${index + 1}${media.caption ? ` — ${media.caption}` : ''}`;
}

export default function AdminFeaturedWork() {
  const [requests, setRequests] = useState([]);
  const [posts, setPosts] = useState([]);
  const [postId, setPostId] = useState('');
  const [mediaId, setMediaId] = useState('');
  const [slot, setSlot] = useState(1);
  const [requestSlots, setRequestSlots] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    const [requestData, postData] = await Promise.all([loadFeaturedWorkRequests(), loadFeaturedEligiblePosts()]);
    setRequests(requestData);
    setPosts(postData);
    setPostId((current) => current || postData[0]?.id || '');
    setLoading(false);
  }

  useEffect(() => { refresh().catch((error) => { setMessage(error.message || 'Featured work could not be loaded.'); setLoading(false); }); }, []);

  const selectedPost = posts.find((post) => post.id === postId);
  useEffect(() => { setMediaId(selectedPost?.creative_post_media?.[0]?.id || ''); }, [postId, selectedPost]);
  const approved = useMemo(() => requests.filter((request) => request.status === 'approved'), [requests]);
  const pending = useMemo(() => requests.filter((request) => request.status === 'pending'), [requests]);
  const firstOpenSlot = slots.find((position) => !approved.some((item) => item.slot_position === position)) || 1;

  async function perform(key, operation, success) {
    setBusy(key); setMessage('');
    try { await operation(); await refresh(); setMessage(success); }
    catch (error) { setMessage(error.message || 'The featured gallery could not be updated.'); }
    finally { setBusy(''); }
  }

  async function approve(request, position) {
    return perform(`approve-${request.id}`, () => reviewFeaturedWorkRequest(request.id, 'approve', Number(position)), 'Request approved.');
  }

  return <AdminLayout>
    <header className="ll-operations-intro">
      <p className="ll-kicker">Curated placement</p>
      <h2>Featured work</h2>
      <p>Choose up to six published images. Creatives may request consideration, while the final selection and order remain with the Super Admin.</p>
    </header>

    {message && <p className="ll-featured-admin__message" role="status">{message}</p>}
    {loading ? <LoadingState label="Loading featured work" /> : <>
      <section className="ll-featured-admin__slots" aria-label="Featured gallery slots">
        {slots.map((position) => {
          const item = approved.find((request) => request.slot_position === position);
          return <article key={position} className="ll-featured-admin__slot">
            <span className="ll-featured-admin__slot-number">{String(position).padStart(2, '0')}</span>
            {item ? <>
              <img src={item.media.thumbnail_url || item.media.display_url || item.media.expanded_url} alt="" />
              <div><strong>{item.post.title || 'Untitled work'}</strong><small>{item.post.creative_members?.name}</small></div>
              <button type="button" aria-label={`Clear featured slot ${position}`} disabled={busy === `clear-${position}`} onClick={() => perform(`clear-${position}`, () => clearFeaturedWorkSlot(position), 'Slot cleared.')}><Trash2 size={16}/></button>
            </> : <div className="ll-featured-admin__empty"><ImageIcon size={18}/><span>Open slot</span></div>}
          </article>;
        })}
      </section>

      <section className="ll-featured-admin__panel">
        <header><h3>Add published work directly</h3><p>Select an existing image; no duplicate upload is created.</p></header>
        <div className="ll-featured-admin__form">
          <label>Work<select value={postId} onChange={(event) => setPostId(event.target.value)}>{posts.map((post) => <option key={post.id} value={post.id}>{post.title || 'Untitled'} — {post.creative_members?.name}</option>)}</select></label>
          <label>Image<select value={mediaId} onChange={(event) => setMediaId(event.target.value)}>{selectedPost?.creative_post_media?.map((media, index) => <option key={media.id} value={media.id}>{mediaLabel(media, index)}</option>)}</select></label>
          <label>Slot<select value={slot} onChange={(event) => setSlot(Number(event.target.value))}>{slots.map((position) => <option key={position} value={position}>Slot {position}</option>)}</select></label>
          <button type="button" disabled={!postId || !mediaId || busy === 'place'} onClick={() => perform('place', () => setFeaturedWorkSlot(postId, mediaId, slot), 'Featured slot updated.')}><Check size={16}/> Place work</button>
        </div>
      </section>

      <section className="ll-featured-admin__panel">
        <header><h3>Creative requests</h3><p>Approve a request into a slot or decline it.</p></header>
        {pending.length ? <div className="ll-featured-admin__requests">{pending.map((request) => <article key={request.id}>
          <img src={request.media.thumbnail_url || request.media.display_url || request.media.expanded_url} alt="" />
          <div><strong>{request.post.title || 'Untitled work'}</strong><small>{request.post.creative_members?.name}</small></div>
          <label><span className="sr-only">Featured slot</span><select value={requestSlots[request.id] || firstOpenSlot} onChange={(event) => setRequestSlots((current) => ({ ...current, [request.id]: Number(event.target.value) }))}>{slots.map((position) => <option key={position} value={position}>Slot {position}</option>)}</select></label>
          <button type="button" disabled={busy === `approve-${request.id}`} onClick={() => approve(request, requestSlots[request.id] || firstOpenSlot)}><Check size={16}/> Approve</button>
          <button type="button" className="is-danger" disabled={busy === `reject-${request.id}`} onClick={() => perform(`reject-${request.id}`, () => reviewFeaturedWorkRequest(request.id, 'reject'), 'Request declined.')}><X size={16}/> Decline</button>
        </article>)}</div> : <p className="ll-featured-admin__none">No pending requests.</p>}
      </section>
    </>}
  </AdminLayout>;
}
