import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const srcRoot = new URL('../', import.meta.url);

async function jsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) return jsxFiles(target);
    return entry.name.endsWith('.jsx') ? [target] : [];
  }));
  return nested.flat();
}

test('visible action labels stay concise across public and admin screens', async () => {
  const files = await jsxFiles(srcRoot);
  const source = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
  const oldLabels = [
    'View details', 'Accept inquiry', 'Start progress', 'Mark completed', 'Close inquiry',
    'I am available', 'Available to take this', 'Clear response', 'Decline assignment',
    'Pass to creative', 'Request to take this inquiry', 'Assign creative', 'Save private note',
    'Archive inquiry', 'Delete permanently', 'Change preferred creative', 'Change selection',
    'Send an inquiry', 'Send inquiry', 'View project details', 'Back to Page Content',
    'Open Public Page', 'Save Draft', 'Submit for review', 'Start bounded batch',
    'Run reconciliation', 'Retry loading directory', 'Retry loading team', 'Retry dashboard data',
  ];
  for (const label of oldLabels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.doesNotMatch(source, new RegExp(`(?:>|/>)\\s*${escaped}\\s*<`, 'i'), `Verbose action label remains: ${label}`);
  }
  assert.match(source, />Inquire\s*</);
  assert.match(source, />View\s*</);
  assert.match(source, />Complete\s*</);
  assert.match(source, />Refresh\s*</);
  assert.doesNotMatch(source, />\s*(?:Resume|Pause|Migrate one|Reconcile|Scan)\s*</i);
});
