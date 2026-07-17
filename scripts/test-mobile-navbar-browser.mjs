import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { defaultPageContent, defaultSiteContent } from '../src/data/siteContent.js';

const host = '127.0.0.1';
const port = 4173;
const appUrl = `http://${host}:${port}/`;
const publicContentFixture = {
  ...defaultSiteContent,
  home: defaultPageContent.home,
  about: defaultPageContent.about,
  servicesPage: defaultPageContent.services,
  contactPage: defaultPageContent.contact,
};
const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

async function existingChrome() {
  const { access } = await import('node:fs/promises');
  for (const candidate of chromeCandidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue through the platform-specific candidates.
    }
  }
  throw new Error('Chrome was not found. Set CHROME_PATH to run the mobile navbar browser test.');
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForHttp(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  let sequence = 0;

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });

  socket.addEventListener('message', async (event) => {
    const payload = typeof event.data === 'string'
      ? event.data
      : typeof event.data?.text === 'function'
        ? await event.data.text()
        : new TextDecoder().decode(event.data);
    const message = JSON.parse(payload);
    if (message.method === 'Inspector.targetCrashed') {
      for (const { reject } of pending.values()) reject(new Error('Chrome page target crashed.'));
      pending.clear();
      return;
    }
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const { reject } of pending.values()) reject(new Error('Chrome debugging connection closed.'));
    pending.clear();
  });

  return {
    ready,
    close: () => socket.close(),
    send(method, params = {}) {
      sequence += 1;
      return new Promise((resolve, reject) => {
        pending.set(sequence, { resolve, reject });
        socket.send(JSON.stringify({ id: sequence, method, params }));
      });
    },
  };
}

async function waitForPageTarget(debugPort) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const targets = await fetch(`http://${host}:${debugPort}/json/list`).then((response) => response.json());
    const page = targets.find((target) => target.type === 'page' && target.url.startsWith(appUrl));
    if (page?.webSocketDebuggerUrl) return page;
    await delay(100);
  }
  throw new Error('Chrome did not expose the local application page target.');
}

async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed.');
  return result.result.value;
}

async function waitForNavbar(client) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(client, `Boolean(document.querySelector('[data-public-mobile-secondary]'))`);
    if (ready) return;
    await delay(100);
  }
  const diagnostic = await evaluate(client, `({
    href: location.href,
    title: document.title,
    bodyText: document.body?.innerText?.slice(0, 240),
    bodyHtml: document.body?.innerHTML?.slice(0, 240),
  })`);
  throw new Error(`The public mobile navbar did not render. ${JSON.stringify(diagnostic)}`);
}

async function waitForScrollablePage(client) {
  let lastHeight = 0;
  let stableReadings = 0;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const page = await evaluate(client, `({
      height: document.documentElement.scrollHeight,
      ready: Boolean(document.querySelector('.public-home-app')),
    })`);
    if (page.ready && page.height >= 1_800 && page.height === lastHeight) stableReadings += 1;
    else stableReadings = 0;
    if (stableReadings >= 5) return;
    lastHeight = page.height;
    await delay(100);
  }
  throw new Error('The public page did not become tall enough for the deep-scroll regression.');
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await Promise.race([exited, delay(3_000)]);
}

async function removeProfile(directory) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await delay(100);
    }
  }
  throw lastError;
}

const profileDirectory = await mkdtemp(path.join(tmpdir(), 'lahat-liwa-navbar-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', host, '--port', String(port), '--strictPort'], {
  cwd: process.cwd(),
  stdio: 'ignore',
  windowsHide: true,
});
let chrome;
let client;

