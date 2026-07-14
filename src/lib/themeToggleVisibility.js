export const THEME_TOGGLE_REVEAL_DELAY_MS = 700;
export const THEME_TOGGLE_SCROLL_RESTORE_GRACE_MS = 350;

export function createThemeToggleVisibilityController({
  onHiddenChange,
  setTimer = globalThis.setTimeout,
  clearTimer = globalThis.clearTimeout,
  now = Date.now,
  revealDelay = THEME_TOGGLE_REVEAL_DELAY_MS,
} = {}) {
  let revealTimer = null;
  let focused = false;
  let hovered = false;
  let suppressedUntil = 0;
  let disposed = false;

  const clearRevealTimer = () => {
    if (revealTimer === null) return;
    clearTimer(revealTimer);
    revealTimer = null;
  };

  const show = () => {
    clearRevealTimer();
    if (!disposed) onHiddenChange?.(false);
  };

  const onScroll = () => {
    if (disposed || now() < suppressedUntil || focused || hovered) return;
    clearRevealTimer();
    onHiddenChange?.(true);
    revealTimer = setTimer(() => {
      revealTimer = null;
      if (!disposed) onHiddenChange?.(false);
    }, revealDelay);
  };

  return {
    onScroll,
    onFocus() {
      focused = true;
      show();
    },
    onBlur() {
      focused = false;
    },
    onPointerEnter() {
      hovered = true;
      show();
    },
    onPointerLeave() {
      hovered = false;
    },
    suppress(duration = THEME_TOGGLE_SCROLL_RESTORE_GRACE_MS) {
      suppressedUntil = now() + duration;
      show();
    },
    dispose() {
      disposed = true;
      clearRevealTimer();
    },
  };
}
