import assert from 'node:assert/strict';
import test from 'node:test';
import { createThemeTransitionController, THEME_TRANSITION_CLASS, THEME_TRANSITION_CLEANUP_MS, THEME_TRANSITION_DURATION_MS } from './themeTransition.js';

function fixture({ motion = true } = {}) {
  const classes = new Set();
  const timers = new Map();
  const cleared = [];
  let sequence = 0;
  const controller = createThemeTransitionController({
    root: {
      classList: {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
      },
    },
    motionAllowed: () => motion,
    setTimer: (callback, delay) => {
      sequence += 1;
      timers.set(sequence, { callback, delay });
      return sequence;
    },
    clearTimer: (id) => {
      cleared.push(id);
      timers.delete(id);
    },
  });
  return { classes, timers, cleared, controller };
}

test('theme transition uses the approved timing and removes its temporary root class', () => {
  const state = fixture();
  assert.equal(THEME_TRANSITION_DURATION_MS, 200);
  assert.equal(THEME_TRANSITION_CLEANUP_MS, 220);
  assert.equal(state.controller.begin(), true);
  assert.equal(state.classes.has(THEME_TRANSITION_CLASS), true);
  const pending = [...state.timers.values()][0];
  assert.equal(pending.delay, 220);
  pending.callback();
  assert.equal(state.classes.has(THEME_TRANSITION_CLASS), false);
});

test('rapid repeated toggles clear the previous cleanup and keep only the latest timer', () => {
  const state = fixture();
  state.controller.begin();
  state.controller.begin();
  state.controller.begin();
  assert.deepEqual(state.cleared, [1, 2]);
  assert.equal(state.timers.size, 1);
  assert.equal(state.classes.has(THEME_TRANSITION_CLASS), true);
});

test('reduced motion applies no transition class and disposal clears pending work', () => {
  const reduced = fixture({ motion: false });
  assert.equal(reduced.controller.begin(), false);
  assert.equal(reduced.classes.has(THEME_TRANSITION_CLASS), false);
  assert.equal(reduced.timers.size, 0);

  const active = fixture();
  active.controller.begin();
  active.controller.dispose();
  assert.equal(active.classes.has(THEME_TRANSITION_CLASS), false);
  assert.equal(active.timers.size, 0);
  assert.deepEqual(active.cleared, [1]);
});
