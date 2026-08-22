import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OPERATIONAL_RELOAD_CONFIRMATION,
  buildOperationalSavePayload,
  isOperationalRuleDirty,
  operationalConnectionLabel,
  shouldConfirmOperationalReload,
} from './operationalSettingsPolicy.js';


test('operational reload only warns when a draft is dirty', () => {
  assert.equal(shouldConfirmOperationalReload(false), false);
  assert.equal(shouldConfirmOperationalReload(true), true);
  assert.match(OPERATIONAL_RELOAD_CONFIRMATION, /modifications non enregistrées/i);
});


test('operational rule dirty state includes enablement even when the draft value is invalid', () => {
  assert.equal(
    isOperationalRuleDirty({ enabled: true, parsedValue: null, loadedValue: null }),
    true,
  );
  assert.equal(
    isOperationalRuleDirty({ enabled: true, parsedValue: 0, loadedValue: null }),
    true,
  );
  assert.equal(
    isOperationalRuleDirty({ enabled: true, parsedValue: 30, loadedValue: null }),
    true,
  );
  assert.equal(
    isOperationalRuleDirty({ enabled: false, parsedValue: null, loadedValue: 30 }),
    true,
  );
  assert.equal(
    isOperationalRuleDirty({ enabled: false, parsedValue: null, loadedValue: null }),
    false,
  );
  assert.equal(
    isOperationalRuleDirty({ enabled: true, parsedValue: 30, loadedValue: 30 }),
    false,
  );
});


test('operational rule dirty state applies equally to retention baselines', () => {
  assert.equal(
    isOperationalRuleDirty({ enabled: true, parsedValue: null, loadedValue: null }),
    true,
  );
  assert.equal(
    isOperationalRuleDirty({ enabled: true, parsedValue: 90, loadedValue: null }),
    true,
  );
  assert.equal(
    isOperationalRuleDirty({ enabled: false, parsedValue: null, loadedValue: 90 }),
    true,
  );
  assert.equal(
    isOperationalRuleDirty({ enabled: true, parsedValue: 90, loadedValue: 90 }),
    false,
  );
});


test('operational save payload preserves unrelated persisted values', () => {
  assert.deepEqual(
    buildOperationalSavePayload(
      { another_setting: 'kept' },
      {
        enabled: true,
        parsedMinutes: 20,
        retentionEnabled: false,
        parsedRetentionDays: 90,
      },
    ),
    {
      another_setting: 'kept',
      gps_stale_after_minutes: 20,
      gps_history_retention_days: null,
    },
  );
});


test('save failures do not imply that the loaded backend configuration is unavailable', () => {
  assert.equal(operationalConnectionLabel(''), 'Connecté au backend');
  assert.equal(
    operationalConnectionLabel('GET failed'),
    'Configuration indisponible',
  );
});
