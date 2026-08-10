import assert from 'node:assert/strict';
import test from 'node:test';

import { applyResolvedAddress, geocodingSummary } from './geocoding.js';


const resolvedAddress = {
  resolved: true,
  latitude: 33.54789,
  longitude: -7.59582,
  city: 'Casablanca',
  postal_code: '20000',
  district: 'Bourgogne',
  precision: 'street',
};


test('geocoding fills only missing structured office fields', () => {
  const next = applyResolvedAddress(
    {
      service_city: '',
      service_zip: '',
      route_criteria: '',
    },
    resolvedAddress,
    () => 'Bourgogne',
  );

  assert.equal(next.latitude, 33.54789);
  assert.equal(next.longitude, -7.59582);
  assert.equal(next.service_city, 'Casablanca');
  assert.equal(next.service_zip, '20000');
  assert.equal(next.route_criteria, 'Bourgogne');
});


test('geocoding never overwrites explicit office values', () => {
  const next = applyResolvedAddress(
    {
      service_city: 'Ville confirmée',
      service_zip: '99999',
      route_criteria: 'Secteur confirmé',
    },
    resolvedAddress,
    () => 'Bourgogne',
  );

  assert.equal(next.service_city, 'Ville confirmée');
  assert.equal(next.service_zip, '99999');
  assert.equal(next.route_criteria, 'Secteur confirmé');
});


test('geocoding summary exposes locality and precision', () => {
  assert.equal(
    geocodingSummary(resolvedAddress),
    'Casablanca · 20000 · Bourgogne · précision rue',
  );
});
