import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveReportPeriodSelection } from './reportPeriodSelection.js';
import { localDateKey } from './reportUtils.js';

const now = new Date(2026, 7, 21, 12, 0, 0);

test('resolveReportPeriodSelection conserve les presets existants', () => {
  const result = resolveReportPeriodSelection({ period: 'today', now });
  assert.equal(result.ok, true);
  assert.equal(localDateKey(result.range.start), '2026-08-21');
  assert.equal(localDateKey(result.range.end), '2026-08-21');
});

test('resolveReportPeriodSelection accepte un jour exact', () => {
  const result = resolveReportPeriodSelection({
    period: 'exact',
    exactDate: '2026-08-12',
    now,
  });
  assert.equal(result.ok, true);
  assert.equal(localDateKey(result.range.start), '2026-08-12');
  assert.equal(localDateKey(result.range.end), '2026-08-12');
});

test('resolveReportPeriodSelection refuse un jour civil impossible', () => {
  const result = resolveReportPeriodSelection({
    period: 'exact',
    exactDate: '2026-02-31',
    now,
  });
  assert.equal(result.ok, false);
  assert.equal(result.range, null);
});

test('resolveReportPeriodSelection accepte une période personnalisée inclusive', () => {
  const result = resolveReportPeriodSelection({
    period: 'custom',
    customStart: '2026-08-01',
    customEnd: '2026-08-21',
    now,
  });
  assert.equal(result.ok, true);
  assert.equal(localDateKey(result.range.start), '2026-08-01');
  assert.equal(localDateKey(result.range.end), '2026-08-21');
});

test('resolveReportPeriodSelection refuse une période inversée ou incomplète', () => {
  const inverted = resolveReportPeriodSelection({
    period: 'custom',
    customStart: '2026-08-21',
    customEnd: '2026-08-01',
    now,
  });
  const incomplete = resolveReportPeriodSelection({
    period: 'custom',
    customStart: '2026-08-01',
    customEnd: '',
    now,
  });
  assert.equal(inverted.ok, false);
  assert.match(inverted.error, /antérieure ou égale/);
  assert.equal(incomplete.ok, false);
  assert.match(incomplete.error, /date de début et une date de fin/);
});
