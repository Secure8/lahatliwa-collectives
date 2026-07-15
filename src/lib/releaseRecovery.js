const RECOVERY_STATE_KEY = '__lahatLiwaReleaseRecoveryAt';
const RECOVERY_STORAGE_KEY = 'lahat-liwa-release-recovery-at';
const RECOVERY_COOLDOWN_MS = 60_000;

function timestamp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function lastRecoveryAt(targetWindow) {
  const historyTimestamp = timestamp(targetWindow.history?.state?.[RECOVERY_STATE_KEY]);
  let storageTimestamp = 0;
  try {
    storageTimestamp = timestamp(targetWindow.sessionStorage?.getItem(RECOVERY_STORAGE_KEY));
  } catch {}
  return Math.max(historyTimestamp, storageTimestamp);
}

export function releaseRecoveryAllowed(targetWindow, now = Date.now()) {
  const lastAttempt = lastRecoveryAt(targetWindow);
  return !lastAttempt || now - lastAttempt > RECOVERY_COOLDOWN_MS;
}

function markRecoveryAttempt(targetWindow, now) {
  try {
    targetWindow.history?.replaceState?.({ ...(targetWindow.history.state || {}), [RECOVERY_STATE_KEY]: now }, '');
  } catch {}
  try {
    targetWindow.sessionStorage?.setItem(RECOVERY_STORAGE_KEY, String(now));
  } catch {}
}

export function isDynamicImportError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('failed to fetch dynamically imported module')
    || message.includes('error loading dynamically imported module')
    || message.includes('importing a module script failed')
    || message.includes('loading chunk')
    || message.includes('chunkloaderror');
}

export function requestReleaseReload(targetWindow = window, now = Date.now()) {
  if (!releaseRecoveryAllowed(targetWindow, now)) return false;
  markRecoveryAttempt(targetWindow, now);
  targetWindow.location.reload();
  return true;
}

export function recoverDynamicImportError(error, targetWindow = window) {
  return isDynamicImportError(error) && requestReleaseReload(targetWindow);
}

export function installReleaseRecovery(targetWindow = window) {
  if (targetWindow.__lahatLiwaReleaseRecoveryInstalled) return;
  targetWindow.__lahatLiwaReleaseRecoveryInstalled = true;
  targetWindow.addEventListener('vite:preloadError', (event) => {
    if (!releaseRecoveryAllowed(targetWindow)) return;
    event.preventDefault();
    requestReleaseReload(targetWindow);
  });
}
