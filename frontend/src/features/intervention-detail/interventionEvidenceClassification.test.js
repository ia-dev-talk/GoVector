import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyTechnicianMedia,
  countTechnicianMedia,
  isCommunicationMedia,
  technicianMediaBucket,
} from './interventionEvidenceClassification.js';

test('classifies every supported technician media kind into one authoritative bucket', () => {
  const media = [
    { media_id: 1, kind: 'photo', mime_type: 'image/jpeg' },
    { media_id: 2, kind: 'video', mime_type: 'video/mp4' },
    { media_id: 3, kind: 'document', mime_type: 'application/pdf' },
    { media_id: 4, kind: 'signature', mime_type: 'image/png' },
    { media_id: 5, kind: 'sketch', mime_type: 'image/png' },
  ];

  const buckets = classifyTechnicianMedia(media);

  assert.deepEqual(buckets.photos.map((item) => item.media_id), [1]);
  assert.deepEqual(buckets.videos.map((item) => item.media_id), [2]);
  assert.deepEqual(buckets.documents.map((item) => item.media_id), [3]);
  assert.deepEqual(buckets.signatures.map((item) => item.media_id), [4]);
  assert.deepEqual(buckets.sketches.map((item) => item.media_id), [5]);
  assert.equal(buckets.other.length, 0);
  assert.equal(
    Object.values(buckets).reduce((total, items) => total + items.length, 0),
    media.length,
  );
});

test('keeps signatures and sketches out of Photos even though they are images', () => {
  assert.equal(
    technicianMediaBucket({ kind: 'client_signature', mime_type: 'image/png' }),
    'signatures',
  );
  assert.equal(
    technicianMediaBucket({ kind: 'intervention_sketch', mime_type: 'image/png' }),
    'sketches',
  );
});

test('uses MIME type as a safe fallback for older media records', () => {
  assert.equal(technicianMediaBucket({ mime_type: 'image/webp' }), 'photos');
  assert.equal(technicianMediaBucket({ mime_type: 'video/quicktime' }), 'videos');
  assert.equal(technicianMediaBucket({ mime_type: 'application/pdf' }), 'documents');
  assert.equal(technicianMediaBucket({ mime_type: 'application/octet-stream' }), 'other');
});

test('keeps communication attachments in the communication thread only', () => {
  const communicationPhoto = {
    media_id: 30,
    kind: 'photo',
    event_type: 'job_communication',
    mime_type: 'image/png',
  };

  assert.equal(isCommunicationMedia(communicationPhoto), true);

  const buckets = classifyTechnicianMedia([
    communicationPhoto,
    { media_id: 31, kind: 'photo', event_type: 'intervention_photo' },
  ]);

  assert.deepEqual(buckets.photos.map((item) => item.media_id), [31]);
  assert.equal(
    Object.values(buckets).reduce((total, items) => total + items.length, 0),
    1,
  );
});

test('returns stable counts and ignores invalid collection entries', () => {
  const counts = countTechnicianMedia([
    null,
    'invalid',
    { kind: 'photo' },
    { kind: 'photo' },
    { kind: 'document' },
    { kind: 'unknown' },
    { kind: 'photo', event_type: 'job_communication' },
  ]);

  assert.deepEqual(counts, {
    photos: 2,
    videos: 0,
    documents: 1,
    signatures: 0,
    sketches: 0,
    other: 1,
  });
});