try {
  console.log('[browser-test] Starting local app and Chrome');
  await waitForHttp(appUrl);
  console.log('[browser-test] Local app responded');
  const chromePath = await existingChrome();
  chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDirectory}`,
    appUrl,
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });

  const debuggerUrl = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Chrome did not start remote debugging.')), 10_000);
    chrome.stderr.setEncoding('utf8');
    chrome.stderr.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (!match) return;
      clearTimeout(timeout);
      resolve({ port: Number(match[1]) });
    });
    chrome.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before the test started (${code}).`));
    });
  });
  console.log('[browser-test] Chrome debugging ready');

  const target = await waitForPageTarget(debuggerUrl.port);
  console.log('[browser-test] Chrome page target ready');
  client = createCdpClient(target.webSocketDebuggerUrl);
  await client.ready;
  console.log('[browser-test] CDP socket connected');
  await client.send('Runtime.enable');
  console.log('[browser-test] Runtime enabled');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  console.log('[browser-test] Mobile viewport applied');
  await client.send('Page.enable');
  console.log('[browser-test] Page domain enabled');
  const cachedPublicContent = JSON.stringify({
    scope: 'home|services',
    content: publicContentFixture,
    updatedAt: Date.now(),
  });
  await client.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.setItem('hevv-public-content-cache-v3', ${JSON.stringify(cachedPublicContent)});`,
  });
  await client.send('Page.reload', { ignoreCache: true });
  console.log('[browser-test] Page reload requested');
  await waitForNavbar(client);
  console.log('[browser-test] Public navbar rendered');
  await waitForScrollablePage(client);
  console.log('[browser-test] Public mobile page ready');
  await evaluate(client, `document.querySelector('[data-mobile-app-bar]').style.setProperty('--public-mobile-safe-area-top', '24px')`);
  await delay(100);

  await evaluate(client, 'window.scrollTo(0, 450)');
  await delay(100);
  await evaluate(client, 'window.scrollTo(0, 900)');
  await delay(300);
  const before = await evaluate(client, `(() => {
    const header = document.querySelector('[data-mobile-app-bar]');
    const secondary = document.querySelector('[data-public-mobile-secondary]');
    const rect = secondary.getBoundingClientRect();
    return { scrollY: window.scrollY, primaryVisible: document.querySelector('[data-public-mobile-primary]').dataset.mobileVisible, secondaryVisible: secondary.dataset.mobileVisible, rect: { top: rect.top, bottom: rect.bottom, height: rect.height }, headerBackdropFilter: getComputedStyle(header).backdropFilter };
  })()`);

  await evaluate(client, 'window.scrollTo(0, 880)');
  await delay(250);
  const after = await evaluate(client, `(() => {
    const primary = document.querySelector('[data-public-mobile-primary]');
    const secondary = document.querySelector('[data-public-mobile-secondary]');
    const header = document.querySelector('[data-mobile-app-bar]');
    const rect = secondary.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const style = getComputedStyle(secondary);
    const headerStyle = getComputedStyle(header);
    const bodyStyle = getComputedStyle(document.body);
    return { scrollY: window.scrollY, innerHeight: window.innerHeight, primaryVisible: primary.dataset.mobileVisible, secondaryVisible: secondary.dataset.mobileVisible, rect: { top: rect.top, bottom: rect.bottom, height: rect.height }, headerRect: { top: headerRect.top, bottom: headerRect.bottom, height: headerRect.height }, position: style.position, transform: style.transform, opacity: style.opacity, visibility: style.visibility, display: style.display, headerPosition: headerStyle.position, bodyOverflowX: bodyStyle.overflowX, bodyOverflowY: bodyStyle.overflowY };
  })()`);

  await evaluate(client, 'window.scrollTo(0, 850)');
  await delay(200);
  const continuingUp = await evaluate(client, `(() => { const primary = document.querySelector('[data-public-mobile-primary]'); const secondary = document.querySelector('[data-public-mobile-secondary]'); const rect = secondary.getBoundingClientRect(); return { scrollY: window.scrollY, primaryVisible: primary.dataset.mobileVisible, secondaryVisible: secondary.dataset.mobileVisible, rect: { top: rect.top, bottom: rect.bottom } }; })()`);

  await evaluate(client, 'window.scrollTo(0, 890)');
  await delay(250);
  const hiddenAgain = await evaluate(client, `(() => { const primary = document.querySelector('[data-public-mobile-primary]'); const secondary = document.querySelector('[data-public-mobile-secondary]'); const rect = secondary.getBoundingClientRect(); return { scrollY: window.scrollY, primaryVisible: primary.dataset.mobileVisible, secondaryVisible: secondary.dataset.mobileVisible, rect: { top: rect.top, bottom: rect.bottom } }; })()`);

  await evaluate(client, 'window.scrollTo(0, 20)');
  await delay(250);
  const nearTop = await evaluate(client, `(() => { const primary = document.querySelector('[data-public-mobile-primary]'); const secondary = document.querySelector('[data-public-mobile-secondary]'); const rect = secondary.getBoundingClientRect(); return { scrollY: window.scrollY, primaryVisible: primary.dataset.mobileVisible, secondaryVisible: secondary.dataset.mobileVisible, rect: { top: rect.top, bottom: rect.bottom } }; })()`);

  console.log(JSON.stringify({ before, after, continuingUp, hiddenAgain, nearTop }, null, 2));

  assert.equal(before.primaryVisible, 'false');
  assert.equal(before.secondaryVisible, 'false');
  assert.equal(before.headerBackdropFilter, 'none');
  assert.equal(after.primaryVisible, 'false');
  assert.equal(after.secondaryVisible, 'true');
  assert.ok(after.rect.bottom > 0, `Expected secondary bottom > 0, received ${after.rect.bottom}`);
  assert.ok(after.rect.top < after.innerHeight, `Expected secondary top < ${after.innerHeight}, received ${after.rect.top}`);
  assert.equal(after.headerPosition, 'sticky');
  assert.equal(after.headerRect.top, 0);
  assert.equal(after.rect.top, 0);
  assert.equal(after.bodyOverflowX, 'clip');
  assert.equal(continuingUp.primaryVisible, 'false');
  assert.equal(continuingUp.secondaryVisible, 'true');
  assert.ok(continuingUp.rect.bottom > 0);
  assert.equal(hiddenAgain.primaryVisible, 'false');
  assert.equal(hiddenAgain.secondaryVisible, 'false');
  assert.equal(nearTop.primaryVisible, 'true');
  assert.equal(nearTop.secondaryVisible, 'true');

  const themePointerTarget = await evaluate(client, `(() => {
    const button = document.querySelector('[data-public-mobile-primary] button[aria-label*="mode" i]');
    const buttonRect = button.getBoundingClientRect();
    const primaryRect = document.querySelector('[data-public-mobile-primary]').getBoundingClientRect();
    const activeIcon = button.querySelector('.theme-mode-icon__layer--active');
    return {
      x: buttonRect.left + buttonRect.width / 2,
      y: buttonRect.top + buttonRect.height / 2,
      before: document.documentElement.dataset.theme,
      label: button.getAttribute('aria-label'),
      buttonRect: { width: buttonRect.width, height: buttonRect.height },
      primaryRect: { top: primaryRect.top, bottom: primaryRect.bottom, height: primaryRect.height },
      activeIcon: activeIcon?.classList.contains('theme-mode-icon__sun') ? 'sun' : 'moon',
    };
  })()`);
  await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: themePointerTarget.x, y: themePointerTarget.y, button: 'left', clickCount: 1 });
  await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: themePointerTarget.x, y: themePointerTarget.y, button: 'left', clickCount: 1 });
  const themeDuringTransition = await evaluate(client, `(() => {
    const button = document.querySelector('[data-public-mobile-primary] button[aria-label*="mode" i]');
    const buttonRect = button.getBoundingClientRect();
    const primaryRect = document.querySelector('[data-public-mobile-primary]').getBoundingClientRect();
    const bodyStyle = getComputedStyle(document.body);
    const activeIcon = button.querySelector('.theme-mode-icon__layer--active');
    return {
      theme: document.documentElement.dataset.theme,
      transitionActive: document.documentElement.classList.contains('theme-transition'),
      transitionProperty: bodyStyle.transitionProperty,
      transitionDuration: bodyStyle.transitionDuration,
      transitionTimingFunction: bodyStyle.transitionTimingFunction,
      rootOpacity: getComputedStyle(document.documentElement).opacity,
      bodyOpacity: bodyStyle.opacity,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      label: button.getAttribute('aria-label'),
      buttonRect: { width: buttonRect.width, height: buttonRect.height },
      primaryRect: { top: primaryRect.top, bottom: primaryRect.bottom, height: primaryRect.height },
      activeIcon: activeIcon?.classList.contains('theme-mode-icon__sun') ? 'sun' : 'moon',
      focusInsideHeader: document.querySelector('[data-mobile-app-bar]').contains(document.activeElement),
    };
  })()`);
  await delay(240);
  const themeAfterClick = await evaluate(client, `({
    theme: document.documentElement.dataset.theme,
    transitionActive: document.documentElement.classList.contains('theme-transition'),
    focusInsideHeader: document.querySelector('[data-mobile-app-bar]').contains(document.activeElement),
  })`);
  await evaluate(client, 'window.scrollTo(0, 450)');
  await delay(100);
  await evaluate(client, 'window.scrollTo(0, 900)');
  await delay(300);
  const afterThemeScroll = await evaluate(client, `(() => {
    const primary = document.querySelector('[data-public-mobile-primary]');
    const secondary = document.querySelector('[data-public-mobile-secondary]');
    return { primaryVisible: primary.dataset.mobileVisible, secondaryVisible: secondary.dataset.mobileVisible };
  })()`);
  assert.notEqual(themeAfterClick.theme, themePointerTarget.before);
  assert.equal(themeDuringTransition.transitionActive, true);
  assert.match(themeDuringTransition.transitionProperty, /background-color/);
  assert.match(themeDuringTransition.transitionProperty, /color/);
  assert.match(themeDuringTransition.transitionProperty, /border-color/);
  assert.match(themeDuringTransition.transitionProperty, /fill/);
  assert.match(themeDuringTransition.transitionProperty, /stroke/);
  assert.match(themeDuringTransition.transitionProperty, /box-shadow/);
  assert.equal(themeDuringTransition.transitionDuration, '0.2s');
  assert.equal(themeDuringTransition.transitionTimingFunction, 'cubic-bezier(0.2, 0, 0, 1)');
  assert.equal(themeDuringTransition.rootOpacity, '1');
  assert.equal(themeDuringTransition.bodyOpacity, '1');
  assert.equal(themeDuringTransition.horizontalOverflow, false);
  assert.notEqual(themeDuringTransition.label, themePointerTarget.label);
  assert.notEqual(themeDuringTransition.activeIcon, themePointerTarget.activeIcon);
  assert.deepEqual(themeDuringTransition.buttonRect, themePointerTarget.buttonRect);
  assert.deepEqual(themeDuringTransition.primaryRect, themePointerTarget.primaryRect);
  assert.equal(themeAfterClick.transitionActive, false);
  assert.equal(themeAfterClick.focusInsideHeader, false);
  assert.equal(afterThemeScroll.primaryVisible, 'false');
  assert.equal(afterThemeScroll.secondaryVisible, 'false');
  console.log('[browser-test] Pointer theme transition passed');

  await evaluate(client, 'window.scrollTo(0, 20)');
  await delay(250);
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  const keyboardBefore = await evaluate(client, `(() => {
    const button = document.querySelector('[data-public-mobile-primary] button[aria-label*="mode" i]');
    button.focus();
    return { theme: document.documentElement.dataset.theme, focusVisible: button.matches(':focus-visible') };
  })()`);
  await evaluate(client, `document.querySelector('[data-public-mobile-primary] button[aria-label*="mode" i]').click()`);
  await delay(30);
  const keyboardAfter = await evaluate(client, `(() => {
    const button = document.querySelector('[data-public-mobile-primary] button[aria-label*="mode" i]');
    return {
      theme: document.documentElement.dataset.theme,
      retainedFocus: document.activeElement === button,
      focusVisible: button.matches(':focus-visible'),
    };
  })()`);
  console.log(JSON.stringify({ keyboardBefore, keyboardAfter }, null, 2));
  assert.equal(keyboardBefore.focusVisible, true);
  assert.notEqual(keyboardAfter.theme, keyboardBefore.theme);
  assert.equal(keyboardAfter.retainedFocus, true);
  assert.equal(keyboardAfter.focusVisible, true);
  await delay(240);
  console.log('[browser-test] Keyboard focus behavior passed');

  await client.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  const reducedMotion = await evaluate(client, `(() => {
    const button = document.querySelector('[data-public-mobile-primary] button[aria-label*="mode" i]');
    const beforeTheme = document.documentElement.dataset.theme;
    button.click();
    const iconStyle = getComputedStyle(button.querySelector('.theme-mode-icon__layer'));
    return {
      beforeTheme,
      theme: document.documentElement.dataset.theme,
      transitionActive: document.documentElement.classList.contains('theme-transition'),
      iconTransitionDuration: iconStyle.transitionDuration,
    };
  })()`);
  assert.notEqual(reducedMotion.theme, reducedMotion.beforeTheme);
  assert.equal(reducedMotion.transitionActive, false);
  assert.equal(reducedMotion.iconTransitionDuration, '0s');
  await client.send('Emulation.setEmulatedMedia', { features: [] });
  console.log('[browser-test] Reduced-motion behavior passed');

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send('Page.reload', { ignoreCache: true });
  await waitForNavbar(client);
  const desktopTheme = await evaluate(client, `(() => {
    const button = document.querySelector('.theme-toggle--global');
    const beforeTheme = document.documentElement.dataset.theme;
    const beforeRect = button.getBoundingClientRect();
    button.click();
    const afterRect = button.getBoundingClientRect();
    return {
      beforeTheme,
      theme: document.documentElement.dataset.theme,
      transitionActive: document.documentElement.classList.contains('theme-transition'),
      beforeRect: { width: beforeRect.width, height: beforeRect.height },
      afterRect: { width: afterRect.width, height: afterRect.height },
    };
  })()`);
  assert.notEqual(desktopTheme.theme, desktopTheme.beforeTheme);
  assert.equal(desktopTheme.transitionActive, true);
  assert.deepEqual(desktopTheme.afterRect, desktopTheme.beforeRect);
  await delay(240);
  console.log('[browser-test] Desktop theme transition passed');

  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });

  await evaluate(client, `(() => {
    document.documentElement.className = 'admin-mode';
    document.documentElement.style.setProperty('--mobile-app-bar-show-duration', '0ms');
    document.documentElement.style.setProperty('--mobile-app-bar-hide-duration', '0ms');
    document.body.innerHTML = \`<div class="admin-shell min-h-screen text-white">
      <aside data-admin-mobile-app-bar data-mobile-visible="false" data-primary-visible="false" class="admin-app-bar theme-navigation-surface sticky inset-x-0 top-0 z-30" style="--admin-mobile-safe-area-top: 24px">
        <div data-admin-mobile-primary data-mobile-visible="false" class="admin-app-bar__primary theme-navigation-surface relative z-10 px-3 pb-1 pt-[calc(0.75rem+var(--admin-mobile-safe-area-top))] transition-[transform,opacity,background-color]">
          <div class="h-11"></div>
        </div>
        <nav data-admin-mobile-secondary data-mobile-visible="false" data-primary-visible="false" class="admin-app-bar__secondary theme-navigation-surface relative z-20 border-b border-white/[0.08] transition-[transform,opacity,background-color]">
          <div class="min-h-[3.25rem]"></div>
        </nav>
      </aside>
      <main style="height: 2400px"></main>
    </div>\`;
    window.scrollTo(0, 900);
  })()`);
  await delay(100);
  const adminHidden = await evaluate(client, `(() => {
    const shell = document.querySelector('.admin-shell');
    const header = document.querySelector('[data-admin-mobile-app-bar]');
    const secondary = document.querySelector('[data-admin-mobile-secondary]');
    const headerRect = header.getBoundingClientRect();
    const rect = secondary.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      headerRect: { top: headerRect.top, bottom: headerRect.bottom, height: headerRect.height },
      rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
      headerBackdropFilter: getComputedStyle(header).backdropFilter,
      headerPosition: getComputedStyle(header).position,
      shellOverflowX: getComputedStyle(shell).overflowX,
      shellOverflowY: getComputedStyle(shell).overflowY,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
    };
  })()`);

  await evaluate(client, `(() => {
    document.querySelector('[data-admin-mobile-app-bar]').dataset.mobileVisible = 'true';
    document.querySelector('[data-admin-mobile-secondary]').dataset.mobileVisible = 'true';
  })()`);
  await delay(100);
  const adminRevealed = await evaluate(client, `(() => {
    const header = document.querySelector('[data-admin-mobile-app-bar]');
    const primary = document.querySelector('[data-admin-mobile-primary]');
    const secondary = document.querySelector('[data-admin-mobile-secondary]');
    const headerRect = header.getBoundingClientRect();
    const rect = secondary.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      innerHeight: window.innerHeight,
      primaryVisible: primary.dataset.mobileVisible,
      secondaryVisible: secondary.dataset.mobileVisible,
      headerRect: { top: headerRect.top, bottom: headerRect.bottom, height: headerRect.height },
      rect: { top: rect.top, bottom: rect.bottom, height: rect.height },
      transform: getComputedStyle(secondary).transform,
      opacity: getComputedStyle(secondary).opacity,
      backgroundColor: getComputedStyle(secondary).backgroundColor,
    };
  })()`);

  console.log(JSON.stringify({ adminHidden, adminRevealed }, null, 2));
  assert.equal(adminHidden.headerBackdropFilter, 'none');
  assert.equal(adminHidden.headerPosition, 'sticky');
  assert.equal(adminHidden.headerRect.top, 0);
  assert.equal(adminHidden.headerRect.height, 0);
  assert.equal(adminHidden.rect.bottom, 0);
  assert.equal(adminHidden.shellOverflowX, 'visible');
  assert.equal(adminHidden.shellOverflowY, 'visible');
  assert.equal(adminHidden.bodyOverflowX, 'clip');
  assert.equal(adminRevealed.primaryVisible, 'false');
  assert.equal(adminRevealed.secondaryVisible, 'true');
  assert.equal(adminRevealed.headerRect.height, 0);
  const adminBackgroundAlpha = Number(adminRevealed.backgroundColor.match(/,\s*([\d.]+)\)$/)?.[1] ?? 1);
  assert.ok(adminBackgroundAlpha >= 0.98, `Expected admin navbar opacity >= 0.98, received ${adminRevealed.backgroundColor}`);
  assert.ok(adminRevealed.rect.bottom > 0, `Expected admin secondary bottom > 0, received ${adminRevealed.rect.bottom}`);
  assert.equal(adminRevealed.rect.top, 0);
  assert.ok(adminRevealed.rect.top < adminRevealed.innerHeight, `Expected admin secondary top < ${adminRevealed.innerHeight}, received ${adminRevealed.rect.top}`);
  console.log('[browser-test] Admin mobile geometry passed');

} finally {
  console.log('[browser-test] Cleaning up browser processes');
  client?.close();
  await stopProcess(chrome);
  await stopProcess(vite);
  await removeProfile(profileDirectory);
}
