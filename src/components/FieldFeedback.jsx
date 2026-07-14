import clsx from 'clsx';

export function FieldError({ id, children, className = '' }) {
  if (!children) return null;
  return <p id={id} role="alert" className={clsx('text-xs leading-5 text-red-200', className)}>{children}</p>;
}

export function ActionFeedback({ error = '', success = '', className = '' }) {
  const message = error || success;
  if (!message) return null;
  return (
    <div
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      className={clsx(
        'rounded-sm border px-3 py-3 text-sm leading-6',
        error
          ? 'border-red-300/25 bg-red-300/[0.06] text-red-100'
          : 'border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100',
        className
      )}
    >
      {message}
    </div>
  );
}
