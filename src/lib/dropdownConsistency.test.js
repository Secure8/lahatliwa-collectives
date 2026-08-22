import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

test('taxonomy dropdowns use an opaque themed surface above page content', () => {
  assert.match(css, /--theme-dropdown-surface:\s*#202024/);
  assert.match(css, /:root\[data-theme="light"\][\s\S]*--theme-dropdown-surface:\s*#fffdf8/);
  assert.match(css, /\.ll-taxonomy-menu\s*\{[^}]*z-index:\s*80[^}]*background:\s*var\(--theme-dropdown-surface\)[^}]*opacity:\s*1/s);
  assert.doesNotMatch(css, /\.ll-taxonomy-(?:trigger|menu)[^{]*\{[^}]*var\(--theme-surface\)/s);
});

test('native dropdowns share the modern shell and readable option colors', () => {
  assert.match(css, /:where\(select:not\(\[multiple\]\)\)\s*\{[^}]*appearance:\s*none[^}]*background-color:\s*var\(--theme-dropdown-surface\)\s*!important[^}]*padding-right:\s*2\.5rem\s*!important/s);
  assert.match(css, /:where\(select option, select optgroup\)\s*\{[^}]*background-color:\s*var\(--theme-dropdown-surface\)[^}]*color:\s*var\(--theme-text-primary\)/s);
});
