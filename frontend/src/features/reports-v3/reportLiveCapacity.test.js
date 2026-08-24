import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const overviewSource = readFileSync(new URL('./ReportsOverview.jsx', import.meta.url), 'utf8');
const rapportsPageSource = readFileSync(new URL('../../pages/RapportsPage.jsx', import.meta.url), 'utf8');

test('live technician capacity is isolated from analytical period metrics', () => {
  const analyticsPanelStart = overviewSource.indexOf('<article className="rv3-panel rv3-status-panel">');
  const liveContextStart = overviewSource.indexOf('aria-label="Contexte live hors périmètre analytique"');
  const activeCapacityStart = overviewSource.indexOf('Techniciens actifs maintenant');

  assert.ok(analyticsPanelStart >= 0, 'status analytics panel should exist');
  assert.ok(liveContextStart > analyticsPanelStart, 'live context must be a separate panel after analytics');
  assert.ok(activeCapacityStart > liveContextStart, 'current technician capacity must live inside the live context');

  const analyticalStatusPanel = overviewSource.slice(analyticsPanelStart, liveContextStart);
  assert.equal(
    analyticalStatusPanel.includes('Techniciens actifs maintenant'),
    false,
    'current technician capacity must not be rendered inside filtered/historical status analytics',
  );
  assert.match(overviewSource, /Contexte live/);
  assert.match(overviewSource, /Cette capacité n’est pas filtrée par la période ni les filtres analytiques\./);
});

test('report scope cleanup cancels a pending realtime debounce before invalidating requests', () => {
  const intervalStart = rapportsPageSource.indexOf('const interval = liveRelevant && periodSelection.ok');
  const scheduleStart = rapportsPageSource.indexOf('const scheduleRealtimeRefresh', intervalStart);

  assert.ok(intervalStart >= 0, 'report scope refresh effect should exist');
  assert.ok(scheduleStart > intervalStart, 'realtime scheduling should follow the scope refresh effect');

  const scopeCleanup = rapportsPageSource.slice(intervalStart, scheduleStart);
  const clearPendingTimer = scopeCleanup.indexOf('window.clearTimeout(realtimeTimerRef.current)');
  const clearTimerRef = scopeCleanup.indexOf('realtimeTimerRef.current = null');
  const invalidateRequests = scopeCleanup.indexOf('requestRef.current += 1');

  assert.ok(clearPendingTimer >= 0, 'scope cleanup must cancel a pending realtime debounce');
  assert.ok(clearTimerRef > clearPendingTimer, 'scope cleanup must clear the realtime timer ref');
  assert.ok(
    invalidateRequests > clearTimerRef,
    'the stale realtime callback must be cancelled before the previous scope requests are invalidated',
  );
});
