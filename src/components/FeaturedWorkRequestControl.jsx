import { useEffect, useState } from 'react';
import { loadFeaturedRequestForPost, requestFeaturedWork, withdrawFeaturedWorkRequest } from '../lib/featuredWork';

export default function FeaturedWorkRequestControl({ post, account }) {
  const ownsPost = account?.role === 'creative' && account.creative_member_id === post.creative_member_id;
  const [request, setRequest] = useState(null);
  const [mediaId, setMediaId] = useState(post.creative_post_media?.[0]?.id || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!ownsPost) return;
    loadFeaturedRequestForPost(post.id).then(setRequest).catch(() => setRequest(null));
  }, [ownsPost, post.id]);
  if (!ownsPost || !post.creative_post_media?.length) return null;

  async function submit() {
    setBusy(true); setMessage('');
    try { setRequest(await requestFeaturedWork(post.id, mediaId)); setMessage('Sent for Super Admin approval.'); }
    catch (error) { setMessage(error.message || 'The request could not be sent.'); }
    finally { setBusy(false); }
  }
  async function withdraw() {
    setBusy(true); setMessage('');
    try { await withdrawFeaturedWorkRequest(request.id); setRequest(null); setMessage('Request withdrawn.'); }
    catch (error) { setMessage(error.message || 'The request could not be withdrawn.'); }
    finally { setBusy(false); }
  }

  return <section className="ll-featured-request" aria-label="Featured gallery request">
    <div><p className="ll-kicker">Featured gallery</p><h3>{request?.status === 'approved' ? 'This work is featured' : request ? 'Approval pending' : 'Request a gallery slot'}</h3></div>
    {!request && <><label>Choose the image visitors will see
      <select value={mediaId} onChange={(event) => setMediaId(event.target.value)}>
        {post.creative_post_media.map((media, index) => <option key={media.id} value={media.id}>Image {index + 1}{media.caption ? ` — ${media.caption}` : ''}</option>)}
      </select>
    </label><button type="button" onClick={submit} disabled={busy || !mediaId}>{busy ? 'Sending…' : 'Request placement'}</button></>}
    {request?.status === 'pending' && <button type="button" className="ll-text-action" onClick={withdraw} disabled={busy}>Withdraw request</button>}
    {message && <p role="status">{message}</p>}
  </section>;
}
