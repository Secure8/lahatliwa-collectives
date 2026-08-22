import { createElement } from 'react';
import InlineWebsiteText from './InlineWebsiteText';
import InlineWebsiteImage from './InlineWebsiteImage';

export function AccentEyebrow({ children }) {
  return (
    <p className="accent-eyebrow text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">
      {children}
    </p>
  );
}

export default function PublicPageHeader({ eyebrow, title, description, titleColor, bodyColor, aside, edit, backgroundImage = '', backgroundPosition = 'center' }) {
  const editable = (field, value, options = {}) => {
    const { as = 'span', ...elementProps } = options;
    return edit?.section && edit?.[field]
      ? <InlineWebsiteText section={edit.section} field={edit[field]} value={value} as={as} {...elementProps}>{value}</InlineWebsiteText>
      : createElement(as, elementProps, value);
  };
  return (
    <header className={`public-page-header ll-page-hero ${backgroundImage ? 'has-background' : ''}`} style={{ '--public-header-title': titleColor, '--public-header-body': bodyColor }}>
      <div className={`ll-page-hero__media ${backgroundImage ? '' : 'is-placeholder'}`} style={backgroundImage ? { backgroundImage: `url("${String(backgroundImage).replaceAll('"', '%22')}")`, backgroundPosition } : undefined} aria-hidden="true" />
      <div className="ll-page-hero__overlay" aria-hidden="true" />
      <div className={`ll-page-hero__inner ${aside ? 'has-aside' : ''}`}>
        <div className="ll-page-hero__copy">
          <AccentEyebrow>{editable('eyebrowField', eyebrow, { as: 'span', label: 'Edit eyebrow' })}</AccentEyebrow>
          {editable('titleField', title, { as: 'h1', label: 'Edit heading', style: { color: 'var(--public-header-title, var(--site-primary-text))' } })}
          {description && editable('descriptionField', description, { as: 'p', type: 'textarea', label: 'Edit description', style: { color: 'var(--public-header-body, var(--site-secondary-text))' } })}
        </div>
        {aside && <div className="ll-page-hero__aside">{aside}</div>}
      </div>
      {edit?.section && edit?.backgroundField && <InlineWebsiteImage section={edit.section} field={edit.backgroundField} value={backgroundImage} label={`${eyebrow || 'page'} cover image`} />}
    </header>
  );
}
