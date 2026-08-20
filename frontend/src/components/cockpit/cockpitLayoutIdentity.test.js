import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cockpitLayoutFingerprint,
  normalizeCockpitLayout,
} from './cockpitLayoutIdentity.js';
import {
  DEFAULT_COCKPIT_ORDER,
  DEFAULT_COCKPIT_VIEW,
} from './cockpitViewPreferences.js';


test('normalizes cockpit layout as visibility plus complete block order', () => {
  assert.deepEqual(
    normalizeCockpitLayout({
      view: { metrics: false },
      order: ['quality', 'metrics', 'quality', 'unknown'],
    }),
    {
      view: {
        ...DEFAULT_COCKPIT_VIEW,
        metrics: false,
      },
      order: [
        'quality',
        'metrics',
        'progression',
        'decisions',
        'capacity',
        'activity',
        'quickAccess',
      ],
    },
  );
});


test('layout fingerprint changes when only block order changes', () => {
  const view = { ...DEFAULT_COCKPIT_VIEW };
  const orderA = [...DEFAULT_COCKPIT_ORDER];
  const orderB = [
    'quality',
    'metrics',
    'progression',
    'decisions',
    'capacity',
    'activity',
    'quickAccess',
  ];

  assert.notEqual(
    cockpitLayoutFingerprint({ view, order: orderA }),
    cockpitLayoutFingerprint({ view, order: orderB }),
  );
});


test('layout fingerprint is stable after normalization', () => {
  const partial = {
    view: { metrics: true },
    order: ['quality', 'metrics'],
  };

  assert.equal(
    cockpitLayoutFingerprint(partial),
    cockpitLayoutFingerprint(normalizeCockpitLayout(partial)),
  );
});
