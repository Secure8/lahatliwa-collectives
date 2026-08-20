import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('open inquiry removes forced service and specialist selection', async () => {
  const [form, services] = await Promise.all([
    readFile(new URL('../pages/StartProject.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/Services.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(form, /branch: 'general', serviceKey: 'general-inquiry'/);
  assert.match(form, /aria-label=\{platformInquiry \? 'Platform contact form' : 'Creative inquiry form'\}/);
  assert.doesNotMatch(form, /selectService|selectRecipient|data-flow-step/);
  assert.match(form, /What kind of work is this about/);
  assert.doesNotMatch(services, /Available services|Ask about/);
});
