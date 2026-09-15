import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInterventionPeriod,
  interventionDateSpan,
  isValidInterventionPeriod,
} from './intervention-period.js';

const ANCHOR = new Date(2026, 8, 14, 12, 0, 0);

test('keeps today as a one-day operational scope', () => {
  assert.deepEqual(buildInterventionPeriod('today', ANCHOR), {
    from: '2026-09-14',
    to: '2026-09-14',
    scope: 'today',
  });
});

test('builds future week, month, next month and year scopes', () => {
  assert.deepEqual(buildInterventionPeriod('week', ANCHOR), {
    from: '2026-09-14',
    to: '2026-09-20',
    scope: 'week',
  });
  assert.deepEqual(buildInterventionPeriod('month', ANCHOR), {
    from: '2026-09-01',
    to: '2026-09-30',
    scope: 'month',
  });
  assert.deepEqual(buildInterventionPeriod('next_month', ANCHOR), {
    from: '2026-10-01',
    to: '2026-10-31',
    scope: 'next_month',
  });
  assert.deepEqual(buildInterventionPeriod('year', ANCHOR), {
    from: '2026-01-01',
    to: '2026-12-31',
    scope: 'year',
  });
});

test('accepts an ordered custom period and rejects a reversed one', () => {
  assert.equal(isValidInterventionPeriod('2026-09-14', '2026-10-03'), true);
  assert.equal(isValidInterventionPeriod('2026-10-03', '2026-09-14'), false);
});

test('reports the real date span of an imported multi-date lot', () => {
  assert.deepEqual(interventionDateSpan([
    { scheduled_date: '2026-09-14T15:00:00+00:00' },
    { scheduled_date: '2026-09-14T09:53:00+00:00' },
    { scheduled_date: '2026-09-15T15:00:00+00:00' },
    { scheduled_date: null },
  ]), {
    first: '2026-09-14',
    last: '2026-09-15',
    distinctDates: 2,
  });
});
