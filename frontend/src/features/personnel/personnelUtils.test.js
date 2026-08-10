import assert from 'node:assert/strict';
import test from 'node:test';

import { getTechGpsState } from './personnelUtils.js';
import { hasValidJobCoordinates } from '../live-map/liveMapUtils.js';


const NOW = new Date('2026-08-07T12:00:00Z').getTime();


test('fresh server timestamp makes a valid technician GPS active', () => {
  assert.equal(
    getTechGpsState(
      {
        live_status: 'en_intervention',
        current_latitude: 33.5731,
        current_longitude: -7.5898,
        last_location_update: '2026-08-07T11:58:00Z',
      },
      NOW,
      5,
    ),
    'active',
  );
});


test('old, missing and unconfigured GPS are never presented as live', () => {
  const base = {
    live_status: 'en_intervention',
    current_latitude: 33.5731,
    current_longitude: -7.5898,
  };

  assert.equal(
    getTechGpsState(
      {...base, last_location_update: '2026-08-07T11:40:00Z'},
      NOW,
      5,
    ),
    'stale',
  );
  assert.equal(getTechGpsState(base, NOW, 5), 'unknown');
  assert.equal(
    getTechGpsState(
      {...base, last_location_update: '2026-08-07T11:58:00Z'},
      NOW,
      null,
    ),
    'last_known',
  );
});


test('field observation never becomes the planned job map position', () => {
  assert.equal(
    hasValidJobCoordinates({
      latitude: null,
      longitude: null,
      gps_latitude: 33.5731,
      gps_longitude: -7.5898,
    }),
    false,
  );
  assert.equal(
    hasValidJobCoordinates({
      latitude: 33.60,
      longitude: -7.62,
      gps_latitude: 33.5731,
      gps_longitude: -7.5898,
    }),
    true,
  );
});
