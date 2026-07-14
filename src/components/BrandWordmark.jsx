import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { defaultSiteContent } from '../data/siteContent';
import { brandWordmarkLengthClass, normalizeBrandWordmark } from '../lib/brandWordmark';
import { usePublicContent } from '../lib/contentApi';

export default function BrandWordmark({
  name,
  variant = 'standard',
  mobileVariant,
  to,
  className,
  title,
}) {
  const { content } = usePublicContent([]);
  const text = normalizeBrandWordmark(name ?? content.displayName, defaultSiteContent.displayName);
  const classes = clsx(
    'brand-wordmark',
    `brand-wordmark--${variant}`,
    mobileVariant && `brand-wordmark--${mobileVariant}`,
    brandWordmarkLengthClass(text),
    to && 'brand-wordmark--linked',
    className,
  );
  const sharedProps = {
    className: classes,
    title: title ?? (['compact', 'admin'].includes(variant) || mobileVariant === 'mobile-compact' ? text : undefined),
    'data-brand-wordmark': variant,
    'data-mobile-brand-wordmark': mobileVariant,
    style: { '--brand-wordmark-accent': content.accentColor || undefined },
  };

  if (to) return <Link to={to} {...sharedProps}>{text}</Link>;
  return <span {...sharedProps}>{text}</span>;
}
