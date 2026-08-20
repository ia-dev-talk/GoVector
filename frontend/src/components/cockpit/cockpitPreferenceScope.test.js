import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createBrowserPreferenceCoordinator,
  resolveCockpitPreferenceScope,
} from './cockpitViewPreferences.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
}


test('resolves cockpit coordination scope from the authenticated user id', () => {
  const storage = createStorage({
    user: JSON.stringify({ id: 42, role: 'ORIENTEUR' }),
  });

  assert.equal(resolveCockpitPreferenceScope({ storage }), 'user:42');
  assert.equal(
    resolveCockpitPreferenceScope({ storage: createStorage({ user: '{broken' }) }),
    '',
  );
});


test('keeps cockpit intents isolated between authenticated users on the same origin', () => {
  const storage = createStorage();
  const userA = createBrowserPreferenceCoordinator({
    scope: 'user:10',
    storage,
  });
  const userB = createBrowserPreferenceCoordinator({
    scope: 'user:20',
    storage,
  });

  userA.publishIntent('a1');
  userB.publishIntent('b1');

  assert.equal(userA.isLatestIntent('a1'), true);
  assert.equal(userB.isLatestIntent('b1'), true);

  userA.publishIntent('a2');

  assert.equal(userA.isLatestIntent('a1'), false);
  assert.equal(userA.isLatestIntent('a2'), true);
  assert.equal(userB.isLatestIntent('b1'), true);
});


test('a new login does not inherit the previous user cockpit intent', () => {
  const storage = createStorage();
  const firstSession = createBrowserPreferenceCoordinator({
    scope: 'user:7',
    storage,
  });
  firstSession.publishIntent('first-user-intent');

  const secondSession = createBrowserPreferenceCoordinator({
    scope: 'user:8',
    storage,
  });

  assert.equal(secondSession.isLatestIntent('second-user-intent'), true);
  secondSession.publishIntent('second-user-intent');
  assert.equal(secondSession.isLatestIntent('second-user-intent'), true);
  assert.equal(firstSession.isLatestIntent('first-user-intent'), true);
});


test('missing identity fails open locally without creating a shared global intent', async () => {
  const storage = createStorage();
  const anonymous = createBrowserPreferenceCoordinator({ storage });

  anonymous.publishIntent('anonymous-intent');

  assert.equal(anonymous.isLatestIntent('anything'), true);
  assert.equal(await anonymous.withLock(async () => 'ok'), 'ok');
});
