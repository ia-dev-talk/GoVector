import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cockpitPreferenceRevision,
  createCockpitPreferenceSaveQueue,
  enqueueCockpitPreferenceSave,
  rememberCockpitPreferenceRevision,
} from './cockpitViewPreferences.js';
import { reconcileCockpitHydration } from './cockpitPreferenceHydration.js';

function coordinator() {
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

function revisionConflict(revision) {
  const error = new Error('stale cockpit revision');
  error.response = {
    status: 409,
    data: {
      detail: {
        message: 'Le profil Cockpit a été modifié depuis votre dernière lecture.',
        revision,
      },
    },
  };
  return error;
}

test('hydrates the server revision for the authenticated preference scope', () => {
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem(key) {
      return key === 'user' ? JSON.stringify({ id: 42 }) : null;
    },
  };

  try {
    reconcileCockpitHydration({
      remoteLayout: {
        metrics: false,
        order: ['quality', 'metrics'],
        revision: 7,
      },
      localLayout: { metrics: true },
    });

    assert.equal(cockpitPreferenceRevision({ scope: 'user:42' }), 7);
  } finally {
    if (originalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalStorage;
    }
  }
});

test('uses the latest server revision for serialized saves', async () => {
  const scope = 'user:revision-chain';
  const queue = createCockpitPreferenceSaveQueue({
    scope,
    coordinator: coordinator(),
  });
  const requests = [];

  rememberCockpitPreferenceRevision(4, { scope });

  await enqueueCockpitPreferenceSave(queue, {
    payload: { metrics: false },
    save: async (request) => {
      requests.push(request);
      return { ...request.view, revision: 5 };
    },
  });
  await enqueueCockpitPreferenceSave(queue, {
    payload: { metrics: true },
    save: async (request) => {
      requests.push(request);
      return { ...request.view, revision: 6 };
    },
  });

  assert.equal(requests[0].expected_revision, 4);
  assert.equal(requests[1].expected_revision, 5);
  assert.equal(cockpitPreferenceRevision({ scope }), 6);
});

test('rebases an explicit retry on the revision returned by a 409 conflict', async () => {
  const scope = 'user:conflict-retry';
  const firstQueue = createCockpitPreferenceSaveQueue({
    scope,
    coordinator: coordinator(),
  });
  const retryQueue = createCockpitPreferenceSaveQueue({
    scope,
    coordinator: coordinator(),
  });
  const requests = [];
  const errors = [];

  rememberCockpitPreferenceRevision(10, { scope });

  await enqueueCockpitPreferenceSave(firstQueue, {
    payload: { metrics: false },
    save: async (request) => {
      requests.push(request);
      throw revisionConflict(11);
    },
    onLatestError: (error) => errors.push(error),
  });

  assert.equal(requests[0].expected_revision, 10);
  assert.equal(errors.length, 1);
  assert.equal(cockpitPreferenceRevision({ scope }), 11);

  await enqueueCockpitPreferenceSave(retryQueue, {
    payload: { metrics: false },
    save: async (request) => {
      requests.push(request);
      return { ...request.view, revision: 12 };
    },
  });

  assert.equal(requests[1].expected_revision, 11);
  assert.equal(cockpitPreferenceRevision({ scope }), 12);
});

test('revision preconditions do not depend on the client wall clock', async () => {
  const scope = 'user:clock-independent';
  const queue = createCockpitPreferenceSaveQueue({
    scope,
    coordinator: coordinator(),
  });
  let request;

  rememberCockpitPreferenceRevision(21, { scope });
  await enqueueCockpitPreferenceSave(queue, {
    payload: { quality: false },
    save: async (payload) => {
      request = payload;
      return { ...payload.view, revision: 22 };
    },
  });

  assert.equal(request.expected_revision, 21);
  assert.match(request.client_intent, /^\d+:\d+:/);
  assert.equal(cockpitPreferenceRevision({ scope }), 22);
});
