import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('production JavaScript remains compatible with older Chrome releases', async () => {
  const config = await readFile(new URL('../../vite.config.js', import.meta.url), 'utf8');

  assert.match(config, /target:\s*\['es2019',\s*'chrome87'\]/);
});

test('the app has a visible mobile-safe startup path instead of an empty black root', async () => {
  const [html, entry] = await Promise.all([
    readFile(new URL('../../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../main.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(html, /class="boot-loader"/);
  assert.doesNotMatch(html, /querySelector\([^\n]+\)\?\./);
  assert.match(entry, /import\('\.\/bootstrap\.jsx'\)\.catch\(showStartupFailure\)/);
  assert.match(entry, /data-boot-refresh/);
});

test('public filters and Collab avoid redundant decorative interface elements', async () => {
  const [discover, collab] = await Promise.all([
    readFile(new URL('../pages/Discover.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/StartProject.jsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(discover, /SlidersHorizontal/);
  assert.doesNotMatch(collab, /What happens next|CheckCircle2/);
});
