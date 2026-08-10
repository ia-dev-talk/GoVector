import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGoogleMapsSearchUrl,
  sharedLocationLabel,
} from './shared-map-location.js';


test('Google Maps search URL needs no API key and preserves the office address', () => {
  const url = new URL(
    buildGoogleMapsSearchUrl({
      address: 'Résidence Yahya, 739 Rue de Boukraa',
      city: 'Casablanca',
      postalCode: '20000',
    }),
  );

  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/maps/search/');
  assert.equal(url.searchParams.get('api'), '1');
  assert.equal(
    url.searchParams.get('query'),
    'Résidence Yahya, 739 Rue de Boukraa, Casablanca, 20000',
  );
  assert.equal(url.searchParams.has('key'), false);
});


test('shared location label exposes confirmed coordinates', () => {
  assert.equal(
    sharedLocationLabel({
      resolved: true,
      latitude: 33.54789,
      longitude: -7.59582,
    }),
    '33.547890 · -7.595820',
  );
});
