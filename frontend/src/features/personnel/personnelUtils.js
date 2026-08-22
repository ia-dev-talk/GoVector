export const EDITABLE_LIVE_STATUSES = Object.freeze([
  'disponible',
  'en_route',
  'en_intervention',
  'pause',
  'hors_service',
  'deconnecte',
]);

export const STATUS_LABELS = Object.freeze({
  disponible: 'Disponible',
  en_route: 'En route',
  en_intervention: 'En intervention',
  pause: 'En pause',
  hors_service: 'Hors service',
  deconnecte: 'Déconnecté',
});

export const OFFLINE_TECH_STATUSES = new Set([
  'hors_service',
  'deconnecte',
]);

export function text(value, fallback = '') {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean'
  ) {
    return fallback;
  }

  return String(value).trim() || fallback;
}

export function normalizeIdentifier(value) {
  const normalized = text(value);
  return normalized || null;
}

export function partitionTechnicianSelection(selectedIds, technicians) {
  const visibleIdentifiers = new Set(
    (Array.isArray(technicians) ? technicians : [])
      .map((technician) => normalizeIdentifier(technician?.id))
      .filter(Boolean),
  );
  const knownIdentifiers = new Set();
  const visible = [];
  const hidden = [];

  (Array.isArray(selectedIds) ? selectedIds : []).forEach((id) => {
    const identifier = normalizeIdentifier(id);
    if (!identifier || knownIdentifiers.has(identifier)) return;
    knownIdentifiers.add(identifier);
    (visibleIdentifiers.has(identifier) ? visible : hidden).push(id);
  });

  return { visible, hidden };
}

export function normalizeSearchText(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

export function normalizeStatus(value) {
  return normalizeSearchText(value);
}

export function getPersonnelStatusTargetCount(selectedIds, technicianId) {
  const targetId = normalizeIdentifier(technicianId);
  const uniqueSelectedIds = [
    ...new Set(
      (Array.isArray(selectedIds) ? selectedIds : [])
        .map(normalizeIdentifier)
        .filter(Boolean),
    ),
  ];

  if (
    targetId &&
    uniqueSelectedIds.length > 1 &&
    uniqueSelectedIds.includes(targetId)
  ) {
    return uniqueSelectedIds.length;
  }

  return 1;
}

export function buildPersonnelStatusConfirmation(status, targetCount) {
  if (normalizeStatus(status) !== 'hors_service') {
    return '';
  }

  const count = Number.isInteger(targetCount) && targetCount > 0
    ? targetCount
    : 1;

  if (count === 1) {
    return 'Mettre ce technicien hors service ? Cette action modifie immédiatement sa disponibilité terrain.';
  }

  return `Mettre ${count} techniciens hors service ? Cette action modifie immédiatement leur disponibilité terrain.`;
}

export function getStringList(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  return values
    .map((item) => text(item))
    .filter(Boolean);
}

export function normalizeStringList(value) {
  return getStringList(value)
    .map(normalizeSearchText)
    .filter(Boolean);
}

export function parseCoordinate(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value
      : null;
  }

  const normalized = text(value);

  if (!normalized) {
    return null;
  }

  const coordinate = Number(normalized);

  return Number.isFinite(coordinate)
    ? coordinate
    : null;
}

export function hasValidTechCoordinates(tech) {
  const latitude = parseCoordinate(
    tech?.current_latitude,
  );
  const longitude = parseCoordinate(
    tech?.current_longitude,
  );

  return (
    latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(
      latitude === 0 &&
      longitude === 0
    )
  );
}

export function getLocationAgeMinutes(
  tech,
  referenceNow,
) {
  if (
    !tech?.last_location_update ||
    !Number.isFinite(referenceNow) ||
    referenceNow <= 0
  ) {
    return null;
  }

  const updatedAt = new Date(
    tech.last_location_update,
  );

  if (Number.isNaN(updatedAt.getTime())) {
    return null;
  }

  return Math.max(
    0,
    Math.round(
      (
        referenceNow -
        updatedAt.getTime()
      ) / 60000,
    ),
  );
}

export function getTechGpsState(
  tech,
  referenceNow,
  staleAfterMinutes,
) {
  const status = normalizeStatus(
    tech?.live_status,
  );

  if (OFFLINE_TECH_STATUSES.has(status)) {
    return 'offline';
  }

  if (!hasValidTechCoordinates(tech)) {
    return 'unavailable';
  }

  const ageMinutes = getLocationAgeMinutes(
    tech,
    referenceNow,
  );

  if (
    Number.isInteger(staleAfterMinutes) &&
    staleAfterMinutes > 0 &&
    ageMinutes !== null
  ) {
    return ageMinutes > staleAfterMinutes
      ? 'stale'
      : 'active';
  }

  return ageMinutes !== null
    ? 'last_known'
    : 'unknown';
}

export function isGpsActive(
  tech,
  referenceNow,
  staleAfterMinutes,
) {
  return (
    getTechGpsState(
      tech,
      referenceNow,
      staleAfterMinutes,
    ) === 'active'
  );
}

export function shouldCheckGps(
  tech,
  referenceNow,
  staleAfterMinutes,
) {
  const state = getTechGpsState(
    tech,
    referenceNow,
    staleAfterMinutes,
  );

  return ![
    'active',
    'offline',
  ].includes(state);
}

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1,
  ).padStart(2, '0');
  const day = String(
    date.getDate(),
  ).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      dateStyle: 'short',
      timeStyle: 'short',
    },
  ).format(date);
}

export function statusLabel(value) {
  const status = normalizeStatus(value);

  return (
    STATUS_LABELS[status] ||
    text(value, 'Statut inconnu')
      .replace(/_/g, ' ')
  );
}

export function technicianInitials(tech) {
  const name = text(tech?.name);

  if (!name) {
    return 'T';
  }

  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase('fr');
}
