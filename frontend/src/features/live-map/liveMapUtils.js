import {
  getLocationAgeMinutes,
  getTechGpsState,
  hasValidTechCoordinates,
  normalizeIdentifier,
  normalizeSearchText,
  normalizeStatus,
  statusLabel,
  technicianInitials,
  text,
} from '../personnel/personnelUtils.js';
import { getJobTypeLabel } from '../../lib/job-types.js';


export {
  getLocationAgeMinutes,
  getTechGpsState,
  hasValidTechCoordinates,
  normalizeIdentifier,
  normalizeSearchText,
  normalizeStatus,
  statusLabel,
  technicianInitials,
  text,
};


export const JOB_TERMINAL_STATUSES = new Set([
  'completed',
  'cancelled',
  'failed',
]);


export const GPS_LABELS = Object.freeze({
  active: 'GPS actif',
  stale: 'Position ancienne',
  last_known: 'Dernière position connue',
  unavailable: 'Position indisponible',
  unknown: 'État GPS non confirmé',
  offline: 'Technicien hors ligne',
});


export const GPS_TONES = Object.freeze({
  active: 'success',
  stale: 'warning',
  last_known: 'warning',
  unavailable: 'danger',
  unknown: 'muted',
  offline: 'muted',
});


export const JOB_STATUS_LABELS = Object.freeze({
  pending: 'En attente',
  assigned: 'Affectée',
  en_route: 'En route',
  on_site: 'Sur site',
  work_in_progress: 'Travail en cours',
  in_progress: 'En cours',
  installation_done: 'Installation terminée',
  client_validation: 'Validation client',
  en_attente_validation: 'En attente de validation',
  completed: 'Terminée',
  cancelled: 'Annulée',
  failed: 'Échec',
  on_hold: 'En attente',
  client_absent: 'Client absent',
  postponed: 'Reportée',
  suspended: 'Suspendue',
});


export function asRecords(value) {
  return Array.isArray(value)
    ? value.filter(
        (item) =>
          item !== null &&
          typeof item === 'object' &&
          !Array.isArray(item),
      )
    : [];
}


export function technicianId(technician) {
  return normalizeIdentifier(
    technician?.id ??
      technician?.technician_id,
  );
}


export function technicianName(technician) {
  return (
    text(
      technician?.name ??
        technician?.full_name ??
        technician?.username,
    ) ||
    (
      technicianId(technician)
        ? `Technicien #${technicianId(technician)}`
        : 'Technicien'
    )
  );
}


export function technicianSectorNames(technician) {
  const relational = Array.isArray(
    technician?.sector_names,
  )
    ? technician.sector_names
    : [];

  return [
    technician?.primary_sector_name,
    ...relational,
  ]
    .map((value) => text(value))
    .filter(
      (value, index, values) =>
        value &&
        values.indexOf(value) === index,
    );
}


export function primaryTechnicianSector(technician) {
  return (
    text(technician?.primary_sector_name) ||
    technicianSectorNames(technician)[0] ||
    ''
  );
}


export function jobId(job) {
  return normalizeIdentifier(
    job?.id ??
      job?.job_id ??
      job?.job_number ??
      job?.command_number,
  );
}


export function jobTitle(job) {
  const id = jobId(job);

  return (
    text(job?.job_number ?? job?.command_number) ||
    (id ? `Intervention ${id}` : 'Intervention')
  );
}


export function jobStatus(job) {
  const normalized = normalizeStatus(job?.status);

  return {
    value: normalized,
    label:
      JOB_STATUS_LABELS[normalized] ||
      text(job?.status, 'Statut inconnu')
        .replace(/_/g, ' '),
  };
}


export function jobType(job) {
  const raw = job?.job_type;

  return (
    getJobTypeLabel(raw) ||
    text(raw, 'Intervention')
      .replace(/_/g, ' ')
  );
}


export function jobSector(job) {
  return text(
    job?.route_criteria ??
      job?.sector_raw ??
      job?.sector_name ??
      job?.sector,
  );
}


export function assignedTechnicianName(job) {
  return text(
    job?.assigned_tech_name ??
      job?.assigned_technician_name ??
      job?.assignment?.technician?.name,
    'Non affectée',
  );
}


export function hasValidJobCoordinates(job) {
  if (
    job?.latitude === null ||
    job?.latitude === undefined ||
    job?.latitude === '' ||
    job?.longitude === null ||
    job?.longitude === undefined ||
    job?.longitude === ''
  ) {
    return false;
  }

  const latitude = Number(
    job?.latitude,
  );

  const longitude = Number(
    job?.longitude,
  );

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}


export function searchMatches(values, query) {
  const normalizedQuery =
    normalizeSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) =>
    normalizeSearchText(value).includes(
      normalizedQuery,
    ),
  );
}


export function formatTime(value) {
  if (!value) {
    return '—';
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      hour: '2-digit',
      minute: '2-digit',
    },
  ).format(date);
}


export function formatAge(minutes) {
  if (!Number.isFinite(minutes)) {
    return '—';
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  return remainder
    ? `${hours} h ${remainder}`
    : `${hours} h`;
}


export function errorMessage(
  error,
  fallback,
) {
  const detail =
    error?.response?.data?.detail;

  if (
    typeof detail === 'string' &&
    detail.trim()
  ) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        text(item?.msg ?? item?.message),
      )
      .filter(Boolean);

    if (messages.length) {
      return messages.join(' · ');
    }
  }

  return (
    text(error?.message) ||
    fallback
  );
}
