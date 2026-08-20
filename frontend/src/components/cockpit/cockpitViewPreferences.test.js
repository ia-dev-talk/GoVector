import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COCKPIT_VIEW_PRESETS,
  DEFAULT_COCKPIT_VIEW,
  applyCockpitPreset,
  canRetryCockpitPreferenceSync,
  cockpitViewFingerprint,
  createCockpitPreferenceSaveQueue,
  detectCockpitPreset,
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

function createUncoordinatedFallback() {
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

function intentRank(token) {
  const [clock, sequence] = String(token).split(':');
  return [Number(clock), Number(sequence)];
}

function compareIntentRank(left, right) {
  const [leftClock, leftSequence] = intentRank(left);
  const [rightClock, rightSequence] = intentRank(right);
  return leftClock - rightClock || leftSequence - rightSequence;
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


test('exposes distinct business presets backed only by supported cockpit blocks', () => {
  assert.deepEqual(Object.keys(COCKPIT_VIEW_PRESETS), [
    'admin',
    'dispatch',
    'supervision',
    'direction',
    'stock',
    'secteurs',
  ]);

  const fingerprints = Object.values(COCKPIT_VIEW_PRESETS).map((preset) => (
    cockpitViewFingerprint(preset.view)
  ));
  assert.equal(new Set(fingerprints).size, fingerprints.length);

  for (const preset of Object.values(COCKPIT_VIEW_PRESETS)) {
    assert.ok(preset.label);
    assert.ok(preset.description);
    assert.deepEqual(
      Object.keys(normalizeCockpitView(preset.view)),
      Object.keys(DEFAULT_COCKPIT_VIEW),
    );
  }

  const defaultPreset = detectCockpitPreset(DEFAULT_COCKPIT_VIEW);
  assert.equal(defaultPreset, 'admin');
  assert.notEqual(
    COCKPIT_VIEW_PRESETS[defaultPreset].label,
    'Admin',
    'La vue complète ne doit pas revendiquer un rôle ADMIN pour un utilisateur non-admin',
  );
});


test('applies and detects a cockpit business preset deterministically', () => {
  const dispatch = applyCockpitPreset('dispatch');

  assert.equal(dispatch.metrics, true);
  assert.equal(dispatch.decisions, true);
  assert.equal(dispatch.capacity, true);
  assert.equal(dispatch.quality, false);
  assert.equal(detectCockpitPreset(dispatch), 'dispatch');
  assert.equal(detectCockpitPreset({ ...dispatch, activity: false }), null);
  assert.deepEqual(applyCockpitPreset('unknown'), { ...DEFAULT_COCKPIT_VIEW });
});


test('offers preference retry only for an hydrated view after a sync error', () => {
  assert.equal(
    canRetryCockpitPreferenceSync({ syncState: 'error', hydrated: true }),
    true,
  );
  assert.equal(
    canRetryCockpitPreferenceSync({ syncState: 'error', hydrated: false }),
    false,
  );
  assert.equal(
    canRetryCockpitPreferenceSync({ syncState: 'saving', hydrated: true }),
    false,
  );
  assert.equal(
    canRetryCockpitPreferenceSync({ syncState: 'saved', hydrated: true }),
    false,
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
      resolvers.push(() => resolve(payload.view));
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
  assert.equal(calls[0].view.metrics, false);
  assert.match(calls[0].client_intent, /^\d+:\d+:/);
  assert.equal(queue.pending, 2);

  resolvers[0]();
  await first;
  await waitFor(
    () => calls.length === 2,
    'La seconde sauvegarde Cockpit ne démarre pas après la première',
  );
  assert.equal(calls[1].view.metrics, true);
  assert.ok(compareIntentRank(calls[1].client_intent, calls[0].client_intent) > 0);
  assert.deepEqual(saved, []);

  resolvers[1]();
  await second;

  assert.equal(saved.length, 1);
  assert.equal(saved[0].metrics, true);
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
          persisted = payload.view;
          resolve(payload.view);
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
      persisted = payload.view;
      return payload.view;
    },
    onLatestSaved: () => acknowledgements.push('second'),
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].view.metrics, false);

  firstResolvers[0]();
  await first;
  await second;

  assert.equal(calls.length, 2);
  assert.equal(calls[1][1].view.metrics, true);
  assert.deepEqual(persisted, normalizeCockpitView({ metrics: true }));
  assert.deepEqual(acknowledgements, ['second']);
  assert.equal(firstQueue.pending, 0);
  assert.equal(secondQueue.pending, 0);
});


test('server intent ordering protects the newest view when locks and storage coordination are unavailable', async () => {
  const firstQueue = createCockpitPreferenceSaveQueue({
    coordinator: createUncoordinatedFallback(),
  });
  const secondQueue = createCockpitPreferenceSaveQueue({
    coordinator: createUncoordinatedFallback(),
  });
  let releaseFirst;
  let persisted = null;
  let persistedIntent = null;
  const errors = [];

  const serverCommit = (request) => {
    if (
      persistedIntent &&
      compareIntentRank(request.client_intent, persistedIntent) <= 0
    ) {
      const error = new Error('stale cockpit intent');
      error.status = 409;
      throw error;
    }
    persistedIntent = request.client_intent;
    persisted = request.view;
    return request.view;
  };

  const first = enqueueCockpitPreferenceSave(firstQueue, {
    payload: { metrics: false },
    save: (request) => new Promise((resolve, reject) => {
      releaseFirst = () => {
        try {
          resolve(serverCommit(request));
        } catch (error) {
          reject(error);
        }
      };
    }),
    onLatestError: (error) => errors.push(error),
  });

  await waitFor(
    () => typeof releaseFirst === 'function',
    'La première écriture concurrente ne démarre pas',
  );

  const second = enqueueCockpitPreferenceSave(secondQueue, {
    payload: { metrics: true },
    save: async (request) => serverCommit(request),
  });

  await second;
  releaseFirst();
  await first;

  assert.equal(persisted.metrics, true);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].status, 409);
  assert.equal(firstQueue.pending, 0);
  assert.equal(secondQueue.pending, 0);
});
