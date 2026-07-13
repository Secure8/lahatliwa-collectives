export function AccentEyebrow({ children, color }) {
  return (
    <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em]" style={{ color }}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current shadow-[0_0_9px_currentColor]" aria-hidden="true" />
      {children}
    </p>
  );
}

export default function PublicPageHeader({ eyebrow, title, description, accentColor, titleColor, bodyColor, aside }) {
  return (
    <header className="border-b border-white/[0.09] pb-10 sm:pb-12">
      <div className={`grid gap-8 ${aside ? 'lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-end' : ''}`}>
        <div className="max-w-3xl">
          <AccentEyebrow color={accentColor}>{eyebrow}</AccentEyebrow>
          <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl" style={{ color: titleColor }}>{title}</h1>
          {description && <p className="mt-5 max-w-2xl text-base leading-7 sm:text-lg sm:leading-8" style={{ color: bodyColor }}>{description}</p>}
        </div>
        {aside && <div className="border-l border-orange-300/55 pl-5">{aside}</div>}
      </div>
    </header>
  );
}
