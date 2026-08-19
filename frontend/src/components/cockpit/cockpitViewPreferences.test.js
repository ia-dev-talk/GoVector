import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_COCKPIT_VIEW,
  cockpitViewFingerprint,
  createCockpitPreferenceSaveQueue,
  enqueueCockpitPreferenceSave,
  normalizeCockpitView,
  toggleCockpitSection,
} from './cockpitViewPreferences.js';

async function waitFor(predicate, message) {
  const timeoutAt = Date.now() + 1000;

  while (!predicate()) {
    if (Date.now() >= timeoutAt) {
      assert.fail(message);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function createSharedCoordinator() {
  let latestIntent = '';
  let lockTail = Promise.resolve();

  return {
    publishIntent(token) {
      latestIntent = token;
    },
    isLatestIntent(token) {
      return latestIntent === token;
    },
    withLock(run) {
      const execution = Promise.resolve(lockTail)
        .catch(() => undefined)
        .then(run);
      lockTail = execution.catch(() => undefined);
      return execution;
    },
  };
}


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


test('serializes cockpit saves and only acknowledges the latest intent', async () => {
  const queue = createCockpitPreferenceSaveQueue();
  const resolvers = [];
  const saved = [];
  const calls = [];

  const save = (payload) => {
    calls.push(payload);
    return new Promise((resolve) => {
      resolvers.push(() => resolve(payload));
    });
  };

  const first = enqueueCockpitPreferenceSave(queue, {
    payload: { metrics: false },
    save,
    onLatestSaved: (value) => saved.push(value),
  });
  const second = enqueueCockpitPreferenceSave(queue, {
    payload: { metrics: true },
    save,
    onLatestSaved: (value) => saved.push(value),
  });

  await waitFor(
    () => calls.length === 1,
    'La première sauvegarde Cockpit ne démarre pas',
  );
  assert.deepEqual(calls, [{ metrics: false }]);
  assert.equal(queue.pending, 2);

  resolvers[0]();
  await first;
  await waitFor(
    () => calls.length === 2,
    'La seconde sauvegarde Cockpit ne démarre pas après la première',
  );
  assert.deepEqual(calls, [{ metrics: false }, { metrics: true }]);
  assert.deepEqual(saved, []);

  resolvers[1]();
  await second;

  assert.deepEqual(saved, [{ metrics: true }]);
  assert.equal(queue.pending, 0);
});


test('shared coordination keeps a newer cockpit intent authoritative across queues', async () => {
  const coordinator = createSharedCoordinator();
  const firstQueue = createCockpitPreferenceSaveQueue({ coordinator });
  const secondQueue = createCockpitPreferenceSaveQueue({ coordinator });
  const calls = [];
  const acknowledgements = [];
  const firstResolvers = [];
  let persisted = null;

  const first = enqueueCockpitPreferenceSave(firstQueue, {
    payload: { metrics: false },
    save: (payload) => {
      calls.push(['first', payload]);
      return new Promise((resolve) => {
        firstResolvers.push(() => {
          persisted = payload;
          resolve(payload);
        });
      });
    },
    onLatestSaved: () => acknowledgements.push('first'),
  });

  await waitFor(
    () => calls.length === 1,
    'La sauvegarde de la première instance ne démarre pas',
  );

  const second = enqueueCockpitPreferenceSave(secondQueue, {
    payload: { metrics: true },
    save: async (payload) => {
      calls.push(['second', payload]);
      persisted = payload;
      return payload;
    },
    onLatestSaved: () => acknowledgements.push('second'),
  });

  assert.deepEqual(calls, [['first', { metrics: false }]]);

  firstResolvers[0]();
  await first;
  await second;

  assert.deepEqual(calls, [
    ['first', { metrics: false }],
    ['second', { metrics: true }],
  ]);
  assert.deepEqual(persisted, { metrics: true });
  assert.deepEqual(acknowledgements, ['second']);
  assert.equal(firstQueue.pending, 0);
  assert.equal(secondQueue.pending, 0);
});
