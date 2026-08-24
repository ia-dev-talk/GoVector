import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCockpitPreferenceSaveQueue,
  enqueueCockpitPreferenceSave,
} from './cockpitViewPreferences.js';

function createUncoordinatedCoordinator() {
  return {
    publishIntent() {},
    isLatestIntent() {
      return true;
    },
    withLock(run) {
      return Promise.resolve().then(run);
    },
  };
}

test('workspace layout payload preserves hidden blocks and order in the PUT contract', async () => {
  const queue = createCockpitPreferenceSaveQueue({
    coordinator: createUncoordinatedCoordinator(),
  });
  let request = null;

  await enqueueCockpitPreferenceSave(queue, {
    payload: {
      view: {
        metrics: true,
        progression: true,
        decisions: true,
        capacity: true,
        quality: false,
        activity: false,
        quickAccess: true,
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
    save: async (payload) => {
      request = payload;
      return { ...payload.view, order: payload.order };
    },
  });

  assert.equal(request.view.quality, false);
  assert.equal(request.view.activity, false);
  assert.equal(request.view.metrics, true);
  assert.deepEqual(request.order, [
    'quality',
    'metrics',
    'progression',
    'decisions',
    'capacity',
    'activity',
    'quickAccess',
  ]);
  assert.match(request.client_intent, /^\d+:\d+:/);
});

test('legacy flat visibility payload remains supported by the save queue', async () => {
  const queue = createCockpitPreferenceSaveQueue({
    coordinator: createUncoordinatedCoordinator(),
  });
  let request = null;

  await enqueueCockpitPreferenceSave(queue, {
    payload: { metrics: false, activity: false },
    save: async (payload) => {
      request = payload;
      return payload.view;
    },
  });

  assert.equal(request.view.metrics, false);
  assert.equal(request.view.activity, false);
  assert.equal(request.view.progression, true);
  assert.equal('order' in request, false);
});
