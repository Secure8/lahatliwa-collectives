import clsx from 'clsx';
import { ArrowUpRight, Circle } from 'lucide-react';
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
};

export function AdminPageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow && <p className="text-xs font-medium uppercase tracking-[0.24em] text-amber-200/80">{eyebrow}</p>}
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-3">{action}</div>}
    </div>
  );
}

export function AdminSurface({ children, className = '', as: Component = 'section', ...props }) {
  return (
    <Component {...props} className={clsx('rounded-md bg-white/[0.035] p-5 ring-1 ring-white/[0.055]', className)}>
      {children}
    </Component>
  );
}

export function AdminSoftPanel({ children, className = '' }) {
  return (
    <div className={clsx('rounded-md bg-zinc-950/45 p-4 ring-1 ring-white/[0.06]', className)}>
      {children}
    </div>
  );
}

export function AdminButton({ children, to, onClick, type = 'button', variant = 'secondary', className = '', disabled = false }) {
  const classes = clsx(
    'inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 text-sm font-semibold leading-none transition disabled:pointer-events-none disabled:opacity-55',
    variant === 'primary'
      ? 'bg-amber-300 text-zinc-950 hover:bg-amber-200'
      : variant === 'danger'
        ? 'bg-red-400/10 text-red-100 ring-1 ring-red-300/20 hover:bg-red-400/15'
        : variant === 'ghost'
          ? 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
          : 'bg-white/[0.055] text-zinc-200 ring-1 ring-white/[0.08] hover:bg-white/[0.085] hover:text-white',
    className
  );

  if (to) {
    return <Link to={to} className={classes}>{children}</Link>;
  }

  return <button type={type} onClick={onClick} disabled={disabled} className={classes}>{children}</button>;
}

export function AdminActionGroup({ children, className = '' }) {
  return <div className={clsx('flex min-h-9 flex-wrap content-center items-center gap-1.5', className)}>{children}</div>;
}

export function AdminActionButton({ children, to, onClick, type = 'button', variant = 'secondary', disabled = false, className = '' }) {
  const classes = clsx(
    'inline-flex h-9 min-w-20 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-xs font-medium leading-none transition disabled:pointer-events-none disabled:opacity-50',
    variant === 'danger'
      ? 'text-red-200 hover:bg-red-300/10 hover:text-red-100'
      : variant === 'primary'
        ? 'bg-amber-300 text-zinc-950 hover:bg-amber-200'
        : 'text-zinc-300 hover:bg-white/[0.055] hover:text-white',
    className
  );

  if (to) return <Link to={to} className={classes}>{children}</Link>;
  return <button type={type} onClick={onClick} disabled={disabled} className={classes}>{children}</button>;
}

export function AdminStatusBadge({ status, children }) {
  const key = String(status || '').toLowerCase();
  return (
    <span className={clsx('inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium capitalize ring-1', statusTone[key] || 'bg-white/[0.06] text-zinc-300 ring-white/[0.08]')}>
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

export function AdminNotice({ children, tone = 'error', className = '' }) {
  return (
    <div className={clsx(
      'rounded-md px-4 py-3 text-sm ring-1',
      tone === 'success'
        ? 'bg-emerald-300/10 text-emerald-100 ring-emerald-300/20'
        : 'bg-red-300/10 text-red-100 ring-red-300/20',
      className
    )}>
      {children}
    </div>
  );
}

const inputClasses = 'w-full rounded-md bg-zinc-950/55 px-3 py-3 text-white outline-none ring-1 ring-white/[0.08] transition placeholder:text-zinc-600 focus:ring-amber-200/45';

export function AdminInput({ label, value, onChange, type = 'text', required = false, min, max, step, className = '', onBlur }) {
  return (
    <label className={clsx('grid gap-2 text-sm text-zinc-300', className)}>
      <span>{label}</span>
      <input required={required} type={type} value={value} min={min} max={max} step={step} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} className={inputClasses} />
    </label>
  );
}

export function AdminTextarea({ label, value, onChange, rows = 4, required = false, onBlur, className = '' }) {
  return (
    <label className={clsx('grid gap-2 text-sm text-zinc-300', className)}>
      <span>{label}</span>
      <textarea required={required} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} className={clsx(inputClasses, 'min-h-24 resize-y leading-6')} />
    </label>
  );
}

export function AdminSelect({ label, value, options, onChange, className = '' }) {
  return (
    <label className={clsx('grid gap-2 text-sm text-zinc-300', className)}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClasses}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export function AdminCheckbox({ label, checked, onChange }) {
  return (
    <label className="inline-flex items-center gap-3 rounded-md bg-white/[0.045] px-3 py-2 text-sm text-zinc-300 ring-1 ring-white/[0.07]">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-amber-300" />
      {label}
    </label>
  );
}

