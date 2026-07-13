import { useState } from 'react';
import { getPublicImageUrl } from '../lib/storage';

export default function CreativeCover({ src, alt = '', eager = false, compact = false, name = '', position = 'center' }) {
  const [failed, setFailed] = useState(false);
  const image = getPublicImageUrl(src);
  return <div className={`grid w-full place-items-center overflow-hidden bg-zinc-900 ${compact ? '' : 'aspect-[4/3] sm:aspect-[3/2] lg:aspect-video'}`}>
    {image && !failed ? <img src={image} alt={alt} loading={eager ? 'eager' : 'lazy'} fetchpriority={eager ? 'high' : 'auto'} decoding="async" width="1920" height="1080" sizes="(max-width: 1439px) calc(100vw - 24px), 1360px" className={`${compact ? 'aspect-video' : 'h-full'} w-full object-cover`} style={{ objectPosition: position }} onError={() => setFailed(true)} /> : <div className="grid h-full min-h-52 w-full content-center bg-[radial-gradient(circle_at_75%_20%,rgba(246,213,139,0.1),transparent_38%),linear-gradient(135deg,#18181b,#0f0f11)] px-7"><span className="h-px w-14 bg-orange-400"/><span className="mt-5 max-w-xl text-[clamp(2rem,6vw,5rem)] font-semibold leading-none tracking-[-0.04em] text-zinc-200">{name || 'Lahat Liwa Creative'}</span></div>}
  </div>;
}
