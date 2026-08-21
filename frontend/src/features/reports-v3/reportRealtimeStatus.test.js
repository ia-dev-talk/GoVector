import assert from 'node:assert/strict';
import test from 'node:test';

import {
  reportIncludesCivilDate,
  resolveReportRealtimeStatus,
} from './reportRealtimeStatus.js';

const now = new Date(2026, 7, 21, 13, 15);

function range(startDay, endDay = startDay) {
  return {
    start: new Date(2026, 7, startDay),
    end: new Date(2026, 7, endDay, 23, 59),
  };
}

test('today scope exposes realtime only when the live channel is connected', () => {
  assert.deepEqual(resolveReportRealtimeStatus(range(21), true, now), {
    label: 'TEMPS RÉEL',
    tone: 'connected',
    liveRelevant: true,
  });

  assert.deepEqual(resolveReportRealtimeStatus(range(21), false, now), {
    label: 'TEMPS RÉEL INDISPONIBLE',
    tone: 'reconnecting',
    liveRelevant: true,
  });
});

test('historical scopes never claim realtime even when websocket is connected', () => {
  assert.deepEqual(resolveReportRealtimeStatus(range(20), true, now), {
    label: 'VUE HISTORIQUE',
    tone: 'neutral',
    liveRelevant: false,
  });

  assert.deepEqual(resolveReportRealtimeStatus(range(1, 15), true, now), {
    label: 'VUE HISTORIQUE',
    tone: 'neutral',
    liveRelevant: false,
  });
});

test('a range containing today stays eligible for realtime', () => {
  assert.equal(reportIncludesCivilDate(range(1, 21), now), true);
  assert.equal(resolveReportRealtimeStatus(range(1, 21), true, now).label, 'TEMPS RÉEL');
});

test('future and invalid ranges use neutral non-live labels', () => {
  assert.deepEqual(resolveReportRealtimeStatus(range(22, 25), true, now), {
    label: 'PÉRIODE FUTURE',
    tone: 'neutral',
    liveRelevant: false,
  });

  assert.deepEqual(resolveReportRealtimeStatus({
    start: new Date(2026, 7, 25),
    end: new Date(2026, 7, 22),
  }, true, now), {
    label: 'HORS TEMPS RÉEL',
    tone: 'neutral',
    liveRelevant: false,
  });
});
