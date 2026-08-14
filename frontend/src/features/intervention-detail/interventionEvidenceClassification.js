const KNOWN_BUCKETS = Object.freeze([
  'photos',
  'videos',
  'documents',
  'signatures',
  'sketches',
  'other',
]);

const LEGACY_MEDIA_FIELDS = Object.freeze([
  ['before_photo', 'photos', 'Photo avant'],
  ['during_photo', 'photos', 'Photo pendant'],
  ['after_photo', 'photos', 'Photo après'],
  ['client_signature', 'signatures', 'Signature client'],
  ['report_document', 'documents', 'Compte rendu'],
  ['report_pdf', 'documents', 'Rapport PDF'],
  ['work_report', 'documents', 'Rapport terrain'],
  ['attachment', 'documents', 'Pièce jointe'],
]);

function normalized(value) {
  return value == null
    ? ''
    : String(value).trim().toLocaleLowerCase('fr');
}

function normalizedKind(media) {
  return normalized(
    media?.kind ??
      media?.media_kind ??
      media?.type ??
      media?.event_type,
  ).replaceAll('-', '_');
}

function normalizedMime(media) {
  return normalized(media?.mime_type ?? media?.mimeType);
}

function emptyBuckets() {
  return Object.fromEntries(KNOWN_BUCKETS.map((key) => [key, []]));
}

export function isCommunicationMedia(media) {
  const eventType = normalized(media?.event_type ?? media?.eventType).replaceAll('-', '_');
  return eventType === 'job_communication';
}

export function technicianMediaBucket(media) {
  const kind = normalizedKind(media);
  const mime = normalizedMime(media);

  if (['signature', 'client_signature'].includes(kind)) {
    return 'signatures';
  }

  if (['sketch', 'intervention_sketch', 'croquis'].includes(kind)) {
    return 'sketches';
  }

  if (
    ['photo', 'image', 'intervention_photo'].includes(kind) ||
    mime.startsWith('image/')
  ) {
    return 'photos';
  }

  if (['video', 'intervention_video'].includes(kind) || mime.startsWith('video/')) {
    return 'videos';
  }

  if (
    ['document', 'intervention_document', 'attachment', 'file'].includes(kind) ||
    mime === 'application/pdf' ||
    mime.startsWith('text/') ||
    mime.includes('document') ||
    mime.includes('spreadsheet')
  ) {
    return 'documents';
  }

  return 'other';
}

export function classifyTechnicianMedia(media) {
  const buckets = emptyBuckets();

  for (const item of Array.isArray(media) ? media : []) {
    if (!item || typeof item !== 'object' || isCommunicationMedia(item)) continue;
    buckets[technicianMediaBucket(item)].push(item);
  }

  return buckets;
}

export function buildInterventionEvidenceBuckets({
  job = null,
  technicianMedia = [],
} = {}) {
  const buckets = emptyBuckets();

  for (const [field, bucket, label] of LEGACY_MEDIA_FIELDS) {
    const value = job?.[field];
    if (value == null || String(value).trim() === '') continue;

    buckets[bucket].push({
      source: 'legacy_job',
      source_field: field,
      bucket,
      label,
      value,
    });
  }

  for (const item of Array.isArray(technicianMedia) ? technicianMedia : []) {
    if (!item || typeof item !== 'object' || isCommunicationMedia(item)) continue;
    const bucket = technicianMediaBucket(item);
    buckets[bucket].push({
      ...item,
      source: 'technician_media',
      bucket,
    });
  }

  return buckets;
}

export function countTechnicianMedia(media) {
  const buckets = classifyTechnicianMedia(media);
  return Object.fromEntries(
    KNOWN_BUCKETS.map((key) => [key, buckets[key].length]),
  );
}

export function countInterventionEvidenceMedia(input) {
  const buckets = buildInterventionEvidenceBuckets(input);
  return Object.fromEntries(
    KNOWN_BUCKETS.map((key) => [key, buckets[key].length]),
  );
}

export const TECHNICIAN_MEDIA_BUCKETS = KNOWN_BUCKETS;
export const INTERVENTION_LEGACY_MEDIA_FIELDS = LEGACY_MEDIA_FIELDS;
