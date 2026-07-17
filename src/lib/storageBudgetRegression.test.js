import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('the capacity check qualifies reservation bytes to avoid a PL/pgSQL name collision', () => {
  const migration = readFileSync(
    new URL('../../supabase/migrations/20260717190000_fix_public_media_budget_reserved_bytes.sql', import.meta.url),
    'utf8',
  );

  assert.match(migration, /sum\(active_reservation\.reserved_bytes\)/);
  assert.doesNotMatch(migration, /sum\(reserved_bytes\)/);
});
