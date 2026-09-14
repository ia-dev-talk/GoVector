import { describe, expect, it } from 'vitest';

import {
  buildInterventionPeriod,
  interventionDateSpan,
  isValidInterventionPeriod,
} from './intervention-period.js';

const ANCHOR = new Date(2026, 8, 14, 12, 0, 0);

describe('intervention period ranges', () => {
  it('keeps today as a one-day operational scope', () => {
    expect(buildInterventionPeriod('today', ANCHOR)).toEqual({
      from: '2026-09-14',
      to: '2026-09-14',
      scope: 'today',
    });
  });

  it('builds future week, month, next month and year scopes', () => {
    expect(buildInterventionPeriod('week', ANCHOR)).toMatchObject({
      from: '2026-09-14',
      to: '2026-09-20',
    });
    expect(buildInterventionPeriod('month', ANCHOR)).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(buildInterventionPeriod('next_month', ANCHOR)).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(buildInterventionPeriod('year', ANCHOR)).toMatchObject({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('accepts an ordered custom period and rejects a reversed one', () => {
    expect(isValidInterventionPeriod('2026-09-14', '2026-10-03')).toBe(true);
    expect(isValidInterventionPeriod('2026-10-03', '2026-09-14')).toBe(false);
  });

  it('reports the real date span of an imported multi-date lot', () => {
    expect(interventionDateSpan([
      { scheduled_date: '2026-09-14T15:00:00+00:00' },
      { scheduled_date: '2026-09-14T09:53:00+00:00' },
      { scheduled_date: '2026-09-15T15:00:00+00:00' },
      { scheduled_date: null },
    ])).toEqual({
      first: '2026-09-14',
      last: '2026-09-15',
      distinctDates: 2,
    });
  });
});
