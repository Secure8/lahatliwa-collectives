import clsx from 'clsx';
import { ArrowUpRight, Circle } from 'lucide-react';
import { forwardRef } from 'react';
import { Link } from 'react-router-dom';

const statusTone = {
  published: 'bg-emerald-300/12 text-emerald-100 ring-emerald-300/15',
  draft: 'bg-zinc-400/10 text-zinc-300 ring-white/10',
  featured: 'bg-amber-300/12 text-amber-100 ring-amber-300/20',
  new: 'bg-amber-300/12 text-amber-100 ring-amber-300/20',
  pending_review: 'bg-amber-300/12 text-amber-100 ring-amber-300/20',
  approved: 'bg-emerald-300/12 text-emerald-100 ring-emerald-300/20',
  rejected: 'bg-red-300/12 text-red-100 ring-red-300/20',
  archived: 'bg-zinc-100/10 text-zinc-300 ring-white/12',
  reviewed: 'bg-sky-300/12 text-sky-100 ring-sky-300/20',
  contacted: 'bg-violet-300/12 text-violet-100 ring-violet-300/20',
  accepted: 'bg-emerald-300/12 text-emerald-100 ring-emerald-300/20',
  declined: 'bg-red-300/12 text-red-100 ring-red-300/20',
  completed: 'bg-zinc-100/12 text-zinc-100 ring-white/15',
  active: 'bg-emerald-300/10 text-emerald-100 ring-emerald-300/25',
  disabled: 'bg-red-300/10 text-red-100 ring-red-300/25',
  invited: 'bg-amber-300/10 text-amber-100 ring-amber-300/25',
};

export function AdminPageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="admin-page-header mb-6 flex flex-col gap-4 border-b border-white/[0.1] pb-5 sm:mb-7 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
      <div className="max-w-3xl">
        {eyebrow && <p className="admin-eyebrow text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-amber-200/70">{eyebrow}</p>}
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
        {description && <p className="admin-page-intro mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p>}
      </div>
      {action && <div className="admin-page-header-actions flex w-full shrink-0 flex-wrap gap-2 sm:w-auto sm:gap-3">{action}</div>}
    </div>
  );
}

