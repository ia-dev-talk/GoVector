import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reportIncludesCivilDate,
  resolveReportRealtimeStatus,
} from './reportRealtimeStatus.js';

const now = new Date(2026, 7, 21, 13, 15);

function range(startDay, endDay = startDay) {
  return {
    start: new Date(2026, 7, startDay, 12),
    end: new Date(2026, 7, endDay, 12),
  };
}

test('today scope exposes realtime only when the live channel is connected', () => {
  assert.deepEqual(
    resolveReportRealtimeStatus(range(21), true, now, 'Africa/Casablanca'),
    {
      label: 'TEMPS RÉEL',
      tone: 'connected',
      liveRelevant: true,
    },
  );

  assert.deepEqual(
    resolveReportRealtimeStatus(range(21), false, now, 'Africa/Casablanca'),
    {
      label: 'TEMPS RÉEL INDISPONIBLE',
      tone: 'reconnecting',
      liveRelevant: true,
    },
  );
});

test('historical scopes never claim realtime even when websocket is connected', () => {
  assert.deepEqual(
    resolveReportRealtimeStatus(range(20), true, now, 'Africa/Casablanca'),
    {
      label: 'VUE HISTORIQUE',
      tone: 'neutral',
      liveRelevant: false,
    },
  );

  assert.deepEqual(
    resolveReportRealtimeStatus(range(1, 15), true, now, 'Africa/Casablanca'),
    {
      label: 'VUE HISTORIQUE',
      tone: 'neutral',
      liveRelevant: false,
    },
  );
});

test('a range containing the operational day stays eligible for realtime', () => {
  assert.equal(
    reportIncludesCivilDate(range(1, 21), now, 'Africa/Casablanca'),
    true,
  );
  assert.equal(
    resolveReportRealtimeStatus(
      range(1, 21),
      true,
      now,
      'Africa/Casablanca',
    ).label,
    'TEMPS RÉEL',
  );
});

test('realtime day follows the configured operational timezone around midnight', () => {
  const instant = new Date('2026-08-21T23:30:00.000Z');

  assert.equal(
    reportIncludesCivilDate(range(22), instant, 'Africa/Casablanca'),
    true,
  );
  assert.equal(
    reportIncludesCivilDate(range(21), instant, 'Africa/Casablanca'),
    false,
  );
  assert.equal(
    reportIncludesCivilDate(range(21), instant, 'America/New_York'),
    true,
  );
});

test('future and invalid ranges use neutral non-live labels', () => {
  assert.deepEqual(
    resolveReportRealtimeStatus(range(22, 25), true, now, 'Africa/Casablanca'),
    {
      label: 'PÉRIODE FUTURE',
      tone: 'neutral',
      liveRelevant: false,
    },
  );

  assert.deepEqual(
    resolveReportRealtimeStatus({
      start: new Date(2026, 7, 25, 12),
      end: new Date(2026, 7, 22, 12),
    }, true, now, 'Africa/Casablanca'),
    {
      label: 'HORS TEMPS RÉEL',
      tone: 'neutral',
      liveRelevant: false,
    },
  );
});
