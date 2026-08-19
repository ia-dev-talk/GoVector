import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_COCKPIT_VIEW,
  cockpitViewFingerprint,
  normalizeCockpitView,
  toggleCockpitSection,
} from './cockpitViewPreferences.js';


test('normalizes partial persisted cockpit preferences', () => {
  const view = normalizeCockpitView({ metrics: false, quality: false });

  assert.equal(view.metrics, false);
  assert.equal(view.quality, false);
  assert.equal(view.progression, true);
  assert.equal(view.quickAccess, true);
});


test('recovers from an empty or corrupt cockpit configuration', () => {
  assert.deepEqual(
    normalizeCockpitView({
      metrics: false,
      progression: false,
      decisions: false,
      capacity: false,
      quality: false,
      activity: false,
      quickAccess: false,
    }),
    { ...DEFAULT_COCKPIT_VIEW },
  );
});


test('prevents hiding the final visible cockpit section', () => {
  const oneVisible = {
    metrics: true,
    progression: false,
    decisions: false,
    capacity: false,
    quality: false,
    activity: false,
    quickAccess: false,
  };

  assert.deepEqual(
    toggleCockpitSection(oneVisible, 'metrics'),
    oneVisible,
  );
});


test('fingerprint is stable after normalization', () => {
  assert.equal(
    cockpitViewFingerprint({ metrics: true }),
    cockpitViewFingerprint(normalizeCockpitView({ metrics: true })),
  );
});
