import clsx from 'clsx';

export default function BrandLogo({
  src,
  alt,
  variant = 'compact',
  className,
  loading,
  decoding = 'async',
}) {
  if (!src) return null;

  return (
    <span
      className={clsx('brand-logo', `brand-logo--${variant}`, className)}
      data-brand-logo={variant}
    >
      <img
        src={src}
        alt={alt || 'Site logo'}
        loading={loading}
        decoding={decoding}
        width="36"
        height="36"
        className="brand-logo__image"
      />
    </span>
  );
}
