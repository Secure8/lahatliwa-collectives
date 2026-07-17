import { themeMotionAllowed } from './theme.js';

export const THEME_TRANSITION_CLASS = 'theme-transition';
export const THEME_TRANSITION_DURATION_MS = 200;
export const THEME_TRANSITION_CLEANUP_MS = 220;

export function createThemeTransitionController({
  root = globalThis.document?.documentElement,
  motionAllowed = themeMotionAllowed,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
} = {}) {
  let cleanupTimer = null;
  let disposed = false;

  function clearPendingTimer() {
    if (cleanupTimer === null) return;
    clearTimer(cleanupTimer);
    cleanupTimer = null;
  }

  function removeTransitionClass() {
    clearPendingTimer();
    root?.classList?.remove(THEME_TRANSITION_CLASS);
  }

  return {
    begin() {
      if (disposed) return false;
      clearPendingTimer();
      if (!motionAllowed()) {
        root?.classList?.remove(THEME_TRANSITION_CLASS);
        return false;
      }
      root?.classList?.add(THEME_TRANSITION_CLASS);
      cleanupTimer = setTimer(() => {
        cleanupTimer = null;
        root?.classList?.remove(THEME_TRANSITION_CLASS);
      }, THEME_TRANSITION_CLEANUP_MS);
      return true;
    },
    finish: removeTransitionClass,
    dispose() {
      disposed = true;
      removeTransitionClass();
    },
  };
}