export function ResponsiveFormSection({ eyebrow, title, description, children, className = '', id }) {
  return (
    <section id={id} className={clsx('admin-form-section grid min-w-0 scroll-mt-24 gap-5 rounded-lg border border-white/[0.1] bg-zinc-900 p-4 sm:p-5', className)}>
      <div className="admin-section-header min-w-0 border-b border-white/[0.08] pb-3.5">
        {eyebrow && <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-200/75">{eyebrow}</p>}
        <h2 className={clsx('font-semibold text-white', eyebrow ? 'mt-2 text-xl' : 'text-lg')}>{title}</h2>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-zinc-400">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function StickyMobileActions({ children, className = '', label = 'Page actions' }) {
  return (
    <div
      aria-label={label}
      data-sticky-mobile-actions
      className={clsx('admin-sticky-actions sticky bottom-0 z-30 -mx-4 mt-4 grid grid-cols-2 gap-2 border-t border-white/[0.12] bg-zinc-950 px-4 py-3 shadow-[0_-10px_24px_rgba(0,0,0,0.24)] sm:mx-0 sm:flex sm:flex-wrap sm:items-center sm:gap-3 sm:rounded-lg sm:border sm:bg-zinc-900 sm:px-4 sm:shadow-none', className)}
    >
      {children}
    </div>
  );
}

export const AdminSurface = forwardRef(function AdminSurface({ children, className = '', as: Component = 'section', ...props }, ref) {
  return (
    <Component ref={ref} {...props} className={clsx('admin-surface rounded-lg border border-white/[0.1] bg-zinc-900 p-4 sm:p-5', className)}>
      {children}
    </Component>
  );
});

export function AdminSoftPanel({ children, className = '' }) {
  return (
    <div className={clsx('admin-soft-panel rounded-md border border-white/[0.08] bg-zinc-950 p-4', className)}>
      {children}
    </div>
  );
}

export function AdminButton({ children, to, onClick, type = 'button', variant = 'secondary', className = '', disabled = false, ...props }) {
  const classes = clsx(
    'admin-button inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3.5 text-sm font-semibold leading-none transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-45',
    variant === 'primary'
      ? 'border-amber-200/70 bg-amber-300 text-zinc-950 shadow-sm shadow-amber-950/30 hover:bg-amber-200'
      : variant === 'danger'
        ? 'border-red-300/35 bg-red-400/[0.12] text-red-100 shadow-red-950/20 hover:border-red-300/60 hover:bg-red-400/20'
        : variant === 'ghost'
          ? 'border-white/[0.08] bg-transparent text-zinc-300 shadow-none hover:border-white/[0.16] hover:bg-white/[0.055] hover:text-white'
          : 'border-white/[0.16] bg-zinc-800/85 text-zinc-100 shadow-black/15 hover:border-amber-200/35 hover:bg-zinc-700/85 hover:text-white',
    className
  );

  if (to) {
    if (disabled) return <span data-admin-control data-variant={variant} aria-disabled="true" className={classes}>{children}</span>;
    return <Link data-admin-control data-variant={variant} to={to} className={classes} {...props}>{children}</Link>;
  }

  return <button data-admin-control data-variant={variant} type={type} onClick={onClick} disabled={disabled} className={classes} {...props}>{children}</button>;
}

export function AdminActionGroup({ children, className = '' }) {
  return <div className={clsx('flex min-h-9 flex-wrap content-center items-center gap-1.5', className)}>{children}</div>;
}

export function AdminActionButton({ children, to, onClick, type = 'button', variant = 'secondary', disabled = false, className = '', ...props }) {
  const classes = clsx(
    'admin-action-button inline-flex h-9 min-w-0 shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 text-xs font-semibold leading-none transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60 disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-45',
    variant === 'danger'
      ? 'border-red-300/30 bg-red-300/[0.1] text-red-100 hover:border-red-300/50 hover:bg-red-300/[0.16]'
      : variant === 'primary'
        ? 'border-amber-200/70 bg-amber-300 text-zinc-950 hover:bg-amber-200'
        : 'border-white/[0.15] bg-zinc-800/80 text-zinc-100 hover:border-amber-200/35 hover:bg-zinc-700/85 hover:text-white',
    className
  );

  if (to) {
    if (disabled) return <span data-admin-control data-variant={variant} aria-disabled="true" className={classes}>{children}</span>;
    return <Link data-admin-control data-variant={variant} to={to} className={classes} {...props}>{children}</Link>;
  }
  return <button data-admin-control data-variant={variant} type={type} onClick={onClick} disabled={disabled} className={classes} {...props}>{children}</button>;
}

export function AdminStatusBadge({ status, children }) {
  const key = String(status || '').toLowerCase();
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1', statusTone[key] || 'bg-white/[0.06] text-zinc-300 ring-white/[0.14]')}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      {children || status}
    </span>
  );
}

export function AdminMetricCard({ label, value, icon: Icon = Circle, meta }) {
  return (
    <AdminSurface className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</p>
          <p className="mt-4 text-3xl font-semibold text-white">{value ?? 0}</p>
          {meta && <p className="mt-2 text-xs text-zinc-500">{meta}</p>}
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-amber-300/10 text-amber-100 ring-1 ring-amber-200/10">
          <Icon size={18} />
        </span>
      </div>
    </AdminSurface>
  );
}

export function AdminEmptyState({ title, message, action }) {
  return (
    <AdminSurface className="grid place-items-center px-6 py-14 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-md bg-white/[0.06] text-amber-100 ring-1 ring-white/[0.08]">
          <ArrowUpRight size={18} />
        </div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {message && <p className="mt-2 text-sm leading-6 text-zinc-400">{message}</p>}
        {action && <div className="mt-5 flex justify-center">{action}</div>}
      </div>
    </AdminSurface>
  );
}

export function AdminNotice({ children, tone = 'error', className = '', ...props }) {
  return (
    <div {...props} className={clsx(
      'rounded-lg border-l-4 px-4 py-3 text-sm font-medium shadow-sm ring-1',
      tone === 'success'
        ? 'border-l-emerald-300 bg-emerald-300/10 text-emerald-100 ring-emerald-300/20'
        : 'border-l-red-300 bg-red-300/10 text-red-100 ring-red-300/20',
      className
    )}>
      {children}
    </div>
  );
}

const inputClasses = 'w-full rounded-md border border-white/[0.14] bg-zinc-950 px-3 py-2.5 text-white outline-none transition placeholder:text-zinc-600 hover:border-white/[0.24] focus:border-amber-200/60 focus:ring-2 focus:ring-amber-200/15 disabled:cursor-not-allowed disabled:bg-white/[0.015] disabled:text-zinc-500 aria-[invalid=true]:border-red-300/60 aria-[invalid=true]:focus:ring-red-300/20';

export function AdminInput({ label, value, onChange, type = 'text', required = false, min, max, step, className = '', onBlur }) {
  return (
    <label className={clsx('admin-field grid gap-2 text-sm text-zinc-300', className)}>
      <span className="font-semibold text-zinc-200">{label}</span>
      <input required={required} type={type} value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} className={inputClasses} />
    </label>
  );
}

export function AdminTextarea({ label, value, onChange, rows = 4, required = false, onBlur, className = '' }) {
  return (
    <label className={clsx('admin-field grid gap-2 text-sm text-zinc-300', className)}>
      <span className="font-semibold text-zinc-200">{label}</span>
      <textarea required={required} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} className={clsx(inputClasses, 'min-h-24 resize-y leading-6')} />
    </label>
  );
}

export function AdminSelect({ label, value, options, onChange, className = '' }) {
  return (
    <label className={clsx('admin-field grid gap-2 text-sm text-zinc-300', className)}>
      <span className="font-semibold text-zinc-200">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClasses}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export function AdminCheckbox({ label, checked, onChange, disabled = false }) {
  return (
    <label className="admin-choice inline-flex items-center gap-3 rounded-lg border border-white/[0.1] bg-zinc-950/45 px-3 py-2.5 text-sm font-medium text-zinc-200">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-amber-300 disabled:opacity-40" />
      {label}
    </label>
  );
}

