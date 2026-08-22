import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPersonnelStatusConfirmation,
  getPersonnelStatusTargetCount,
  getTechGpsState,
  partitionTechnicianSelection,
} from './personnelUtils.js';
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


test('personnel selection is reconciled to the currently visible technicians', () => {
  assert.deepEqual(
    partitionTechnicianSelection(
      [1, 2, '3', 2],
      [{ id: 1 }, { id: '3' }],
    ),
    {
      visible: [1, '3'],
      hidden: [2],
    },
  );
});


test('invalid or missing personnel rows cannot remain silently selected', () => {
  assert.deepEqual(
    partitionTechnicianSelection(
      [null, '', 7, '8'],
      [{ id: 8 }, null, {}],
    ),
    {
      visible: ['8'],
      hidden: [7],
    },
  );
});


test('off-duty confirmation reports the exact bulk target count', () => {
  assert.equal(
    getPersonnelStatusTargetCount([1, '2', 3, 3], 2),
    3,
  );
  assert.equal(
    buildPersonnelStatusConfirmation('hors_service', 3),
    'Mettre 3 techniciens hors service ? Cette action modifie immédiatement leur disponibilité terrain.',
  );
});


test('context action targets only the clicked technician outside the current selection', () => {
  assert.equal(
    getPersonnelStatusTargetCount([1, 2, 3], 9),
    1,
  );
  assert.equal(
    buildPersonnelStatusConfirmation('hors_service', 1),
    'Mettre ce technicien hors service ? Cette action modifie immédiatement sa disponibilité terrain.',
  );
});


test('non destructive personnel status changes require no confirmation message', () => {
  assert.equal(buildPersonnelStatusConfirmation('disponible', 4), '');
  assert.equal(buildPersonnelStatusConfirmation('pause', 4), '');
});
