import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const host = '127.0.0.1';
const port = 4173;
const appUrl = `http://${host}:${port}/`;
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

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
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
  throw new Error('The public mobile navbar did not render.');
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
  await waitForHttp(appUrl);
  const chromePath = await existingChrome();
  chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--disable-breakpad',
    '--disable-crash-reporter',
    '--no-first-run',
    '--no-default-browser-check',
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

  const target = await waitForPageTarget(debuggerUrl.port);
  client = createCdpClient(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await client.send('Page.enable');
  await client.send('Page.reload', { ignoreCache: true });
  await waitForNavbar(client);
  await waitForScrollablePage(client);
  await delay(100);

  await evaluate(client, 'window.scrollTo(0, 450)');
  await delay(100);
  await evaluate(client, 'window.scrollTo(0, 900)');
  await delay(300);
  const before = await evaluate(client, `(() => {
    const secondary = document.querySelector('[data-public-mobile-secondary]');
    const rect = secondary.getBoundingClientRect();
    return { scrollY: window.scrollY, primaryVisible: document.querySelector('[data-public-mobile-primary]').dataset.mobileVisible, secondaryVisible: secondary.dataset.mobileVisible, rect: { top: rect.top, bottom: rect.bottom, height: rect.height } };
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
  assert.equal(after.primaryVisible, 'false');
  assert.equal(after.secondaryVisible, 'true');
  assert.ok(after.rect.bottom > 0, `Expected secondary bottom > 0, received ${after.rect.bottom}`);
  assert.ok(after.rect.top < after.innerHeight, `Expected secondary top < ${after.innerHeight}, received ${after.rect.top}`);
  assert.equal(after.headerPosition, 'sticky');
  assert.equal(after.headerRect.top, 0);
  assert.equal(after.bodyOverflowX, 'clip');
  assert.equal(continuingUp.primaryVisible, 'false');
  assert.equal(continuingUp.secondaryVisible, 'true');
  assert.ok(continuingUp.rect.bottom > 0);
  assert.equal(hiddenAgain.primaryVisible, 'false');
  assert.equal(hiddenAgain.secondaryVisible, 'false');
  assert.equal(nearTop.primaryVisible, 'true');
  assert.equal(nearTop.secondaryVisible, 'true');

} finally {
  client?.close();
  await stopProcess(chrome);
  await stopProcess(vite);
  await removeProfile(profileDirectory);
}
