import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnalytics } from './reportUtils.js';

const gpsQuality = (job) => buildAnalytics([job]).quality.find(
  (metric) => metric.key === 'gps',
).value;

test('missing coordinates are not counted as GPS', () => {
  assert.equal(gpsQuality({ latitude: null, longitude: null }), 0);
  assert.equal(gpsQuality({}), 0);
});

test('zero placeholder coordinates are not counted as GPS', () => {
  assert.equal(gpsQuality({ latitude: 0, longitude: 0 }), 0);
});

test('valid coordinates are counted as GPS', () => {
  assert.equal(gpsQuality({ latitude: 33.5731, longitude: -7.5898 }), 100);
});

test('invalid coordinate ranges are rejected', () => {
  assert.equal(gpsQuality({ latitude: 95, longitude: -7.5898 }), 0);
  assert.equal(gpsQuality({ latitude: 33.5731, longitude: 200 }), 0);
});
