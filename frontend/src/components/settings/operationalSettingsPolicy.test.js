import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OPERATIONAL_RELOAD_CONFIRMATION,
  buildOperationalSavePayload,
  operationalConnectionLabel,
  shouldConfirmOperationalReload,
} from './operationalSettingsPolicy.js';


test('operational reload only warns when a draft is dirty', () => {
  assert.equal(shouldConfirmOperationalReload(false), false);
  assert.equal(shouldConfirmOperationalReload(true), true);
  assert.match(OPERATIONAL_RELOAD_CONFIRMATION, /modifications non enregistrées/i);
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
