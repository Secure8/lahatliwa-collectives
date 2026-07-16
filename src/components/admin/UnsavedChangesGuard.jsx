import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { AdminConfirmationDialog } from './AdminDialog';
import { shouldBlockUnsavedNavigation } from '../../lib/unsavedNavigation';

export default function UnsavedChangesGuard({
  dirty,
  onDiscard,
  title = 'Discard unsaved changes?',
  description = 'You have changes that have not been saved. If you leave this page, those changes will be lost.',
}) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => shouldBlockUnsavedNavigation({
    dirty,
    currentLocation,
    nextLocation,
  }));

  useEffect(() => {
    if (!dirty) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty && blocker.state === 'blocked') blocker.proceed();
  }, [blocker, dirty]);

  return (
    <AdminConfirmationDialog
      open={blocker.state === 'blocked'}
      onClose={() => {
        if (blocker.state === 'blocked') blocker.reset();
      }}
      onConfirm={() => {
        onDiscard?.();
        blocker.proceed();
        return false;
      }}
      title={title}
      description={description}
      confirmLabel="Discard and leave"
      destructive
    />
  );
}
