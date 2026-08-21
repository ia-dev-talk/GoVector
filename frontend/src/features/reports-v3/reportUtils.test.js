import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reportScopesMatch,
  resolveReportSnapshot,
} from './reportSnapshot.js';
import { buildAnalytics } from './reportUtils.js';

const gpsQuality = (job) => buildAnalytics([job]).quality.find(
  (metric) => metric.key === 'gps',
).value;

function fulfilled(data) {
  return { status: 'fulfilled', value: { data } };
}

function rejected(message) {
  return { status: 'rejected', reason: new Error(message) };
}

test('missing coordinates are not counted as GPS', () => {
  assert.equal(gpsQuality({ latitude: null, longitude: null }), 0);
  assert.equal(gpsQuality({}), 0);
});

test('zero placeholder coordinates are not counted as GPS', () => {
  assert.equal(gpsQuality({ latitude: 0, longitude: 0 }), 0);
});

test('valid coordinates are counted as GPS', () => {
  assert.equal(gpsQuality({ latitude: 33.5731, longitude: -7.5898 }), 100);
});

test('invalid coordinate ranges are rejected', () => {
  assert.equal(gpsQuality({ latitude: 95, longitude: -7.5898 }), 0);
  assert.equal(gpsQuality({ latitude: 33.5731, longitude: 200 }), 0);
});

test('report snapshot is published only when all critical slices are valid', () => {
  const result = resolveReportSnapshot([
    fulfilled([{ id: 1 }, { id: 2 }]),
    fulfilled([{ id: 3 }]),
    fulfilled({ total: 4, available: 2 }),
  ], { limit: 2 });

  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshot.jobs.map((job) => job.id), [1, 2]);
  assert.deepEqual(result.snapshot.previousJobs.map((job) => job.id), [3]);
  assert.equal(result.snapshot.technicians.total, 4);
  assert.equal(result.snapshot.resultLimitReached, true);
});

test('failed comparison never becomes an artificial empty previous period', () => {
  const result = resolveReportSnapshot([
    fulfilled([{ id: 10 }]),
    rejected('comparison offline'),
    fulfilled({ total: 3 }),
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.snapshot, null);
  assert.match(result.errors.join(' '), /comparison offline/i);
});

test('failed technician summary cannot mix with a newer jobs generation', () => {
  const result = resolveReportSnapshot([
    fulfilled([{ id: 20 }]),
    fulfilled([{ id: 19 }]),
    rejected('technicians offline'),
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.snapshot, null);
  assert.match(result.errors.join(' '), /technicians offline/i);
});

test('failed current jobs cannot advance the report snapshot', () => {
  const result = resolveReportSnapshot([
    rejected('jobs offline'),
    fulfilled([{ id: 30 }]),
    fulfilled({ total: 5 }),
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.snapshot, null);
  assert.match(result.errors.join(' '), /jobs offline/i);
});

test('report scope matching is based on the displayed civil date range', () => {
  const requested = {
    start: new Date(2026, 7, 21),
    end: new Date(2026, 7, 21),
  };
  const same = {
    start: new Date(2026, 7, 21, 18, 30),
    end: new Date(2026, 7, 21, 23, 59),
  };
  const different = {
    start: new Date(2026, 7, 1),
    end: new Date(2026, 7, 21),
  };

  assert.equal(reportScopesMatch(requested, same), true);
  assert.equal(reportScopesMatch(requested, different), false);
});
