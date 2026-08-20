import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cockpitPreferenceRetryMode,
  reconcileCockpitHydration,
} from './cockpitPreferenceHydration.js';
import {
  DEFAULT_COCKPIT_ORDER,
  DEFAULT_COCKPIT_VIEW,
} from './cockpitViewPreferences.js';

const REMOTE_LAYOUT = {
  view: {
    ...DEFAULT_COCKPIT_VIEW,
    activity: false,
  },
  order: [
    'metrics',
    'decisions',
    'progression',
    'capacity',
    'quality',
    'activity',
    'quickAccess',
  ],
};

const LOCAL_LAYOUT = {
  view: {
    ...DEFAULT_COCKPIT_VIEW,
    quality: false,
  },
  order: [
    'metrics',
    'quality',
    'progression',
    'decisions',
    'capacity',
    'activity',
    'quickAccess',
  ],
};

test('clean hydration adopts the server layout without scheduling a rewrite', () => {
  const result = reconcileCockpitHydration({
    remoteLayout: REMOTE_LAYOUT,
    localLayout: {
      view: DEFAULT_COCKPIT_VIEW,
      order: DEFAULT_COCKPIT_ORDER,
    },
    locallyModified: false,
  });

  assert.deepEqual(result.layout, REMOTE_LAYOUT);
  assert.equal(result.shouldPersistLocal, false);
});

test('retry after initial load failure preserves local edits and schedules persistence', () => {
  const result = reconcileCockpitHydration({
    remoteLayout: REMOTE_LAYOUT,
    localLayout: LOCAL_LAYOUT,
    locallyModified: true,
  });

  assert.deepEqual(result.layout, LOCAL_LAYOUT);
  assert.equal(result.shouldPersistLocal, true);
});

test('retry after load failure does not create a redundant PUT when local layout already matches server', () => {
  const result = reconcileCockpitHydration({
    remoteLayout: REMOTE_LAYOUT,
    localLayout: REMOTE_LAYOUT,
    locallyModified: true,
  });

  assert.deepEqual(result.layout, REMOTE_LAYOUT);
  assert.equal(result.shouldPersistLocal, false);
});

test('retry mode distinguishes initial hydration failure from save failure', () => {
  assert.equal(
    cockpitPreferenceRetryMode({ syncState: 'load-error', hydrated: false }),
    'hydrate',
  );
  assert.equal(
    cockpitPreferenceRetryMode({ syncState: 'error', hydrated: true }),
    'save',
  );
  assert.equal(
    cockpitPreferenceRetryMode({ syncState: 'saving', hydrated: true }),
    null,
  );
});
