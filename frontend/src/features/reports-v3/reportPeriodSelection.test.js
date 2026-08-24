import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { civilDateKeyInTimeZone } from './operationalTime.js';
import { resolveReportPeriodSelection } from './reportPeriodSelection.js';
import { localDateKey } from './reportUtils.js';

const now = new Date(2026, 7, 21, 12, 0, 0);

test('resolveReportPeriodSelection conserve les presets existants', () => {
  const result = resolveReportPeriodSelection({
    period: 'today',
    now,
    timeZone: 'Africa/Casablanca',
  });
  assert.equal(result.ok, true);
  assert.equal(localDateKey(result.range.start), '2026-08-21');
  assert.equal(localDateKey(result.range.end), '2026-08-21');
});

test('same instant keeps the organization civil day independent from browser timezone', () => {
  const instant = new Date('2026-08-21T23:30:00.000Z');
  const casablanca = resolveReportPeriodSelection({
    period: 'today',
    now: instant,
    timeZone: 'Africa/Casablanca',
  });
  const newYorkBrowserUsingSameOrganization = resolveReportPeriodSelection({
    period: 'today',
    now: instant,
    timeZone: 'Africa/Casablanca',
  });

  assert.equal(localDateKey(casablanca.range.start), '2026-08-22');
  assert.equal(
    localDateKey(newYorkBrowserUsingSameOrganization.range.start),
    '2026-08-22',
  );
});

test('operational date key seeds exact and custom defaults on the same civil day', () => {
  const instant = new Date('2026-08-21T23:30:00.000Z');
  const operationalDefault = civilDateKeyInTimeZone(
    instant,
    'Africa/Casablanca',
  );

  assert.equal(operationalDefault, '2026-08-22');
  assert.equal(
    civilDateKeyInTimeZone(instant, 'America/New_York'),
    '2026-08-21',
  );

  const exact = resolveReportPeriodSelection({
    period: 'exact',
    exactDate: operationalDefault,
  });
  const custom = resolveReportPeriodSelection({
    period: 'custom',
    customStart: operationalDefault,
    customEnd: operationalDefault,
  });

  assert.equal(localDateKey(exact.range.start), '2026-08-22');
  assert.equal(localDateKey(custom.range.start), '2026-08-22');
  assert.equal(localDateKey(custom.range.end), '2026-08-22');
});

test('operational midnight controls today instead of the observer timezone', () => {
  const beforeMidnight = resolveReportPeriodSelection({
    period: 'today',
    now: new Date('2026-08-21T22:59:59.000Z'),
    timeZone: 'Africa/Casablanca',
  });
  const afterMidnight = resolveReportPeriodSelection({
    period: 'today',
    now: new Date('2026-08-21T23:00:01.000Z'),
    timeZone: 'Africa/Casablanca',
  });

  assert.equal(localDateKey(beforeMidnight.range.start), '2026-08-21');
  assert.equal(localDateKey(afterMidnight.range.start), '2026-08-22');
});

test('cockpit uses the same operational day for API scope and visible date', () => {
  const instant = new Date('2026-08-21T23:30:00.000Z');
  const operationalDay = civilDateKeyInTimeZone(
    instant,
    'Africa/Casablanca',
  );
  const observerDay = civilDateKeyInTimeZone(
    instant,
    'America/New_York',
  );

  assert.equal(operationalDay, '2026-08-22');
  assert.equal(observerDay, '2026-08-21');

  const dashboardSource = readFileSync(
    new URL('../../pages/DashboardHome.jsx', import.meta.url),
    'utf8',
  );

  assert.match(
    dashboardSource,
    /const date = civilDateKeyInTimeZone\(new Date\(\), OPERATIONAL_TIME_ZONE\);/,
  );
  assert.match(
    dashboardSource,
    /api\.getJobs\(\{ scheduled_date: date \}\)/,
  );
  assert.match(
    dashboardSource,
    /currentDate=\{currentOperationalDate\(\)\}/,
  );
  assert.match(
    dashboardSource,
    /timeZone: OPERATIONAL_TIME_ZONE/,
  );
  assert.match(
    dashboardSource,
    /setLastSync\(formatClock\(new Date\(\), \{ includeZone: true \}\)\)/,
  );
});

test('cockpit operational day flips exactly at Casablanca midnight', () => {
  const beforeMidnight = new Date('2026-08-21T22:59:59.999Z');
  const afterMidnight = new Date('2026-08-21T23:00:00.001Z');

  assert.equal(
    civilDateKeyInTimeZone(beforeMidnight, 'Africa/Casablanca'),
    '2026-08-21',
  );
  assert.equal(
    civilDateKeyInTimeZone(afterMidnight, 'Africa/Casablanca'),
    '2026-08-22',
  );
});

test('resolveReportPeriodSelection accepte un jour exact sans conversion de fuseau', () => {
  const result = resolveReportPeriodSelection({
    period: 'exact',
    exactDate: '2026-08-12',
    now,
    timeZone: 'America/New_York',
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
    timeZone: 'Asia/Tokyo',
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
