import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildInterventionEvidenceBuckets,
  countInterventionEvidenceMedia,
} from './interventionEvidenceClassification.js';

test('merges legacy job evidence and technician media into authoritative buckets', () => {
  const buckets = buildInterventionEvidenceBuckets({
    job: {
      before_photo: '/media/before.jpg',
      after_photo: '/media/after.jpg',
      client_signature: '/media/signature.png',
      report_pdf: '/media/report.pdf',
    },
    technicianMedia: [
      { media_id: 10, kind: 'photo', mime_type: 'image/jpeg' },
      { media_id: 11, kind: 'video', mime_type: 'video/mp4' },
      { media_id: 12, kind: 'document', mime_type: 'application/pdf' },
      { media_id: 13, kind: 'sketch', mime_type: 'image/png' },
      { media_id: 14, kind: 'signature', mime_type: 'image/png' },
    ],
  });

  assert.equal(buckets.photos.length, 3);
  assert.equal(buckets.videos.length, 1);
  assert.equal(buckets.documents.length, 2);
  assert.equal(buckets.signatures.length, 2);
  assert.equal(buckets.sketches.length, 1);
  assert.equal(buckets.other.length, 0);

  assert.deepEqual(
    buckets.photos.map((item) => item.source),
    ['legacy_job', 'legacy_job', 'technician_media'],
  );
  assert.deepEqual(
    buckets.signatures.map((item) => item.source),
    ['legacy_job', 'technician_media'],
  );
});

test('counts each evidence asset once across legacy and technician sources', () => {
  const counts = countInterventionEvidenceMedia({
    job: {
      during_photo: '/media/during.jpg',
      attachment: '/media/legacy.txt',
    },
    technicianMedia: [
      { media_id: 20, kind: 'photo' },
      { media_id: 21, kind: 'client_signature', mime_type: 'image/png' },
      { media_id: 22, kind: 'unknown' },
    ],
  });

  assert.deepEqual(counts, {
    photos: 2,
    videos: 0,
    documents: 1,
    signatures: 1,
    sketches: 0,
    other: 1,
  });
});
