import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('./ReportsOverview.jsx', import.meta.url), 'utf8');

test('live technician capacity is isolated from analytical period metrics', () => {
  const analyticsPanelStart = source.indexOf('<article className="rv3-panel rv3-status-panel">');
  const liveContextStart = source.indexOf('aria-label="Contexte live hors périmètre analytique"');
  const activeCapacityStart = source.indexOf('Techniciens actifs maintenant');

  assert.ok(analyticsPanelStart >= 0, 'status analytics panel should exist');
  assert.ok(liveContextStart > analyticsPanelStart, 'live context must be a separate panel after analytics');
  assert.ok(activeCapacityStart > liveContextStart, 'current technician capacity must live inside the live context');

  const analyticalStatusPanel = source.slice(analyticsPanelStart, liveContextStart);
  assert.equal(
    analyticalStatusPanel.includes('Techniciens actifs maintenant'),
    false,
    'current technician capacity must not be rendered inside filtered/historical status analytics',
  );
  assert.match(source, /Contexte live/);
  assert.match(source, /Cette capacité n’est pas filtrée par la période ni les filtres analytiques\./);
});
