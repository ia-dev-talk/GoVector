import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const headerSource = readFileSync(
  new URL('./ReportsHeader.jsx', import.meta.url),
  'utf8',
);

const pageSource = readFileSync(
  new URL('../../pages/RapportsPage.jsx', import.meta.url),
  'utf8',
);

test('Magillan export has one action backed by the canonical report scope', () => {
  assert.ok(headerSource.includes('onClick={onMagillan}'));
  assert.ok(headerSource.includes("'Rapport Magillan'"));
  assert.ok(!headerSource.includes('apiClient.post('));

  assert.ok(pageSource.includes('{ filters: exportScopeFilters }'));
  assert.ok(pageSource.includes('onMagillan={generateMagillanReport}'));
  assert.equal((pageSource.match(/rv3-magillan-button/g) || []).length, 0);
});
