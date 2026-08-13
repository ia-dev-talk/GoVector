const KNOWN_BUCKETS = Object.freeze([
  'photos',
  'videos',
  'documents',
  'signatures',
  'sketches',
  'other',
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

export function technicianMediaBucket(media) {
  const kind = normalizedKind(media);
  const mime = normalizedMime(media);

  if (
    ['photo', 'image', 'intervention_photo'].includes(kind) ||
    mime.startsWith('image/') && !['signature', 'sketch', 'intervention_sketch'].includes(kind)
  ) {
    return 'photos';
  }

  if (['video', 'intervention_video'].includes(kind) || mime.startsWith('video/')) {
    return 'videos';
  }

  if (['signature', 'client_signature'].includes(kind)) {
    return 'signatures';
  }

  if (['sketch', 'intervention_sketch', 'croquis'].includes(kind)) {
    return 'sketches';
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
  const buckets = Object.fromEntries(KNOWN_BUCKETS.map((key) => [key, []]));

  for (const item of Array.isArray(media) ? media : []) {
    if (!item || typeof item !== 'object') continue;
    buckets[technicianMediaBucket(item)].push(item);
  }

  return buckets;
}

export function countTechnicianMedia(media) {
  const buckets = classifyTechnicianMedia(media);
  return Object.fromEntries(
    KNOWN_BUCKETS.map((key) => [key, buckets[key].length]),
  );
}

export const TECHNICIAN_MEDIA_BUCKETS = KNOWN_BUCKETS;
