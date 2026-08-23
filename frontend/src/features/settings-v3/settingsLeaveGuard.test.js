import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSettingsGlobalLeaveControl,
  shouldGuardSettingsLeave,
} from './settingsLeaveGuard.js';

test('settings leave guard targets sidebar destinations and logout, not the active page', () => {
  assert.equal(
    isSettingsGlobalLeaveControl({
      className: 'sidebar-nav-item',
      ariaCurrent: '',
    }),
    true,
  );
  assert.equal(
    isSettingsGlobalLeaveControl({
      className: 'sidebar-nav-item sidebar-nav-item--logout',
    }),
    true,
  );
  assert.equal(
    isSettingsGlobalLeaveControl({
      className: 'sidebar-nav-item sidebar-nav-item--active',
      ariaCurrent: 'page',
    }),
    false,
  );
  assert.equal(
    isSettingsGlobalLeaveControl({
      className: 'sidebar-toggle',
    }),
    false,
  );
});

test('settings leave guard only blocks global leave controls while dirty', () => {
  assert.equal(
    shouldGuardSettingsLeave({
      dirty: true,
      className: 'sidebar-nav-item',
    }),
    true,
  );
  assert.equal(
    shouldGuardSettingsLeave({
      dirty: false,
      className: 'sidebar-nav-item',
    }),
    false,
  );
  assert.equal(
    shouldGuardSettingsLeave({
      dirty: true,
      className: 'sidebar-toggle',
    }),
    false,
  );
});
