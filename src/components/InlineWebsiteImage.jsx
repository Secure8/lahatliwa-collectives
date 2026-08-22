import { Camera, LoaderCircle, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { uploadSiteAsset } from '../lib/contentApi';
import usePublicAccount from '../lib/usePublicAccount';
import { fetchWebsiteStudioEntries, publishWebsiteEntry, saveWebsiteDraft } from '../lib/websiteStudio';

export default function InlineWebsiteImage({ section, field, value = '', label = 'page cover image' }) {
  const { account } = usePublicAccount();
  const inputRef = useRef(null);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const desktop = typeof window === 'undefined' || window.matchMedia('(min-width: 1024px)').matches;
  const editable = account?.role === 'super_admin' && desktop && Boolean(section && field);

  async function publishValue(nextValue) {
    const entries = await fetchWebsiteStudioEntries();
    const entry = entries.find((item) => item.entry_key === section);
    if (!entry) throw new Error('This page is not available for editing yet.');
    const nextData = { ...(entry.draft_data || entry.published_data || {}), [field]: nextValue };
    await saveWebsiteDraft(section, nextData);
    await publishWebsiteEntry(section);
  }

  async function upload(file) {
    if (!file || working) return;
    setWorking('upload'); setError('');
    try {
      const url = await uploadSiteAsset(file, 'page-covers', 'siteImage');
      await publishValue(url);
    } catch (uploadError) {
      setError(uploadError?.message || 'The cover image could not be published.');
    } finally { setWorking(''); }
  }

  async function remove() {
    if (working) return;
    setWorking('remove'); setError('');
    try { await publishValue(''); }
    catch (removeError) { setError(removeError?.message || 'The cover image could not be removed.'); }
    finally { setWorking(''); }
  }

  if (!editable) return null;
  return <div className="ll-page-hero__image-tools" onClick={(event) => event.stopPropagation()}>
    <input ref={inputRef} className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ''; }} />
    <button type="button" onClick={() => inputRef.current?.click()} disabled={Boolean(working)}>
      {working === 'upload' ? <LoaderCircle className="animate-spin" size={16}/> : <Camera size={16}/>} {value ? 'Change cover' : 'Add cover image'}
    </button>
    {value && <button type="button" className="is-danger" onClick={remove} disabled={Boolean(working)} aria-label={`Remove ${label}`}>
      {working === 'remove' ? <LoaderCircle className="animate-spin" size={16}/> : <Trash2 size={16}/>}<span className="sr-only">Remove cover</span>
    </button>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
