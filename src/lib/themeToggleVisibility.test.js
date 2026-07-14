import assert from 'node:assert/strict';
import test from 'node:test';
import { createThemeToggleVisibilityController, THEME_TOGGLE_REVEAL_DELAY_MS } from './themeToggleVisibility.js';

function visibilityHarness() {
  let now = 1_000;
  let nextTimer = 1;
  const timers = new Map();
  const changes = [];
  const cleared = [];
  const controller = createThemeToggleVisibilityController({
    onHiddenChange: (hidden) => changes.push(hidden),
    now: () => now,
    setTimer: (callback, delay) => {
      const id = nextTimer++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimer: (id) => {
      cleared.push(id);
      timers.delete(id);
    },
  });
  return {
    controller,
    changes,
    cleared,
    timers,
    advance: (duration) => { now += duration; },
    runTimer: () => {
      const [id, timer] = timers.entries().next().value || [];
      if (!timer) return;
      timers.delete(id);
      timer.callback();
    },
  };
}

test('theme toggle hides during active scrolling and reappears after the reveal delay', () => {
  const harness = visibilityHarness();
  harness.controller.onScroll();
  assert.deepEqual(harness.changes, [true]);
  assert.equal([...harness.timers.values()][0].delay, THEME_TOGGLE_REVEAL_DELAY_MS);
  harness.runTimer();
  assert.deepEqual(harness.changes, [true, false]);
});

test('theme toggle stays visible while keyboard-focused or pointer-hovered', () => {
  const harness = visibilityHarness();
  harness.controller.onFocus();
  harness.controller.onScroll();
  harness.controller.onBlur();
  harness.controller.onPointerEnter();
  harness.controller.onScroll();
  assert.deepEqual(harness.changes, [false, false]);
  assert.equal(harness.timers.size, 0);
});

test('a pointer-triggered theme change clears stale hover and non-visible focus state', () => {
  const harness = visibilityHarness();
  harness.controller.onPointerEnter();
  harness.controller.onFocus(false);
  harness.controller.onThemeChange({ focusVisible: false });
  harness.controller.onScroll();
  assert.deepEqual(harness.changes, [false, false, true]);
  assert.equal([...harness.timers.values()][0].delay, THEME_TOGGLE_REVEAL_DELAY_MS);
});

test('scroll hiding remains active after one or several theme changes', () => {
  const harness = visibilityHarness();
  harness.controller.onScroll();
  harness.controller.onThemeChange();
  harness.controller.onScroll();
  harness.controller.onThemeChange();
  harness.controller.onThemeChange();
  harness.controller.onScroll();
  assert.deepEqual(harness.changes, [true, false, true, false, false, true]);
  assert.equal(harness.timers.size, 1);
  harness.runTimer();
  assert.equal(harness.changes.at(-1), false);
});

test('rapid theme changes cancel pending reveals without disabling future scrolling', () => {
  const harness = visibilityHarness();
  harness.controller.onScroll();
  const firstTimer = [...harness.timers.keys()][0];
  harness.controller.onThemeChange();
  harness.controller.onThemeChange();
  assert.ok(harness.cleared.includes(firstTimer));
  assert.equal(harness.timers.size, 0);
  harness.controller.onScroll();
  assert.equal(harness.changes.at(-1), true);
  assert.equal(harness.timers.size, 1);
});

test('keyboard-visible focus remains protected across a theme change', () => {
  const harness = visibilityHarness();
  harness.controller.onFocus(true);
  harness.controller.onThemeChange({ focusVisible: true });
  harness.controller.onScroll();
  assert.deepEqual(harness.changes, [false, false]);
  assert.equal(harness.timers.size, 0);
  harness.controller.onBlur();
  harness.controller.onScroll();
  assert.equal(harness.changes.at(-1), true);
});

test('route-restoration grace ignores initial scroll without hiding the toggle', () => {
  const harness = visibilityHarness();
  harness.controller.suppress(350);
  harness.controller.onScroll();
  harness.advance(351);
  harness.controller.onScroll();
  assert.deepEqual(harness.changes, [false, true]);
});

test('disposing the controller clears timers and prevents stale reveal updates', () => {
  const harness = visibilityHarness();
  harness.controller.onScroll();
  const timerId = [...harness.timers.keys()][0];
  harness.controller.dispose();
  assert.deepEqual(harness.cleared, [timerId]);
  assert.equal(harness.timers.size, 0);
  assert.deepEqual(harness.changes, [true]);
});
