import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const storage = readFileSync(new URL('../pages/admin/Storage.jsx', import.meta.url), 'utf8');
const governance = readFileSync(new URL('../../supabase/functions/storage-governance/index.ts', import.meta.url), 'utf8');

test('storage monitoring uses visual charts instead of metric-only grids', () => {
  for (const visual of ['RingGauge', 'DonutChart', 'StackedDistribution', 'ComparisonBars', 'BarChartCard', 'HealthSignalChart']) {
    assert.match(storage, new RegExp(`<${visual}`));
  }
  assert.match(storage, /role="img"/);
  assert.match(storage, /conic-gradient/);
  assert.doesNotMatch(storage, /function Metric\(/);
});

test('storage charts preserve exact accessible labels and responsive layouts', () => {
  assert.match(storage, /aria-label=\{`\$\{label\}/);
  assert.match(storage, /lg:grid-cols-\[minmax\(17rem,0\.78fr\)_minmax\(0,1\.45fr\)\]/);
  assert.match(storage, /formatBytes\(value\)/);
});

test('monitoring shows real public ledger images without private object fields', () => {
  assert.match(storage, /<MediaPreviewGallery items=\{mediaPreviews\}/);
  assert.match(storage, /<img src=\{item\.url\}/);
  assert.match(governance, /\.eq\('visibility','public'\)/);
  assert.match(governance, /getPublicUrl\(row\.storage_path\)/);
  assert.doesNotMatch(governance.match(/async function publicMediaPreviews[\s\S]*?\n\}/)?.[0] || '', /external_file_id|task_token|credential/);
});

test('monitoring background has no decorative grid pattern', () => {
  assert.doesNotMatch(storage, /background-image:linear-gradient|background-size:32px/);
});
