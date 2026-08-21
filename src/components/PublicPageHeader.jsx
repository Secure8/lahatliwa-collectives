import { createElement } from 'react';
import InlineWebsiteText from './InlineWebsiteText';

export function AccentEyebrow({ children }) {
  return (
    <p className="accent-eyebrow text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--theme-text-muted)]">
      {children}
    </p>
  );
}

export default function PublicPageHeader({ eyebrow, title, description, titleColor, bodyColor, aside, edit }) {
  const editable = (field, value, options = {}) => {
    const { as = 'span', ...elementProps } = options;
    return edit?.section && edit?.[field]
      ? <InlineWebsiteText section={edit.section} field={edit[field]} value={value} as={as} {...elementProps}>{value}</InlineWebsiteText>
      : createElement(as, elementProps, value);
  };
  return (
    <header className="public-page-header pb-10 sm:pb-12" style={{ '--public-header-title': titleColor, '--public-header-body': bodyColor }}>
      <div className={`grid gap-8 ${aside ? 'lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-end' : ''}`}>
        <div className="max-w-3xl">
          <AccentEyebrow>{editable('eyebrowField', eyebrow, { as: 'span', label: 'Edit eyebrow' })}</AccentEyebrow>
          {editable('titleField', title, { as: 'h1', label: 'Edit heading', className: 'mt-5 text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl', style: { color: 'var(--public-header-title, var(--site-primary-text))' } })}
          {description && editable('descriptionField', description, { as: 'p', type: 'textarea', label: 'Edit description', className: 'mt-5 max-w-2xl text-base leading-7 sm:text-lg sm:leading-8', style: { color: 'var(--public-header-body, var(--site-secondary-text))' } })}
        </div>
        {aside && <div className="border-l border-[var(--site-accent-border)] pl-5">{aside}</div>}
      </div>
    </header>
  );
}
