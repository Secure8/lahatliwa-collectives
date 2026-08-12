import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('guided service choices navigate only after deliberate service or specialist selections', async () => {
  const [form, services] = await Promise.all([
    readFile(new URL('../pages/StartProject.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../pages/Services.jsx', import.meta.url), 'utf8'),
  ]);

  assert.match(form, /const serviceCategoryRef = useRef\(null\)/);
  assert.doesNotMatch(form, /function selectBranch/);
  assert.match(form, /function selectService\(serviceKey\) \{[\s\S]*?service\.legacyBranch[\s\S]*?moveToStep\(INQUIRY_SPECIALIST_STEP\)/);
  assert.match(form, /function selectRecipient\(creativeSlug\) \{[\s\S]*?recipientSelectionRef\.current === creativeSlug[\s\S]*?moveToStep\(INQUIRY_SPECIALIST_STEP \+ 1\)/);
  assert.match(form, /data-flow-step="category"/);
  assert.match(form, /data-flow-step="specialist"/);
  assert.match(services, /aria-label="Available services"/);
  assert.match(services, /aria-label=\{`Ask about \$\{service\.name\}`\}/);
});
