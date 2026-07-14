import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { defaultSiteContent } from '../data/siteContent';
import { brandWordmarkLengthClass, normalizeBrandWordmark } from '../lib/brandWordmark';
import { usePublicContent } from '../lib/contentApi';

export default function BrandWordmark({
  name,
  variant = 'compact',
  to,
  className,
  title,
}) {
  const { content } = usePublicContent([]);
  const text = normalizeBrandWordmark(name ?? content.displayName, defaultSiteContent.displayName);
  const classes = clsx(
    'brand-wordmark',
    `brand-wordmark--${variant}`,
    brandWordmarkLengthClass(text),
    to && 'brand-wordmark--linked',
    className,
  );
  const sharedProps = {
    className: classes,
    title: title ?? (['compact', 'admin'].includes(variant) ? text : undefined),
    'data-brand-wordmark': variant,
    style: { '--brand-wordmark-accent': content.accentColor || undefined },
  };

  if (to) return <Link to={to} {...sharedProps}>{text}</Link>;
  return <span {...sharedProps}>{text}</span>;
}
