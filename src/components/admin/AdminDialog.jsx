import clsx from 'clsx';
import { X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import useModalDrawer from '../../lib/useModalDrawer';
import { AdminButton } from './AdminUI';

export default function AdminDialog({
  open,
  onClose,
  title,
  description,
  eyebrow,
  children,
  actions,
  presentation = 'dialog',
  busy = false,
  destructive = false,
  as: Component = 'section',
  onSubmit,
  panelClassName = '',
  contentClassName = '',
  simpleBackdrop = false,
  initialFocus = 'close',
  closeLabel = 'Close dialog',
}) {
  const titleId = useId();
  const descriptionId = useId();
  const guardedClose = () => {
    if (!busy) onClose?.();
  };
  const { panelRef } = useModalDrawer({ open, onClose: guardedClose });

  if (!open) return null;

  const placement = presentation === 'sheet'
    ? 'items-end sm:items-center sm:justify-center'
    : 'items-center justify-center';
  const sizing = presentation === 'fullscreen'
    ? 'h-dvh w-full rounded-none sm:h-auto sm:max-h-[min(88vh,56rem)] sm:max-w-5xl sm:rounded-xl'
    : presentation === 'sheet'
      ? 'max-h-[min(92dvh,52rem)] w-full rounded-b-none sm:max-w-xl sm:rounded-xl'
      : 'max-h-[min(92dvh,52rem)] w-[calc(100%-1.5rem)] max-w-xl rounded-xl';

  return (
    <div className={clsx('fixed inset-0 z-[80] flex p-0 sm:p-4', placement)}>
      <button
        type="button"
        tabIndex={-1}
        aria-label={closeLabel}
        onClick={guardedClose}
        className={clsx('absolute inset-0 bg-black/70', !simpleBackdrop && 'backdrop-blur-[2px] motion-reduce:backdrop-blur-none')}
      />
      <Component
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy || undefined}
        onSubmit={onSubmit}
        className={clsx(
          'relative z-10 grid min-h-0 grid-rows-[auto_1fr_auto] overflow-hidden border border-white/[0.14] bg-zinc-900 text-white shadow-2xl shadow-black/55 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150',
          destructive && 'border-red-300/20',
          sizing,
          panelClassName,
        )}
      >
        <header className="flex min-w-0 items-start justify-between gap-4 border-b border-amber-200/12 bg-zinc-900/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-5">
          <div className="min-w-0">
            {eyebrow && <p className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-amber-200/75">{eyebrow}</p>}
            <h2 id={titleId} className={clsx('text-xl font-semibold text-white', eyebrow && 'mt-1.5')}>{title}</h2>
            {description && <p id={descriptionId} className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p>}
          </div>
          <button
            type="button"
            data-drawer-initial-focus={initialFocus === 'close' ? '' : undefined}
            onClick={guardedClose}
            disabled={busy}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/[0.12] bg-white/[0.04] text-zinc-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/60 disabled:cursor-not-allowed disabled:opacity-45"
            aria-label={closeLabel}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className={clsx('min-h-0 overflow-y-auto overscroll-contain bg-zinc-950/55 px-4 py-5 sm:px-6', contentClassName)}>{children}</div>
        {actions && (
          <footer className="flex flex-col-reverse gap-2 border-t border-amber-200/12 bg-zinc-900/98 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:justify-end sm:px-6">
            {actions}
          </footer>
        )}
      </Component>
    </div>
  );
}

export function AdminConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  confirmationText = '',
  confirmationLabel,
  busy: externalBusy = false,
}) {
  const [typedValue, setTypedValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isBusy = busy || externalBusy;
  const phraseMatches = !confirmationText || typedValue === confirmationText;

  useEffect(() => {
    if (open) {
      setTypedValue('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  async function confirm() {
    if (isBusy || !phraseMatches) return;
    setBusy(true);
    setError('');
    try {
      const result = await onConfirm?.();
      if (result !== false) onClose?.();
    } catch (caughtError) {
      setError(caughtError?.message || 'The action could not be completed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      presentation="sheet"
      destructive={destructive}
      busy={isBusy}
      initialFocus={confirmationText ? 'field' : 'close'}
      actions={(
        <>
          <AdminButton onClick={onClose} disabled={isBusy}>{cancelLabel}</AdminButton>
          <AdminButton variant={destructive ? 'danger' : 'primary'} onClick={confirm} disabled={isBusy || !phraseMatches}>
            {isBusy ? 'Working…' : confirmLabel}
          </AdminButton>
        </>
      )}
    >
      {confirmationText && (
        <label className="grid gap-2 text-sm text-zinc-300">
          <span>{confirmationLabel || <>Type <strong className="text-white">{confirmationText}</strong> to continue</>}</span>
          <input
            data-drawer-initial-focus
            value={typedValue}
            onChange={(event) => setTypedValue(event.target.value)}
            autoComplete="off"
            className="h-11 rounded-md border border-white/[0.14] bg-white/[0.035] px-3 text-white outline-none focus:border-amber-200/55 focus:ring-2 focus:ring-amber-200/20"
          />
        </label>
      )}
      {error && <p className="mt-4 rounded-md bg-red-300/10 px-4 py-3 text-sm text-red-100 ring-1 ring-red-300/20" role="alert">{error}</p>}
    </AdminDialog>
  );
}

export function useAdminConfirmation() {
  const [request, setRequest] = useState(null);
  const requestConfirmation = (options) => setRequest(options);
  const close = () => setRequest(null);

  return {
    requestConfirmation,
    confirmationDialog: (
      <AdminConfirmationDialog
        {...request}
        open={Boolean(request)}
        onClose={close}
        onConfirm={request?.onConfirm}
      />
    ),
  };
}
