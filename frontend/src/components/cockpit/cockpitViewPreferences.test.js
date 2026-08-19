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

  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(calls, [{ metrics: false }]);
  assert.equal(queue.pending, 2);

  resolvers[0]();
  await first;
  await Promise.resolve();
  assert.deepEqual(calls, [{ metrics: false }, { metrics: true }]);
  assert.deepEqual(saved, []);

  resolvers[1]();
  await second;

  assert.deepEqual(saved, [{ metrics: true }]);
  assert.equal(queue.pending, 0);
});
