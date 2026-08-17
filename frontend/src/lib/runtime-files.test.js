import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRuntimeFileUrl,
  resolveRuntimeFileBase,
} from './runtime-files.js';

test('rejects localhost file origin in a non-local browser', () => {
  assert.equal(
    resolveRuntimeFileBase(
      'http://localhost:8080',
      { browserHostname: 'ops.bluevector.example' },
    ),
    '',
  );
  assert.equal(
    buildRuntimeFileUrl(
      '/media/photo.jpg',
      'http://127.0.0.1:8080',
      { browserHostname: 'ops.bluevector.example' },
    ),
    '/media/photo.jpg',
  );
});

test('keeps explicit remote file origin', () => {
  assert.equal(
    buildRuntimeFileUrl(
      '/media/photo.jpg',
      'https://files.bluevector.example/',
      { browserHostname: 'ops.bluevector.example' },
    ),
    'https://files.bluevector.example/media/photo.jpg',
  );
});

test('allows loopback file origin when the browser itself is local', () => {
  assert.equal(
    buildRuntimeFileUrl(
      '/media/photo.jpg',
      'http://localhost:8080',
      { browserHostname: 'localhost' },
    ),
    'http://localhost:8080/media/photo.jpg',
  );
});

test('preserves already absolute asset URLs', () => {
  assert.equal(
    buildRuntimeFileUrl(
      'https://cdn.example/photo.jpg',
      'http://localhost:8080',
      { browserHostname: 'ops.bluevector.example' },
    ),
    'https://cdn.example/photo.jpg',
  );
});
