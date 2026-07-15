import assert from 'node:assert/strict';
import test from 'node:test';
import { installReleaseRecovery, isDynamicImportError, recoverDynamicImportError, releaseRecoveryAllowed } from './releaseRecovery.js';

function fakeWindow() {
  const storage = new Map();
  const listeners = new Map();
  return {
    history: {
      state: { idx: 2 },
      replaceState(next) { this.state = next; },
    },
    sessionStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); },
    },
    location: {
      reloads: 0,
      reload() { this.reloads += 1; },
    },
    addEventListener(name, listener) { listeners.set(name, listener); },
    dispatch(name, event) { listeners.get(name)?.(event); },
  };
}

test('dynamic import failures are recognized without treating normal render errors as stale releases', () => {
  assert.equal(isDynamicImportError(new TypeError('Failed to fetch dynamically imported module: /assets/page-old.js')), true);
  assert.equal(isDynamicImportError(new Error('Importing a module script failed.')), true);
  assert.equal(isDynamicImportError(new Error('ChunkLoadError: Loading chunk 12 failed')), true);
  assert.equal(isDynamicImportError(new Error('Cannot read properties of undefined')), false);
});

test('Vite preload failures refresh once and prevent a reload loop', () => {
  const target = fakeWindow();
  installReleaseRecovery(target);
  let prevented = 0;
  target.dispatch('vite:preloadError', { preventDefault() { prevented += 1; } });
  target.dispatch('vite:preloadError', { preventDefault() { prevented += 1; } });
  assert.equal(target.location.reloads, 1);
  assert.equal(prevented, 1);
  assert.equal(releaseRecoveryAllowed(target, Date.now()), false);
});

test('the error boundary fallback only auto-recovers import failures', () => {
  const target = fakeWindow();
  assert.equal(recoverDynamicImportError(new Error('Ordinary render failure'), target), false);
  assert.equal(target.location.reloads, 0);
  assert.equal(recoverDynamicImportError(new Error('Error loading dynamically imported module'), target), true);
  assert.equal(target.location.reloads, 1);
});
