import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SETTINGS_STATUS_LABELS,
  settingsStatusLabel,
} from './settingsStatusSemantics.js';

test('settings navigation uses product-state language instead of runtime connectivity claims', () => {
  assert.equal(settingsStatusLabel('connected'), 'Raccordé');
  assert.equal(settingsStatusLabel('active'), 'Disponible');
  assert.equal(settingsStatusLabel('available'), 'Disponible');
  assert.equal(settingsStatusLabel('planned'), 'Planifié');
  assert.equal(settingsStatusLabel('readOnly'), 'Lecture seule');
  assert.equal(settingsStatusLabel('unknown'), '');

  assert.equal(
    Object.values(SETTINGS_STATUS_LABELS).includes('Connecté'),
    false,
  );
});
