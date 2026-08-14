import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDailySeries,
  linearRegression,
  trendExplanation,
} from './reportTrendUtils.js';


test('linear regression detects an increasing trend', () => {
  const trend = linearRegression([
    { total: 1 },
    { total: 2 },
    { total: 3 },
    { total: 4 },
  ]);

  assert.equal(trend.direction, 'up');
  assert.equal(trend.slope, 1);
  assert.equal(trend.r2, 1);
});


test('linear regression treats constant series as stable', () => {
  const trend = linearRegression([
    { total: 3 },
    { total: 3 },
    { total: 3 },
  ]);

  assert.equal(trend.direction, 'stable');
  assert.equal(trend.slope, 0);
  assert.equal(trend.r2, 1);
});


test('daily series keeps empty days and classifies terminal outcomes', () => {
  const range = {
    start: new Date(2026, 7, 10),
    end: new Date(2026, 7, 12),
  };
  const series = buildDailySeries([
    { scheduled_date: '2026-08-10', status: 'COMPLETED' },
    { scheduled_date: '2026-08-10', status: 'FAILED' },
    { scheduled_date: '2026-08-12', status: 'COMPLETED' },
  ], range);

  assert.equal(series.length, 3);
  assert.equal(series[0].total, 2);
  assert.equal(series[0].successRate, 50);
  assert.equal(series[1].total, 0);
  assert.equal(series[1].successRate, null);
  assert.equal(series[2].completed, 1);
});


test('daily workload stays on the planned day when completion happens later', () => {
  const range = {
    start: new Date(2026, 7, 10),
    end: new Date(2026, 7, 12),
  };
  const series = buildDailySeries([
    {
      scheduled_date: '2026-08-10',
      completed_at: '2026-08-11T17:30:00Z',
      status: 'COMPLETED',
    },
  ], range);

  assert.equal(series[0].total, 1);
  assert.equal(series[0].completed, 1);
  assert.equal(series[1].total, 0);
});


test('daily series falls back to completion date when no planned date exists', () => {
  const range = {
    start: new Date(2026, 7, 10),
    end: new Date(2026, 7, 12),
  };
  const series = buildDailySeries([
    {
      completed_at: '2026-08-11T09:00:00',
      status: 'COMPLETED',
    },
  ], range);

  assert.equal(series[0].total, 0);
  assert.equal(series[1].total, 1);
  assert.equal(series[1].completed, 1);
});


test('trend explanation describes the estimated daily movement', () => {
  const message = trendExplanation({
    slope: -1.25,
    sampleSize: 5,
    direction: 'down',
  }, 'volume');

  assert.match(message, /diminue/);
  assert.match(message, /1,25/);
});
