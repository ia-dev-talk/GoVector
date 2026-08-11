const IN_PROGRESS = new Set([
  'en_route',
  'on_site',
  'in_progress',
  'work_in_progress',
]);

const TERMINAL = new Set([
  'completed',
  'cancelled',
  'failed',
]);

const PENDING = new Set([
  'pending',
  'planned',
  'scheduled',
  'created',
]);

export const PERIOD_OPTIONS = Object.freeze([
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'yesterday', label: 'Hier' },
  { value: 'this_week', label: 'Cette semaine' },
  { value: 'this_month', label: 'Ce mois' },
  { value: 'last_month', label: 'Mois précédent' },
  { value: 'this_year', label: 'Cette année' },
]);

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function asRecords(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function text(value, fallback = '') {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized || fallback;
}

export function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function normalizeToken(value) {
  const normalized = text(value);
  const parts = normalized.split('.');

  return text(parts[parts.length - 1])
    .toLocaleLowerCase('fr')
    .replace(/[\s-]+/g, '_');
}

export function normalizePriority(value) {
  return text(value)
    .split('.')
    .pop()
    .toLocaleUpperCase('fr');
}

export function startOfLocalDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function localDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function periodRange(period, now = new Date()) {
  const today = startOfLocalDay(now);

  if (period === 'yesterday') {
    const yesterday = addDays(today, -1);
    return { start: yesterday, end: yesterday };
  }

  if (period === 'this_week') {
    const weekday = today.getDay();
    const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
    return { start: addDays(today, -daysSinceMonday), end: today };
  }

  if (period === 'this_month') {
    return {
      start: new Date(today.getFullYear(), today.getMonth(), 1),
      end: today,
    };
  }

  if (period === 'last_month') {
    return {
      start: new Date(today.getFullYear(), today.getMonth() - 1, 1),
      end: new Date(today.getFullYear(), today.getMonth(), 0),
    };
  }

  if (period === 'this_year') {
    return { start: new Date(today.getFullYear(), 0, 1), end: today };
  }

  return { start: today, end: today };
}

export function previousRange(range) {
  const dayMs = 24 * 60 * 60 * 1000;
  const length = Math.round(
    (startOfLocalDay(range.end) - startOfLocalDay(range.start)) / dayMs,
  ) + 1;
  const end = addDays(startOfLocalDay(range.start), -1);

  return {
    start: addDays(end, -(length - 1)),
    end,
  };
}

export function formatRange(range) {
  const formatter = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  if (localDateKey(range.start) === localDateKey(range.end)) {
    return formatter.format(range.start);
  }

  return `${formatter.format(range.start)} — ${formatter.format(range.end)}`;
}

export function formatCount(value) {
  const number = nonNegativeInteger(value);
  return number === null ? '—' : new Intl.NumberFormat('fr-FR').format(number);
}

export function formatPercentage(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return '—';
  }

  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 1,
  }).format(number)} %`;
}

export function apiError(error, fallback) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (
        isRecord(item)
          ? text(item.msg ?? item.message)
          : text(item)
      ))
      .filter(Boolean);

    if (messages.length) {
      return messages.join(' · ');
    }
  }

  return (
    text(error?.response?.data?.message) ||
    text(error?.message) ||
    fallback
  );
}

function assignedTechnicianName(job) {
  return text(
    job?.assigned_tech_name ??
      job?.assigned_technician_name ??
      job?.technician_name ??
      job?.assignment?.technician_name ??
      job?.assignment?.technician?.name,
  );
}

function assignedTechnicianId(job) {
  return text(
    job?.assigned_tech_id ??
      job?.assigned_technician_id ??
      job?.technician_id ??
      job?.assignment?.technician_id,
  );
}

function isAssigned(job) {
  return Boolean(assignedTechnicianId(job) || assignedTechnicianName(job));
}

function jobSector(job) {
  return text(
    job?.sector_name ??
      job?.sector?.name ??
      job?.sector ??
      job?.zone_name ??
      job?.zone ??
      job?.area,
    'Non renseigné',
  );
}

function jobOperator(job) {
  return text(
    job?.operator_name ?? job?.operator?.name ?? job?.operator,
    'Non renseigné',
  );
}

function jobType(job) {
  return text(
    job?.job_type_name ??
      job?.job_type?.name ??
      job?.job_type ??
      job?.intervention_type ??
      job?.type,
    'Non renseigné',
  );
}

function coordinate(value, minimum, maximum) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    typeof value === 'boolean'
  ) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function hasCoordinates(job) {
  const latitude = coordinate(
    job?.latitude ?? job?.gps_latitude ?? job?.gps?.latitude,
    -90,
    90,
  );
  const longitude = coordinate(
    job?.longitude ?? job?.gps_longitude ?? job?.gps?.longitude,
    -180,
    180,
  );

  return (
    latitude !== null &&
    longitude !== null &&
    !(latitude === 0 && longitude === 0)
  );
}

function extractHour(job) {
  const candidates = [
    job?.time_slot_start,
    job?.estimated_arrival,
    job?.scheduled_at,
    job?.scheduled_date,
  ];

  for (const candidate of candidates) {
    const normalized = text(candidate);
    if (!normalized) continue;

    const match = normalized.match(/(?:T|\s|^)(\d{1,2}):\d{2}/);
    if (!match) continue;

    const hour = Number(match[1]);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
      return hour;
    }
  }

  return null;
}

function aggregate(jobs, getter) {
  const counts = new Map();

  jobs.forEach((job) => {
    const label = text(getter(job), 'Non renseigné');
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((first, second) => (
      second.count - first.count ||
      first.label.localeCompare(second.label, 'fr', { sensitivity: 'base' })
    ));
}

function percentage(numerator, denominator) {
  return denominator > 0 ? numerator / denominator * 100 : 0;
}

function comparison(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { value: null, direction: 'neutral' };
  }

  if (previous === 0) {
    return {
      value: current === 0 ? 0 : null,
      direction: current > 0 ? 'up' : 'neutral',
    };
  }

  const value = (current - previous) / previous * 100;
  return {
    value,
    direction: value > 0 ? 'up' : value < 0 ? 'down' : 'neutral',
  };
}

export function buildAnalytics(jobs) {
  const records = asRecords(jobs);
  const statuses = records.map((job) => normalizeToken(job?.status));

  const completed = statuses.filter((status) => status === 'completed').length;
  const cancelled = statuses.filter((status) => status === 'cancelled').length;
  const failed = statuses.filter((status) => status === 'failed').length;
  const inProgress = statuses.filter((status) => IN_PROGRESS.has(status)).length;
  const pending = statuses.filter((status) => PENDING.has(status)).length;

  const urgent = records.filter((job) => (
    normalizePriority(job?.priority) === 'URGENT' &&
    !TERMINAL.has(normalizeToken(job?.status))
  )).length;

  const assigned = records.filter(isAssigned).length;
  const unassigned = records.filter((job) => (
    !isAssigned(job) && !TERMINAL.has(normalizeToken(job?.status))
  )).length;
  const terminal = completed + cancelled + failed;

  const operatorComplete = records.filter(
    (job) => jobOperator(job) !== 'Non renseigné',
  ).length;
  const sectorComplete = records.filter(
    (job) => jobSector(job) !== 'Non renseigné',
  ).length;
  const typeComplete = records.filter(
    (job) => jobType(job) !== 'Non renseigné',
  ).length;
  const gpsComplete = records.filter(hasCoordinates).length;

  const hourlyCounts = new Map();
  records.forEach((job) => {
    const hour = extractHour(job);
    if (hour === null) return;
    hourlyCounts.set(hour, (hourlyCounts.get(hour) || 0) + 1);
  });

  const statusDistribution = [
    { key: 'completed', label: 'Terminées', value: completed, tone: 'success' },
    { key: 'in_progress', label: 'En cours', value: inProgress, tone: 'purple' },
    { key: 'pending', label: 'En attente', value: pending, tone: 'warning' },
    { key: 'cancelled', label: 'Annulées', value: cancelled, tone: 'danger' },
    { key: 'failed', label: 'Échecs', value: failed, tone: 'danger' },
  ];

  return {
    total: records.length,
    completed,
    cancelled,
    failed,
    inProgress,
    pending,
    urgent,
    assigned,
    unassigned,
    successRate: percentage(completed, terminal),
    assignmentRate: percentage(assigned, records.length),
    quality: [
      {
        key: 'operator',
        label: 'Opérateur',
        value: percentage(operatorComplete, records.length),
      },
      {
        key: 'sector',
        label: 'Secteur',
        value: percentage(sectorComplete, records.length),
      },
      {
        key: 'type',
        label: 'Type',
        value: percentage(typeComplete, records.length),
      },
      {
        key: 'assignment',
        label: 'Affectation',
        value: percentage(assigned, records.length),
      },
      {
        key: 'gps',
        label: 'Coordonnées GPS',
        value: percentage(gpsComplete, records.length),
      },
    ],
    statusDistribution,
    hourlyDistribution: [...hourlyCounts.entries()]
      .sort(([first], [second]) => first - second)
      .map(([hour, count]) => ({ hour, count })),
    technicianRanking: aggregate(
      records.filter((job) => assignedTechnicianName(job)),
      assignedTechnicianName,
    ).slice(0, 6),
    sectorRanking: aggregate(records, jobSector).slice(0, 6),
    operatorRanking: aggregate(records, jobOperator).slice(0, 6),
    typeRanking: aggregate(records, jobType).slice(0, 6),
  };
}

export function compareAnalytics(current, previous) {
  return {
    total: comparison(current.total, previous.total),
    completed: comparison(current.completed, previous.completed),
    inProgress: comparison(current.inProgress, previous.inProgress),
    pending: comparison(current.pending, previous.pending),
    urgent: comparison(current.urgent, previous.urgent),
    successRate: comparison(current.successRate, previous.successRate),
  };
}

export function activeTechnicianCount(summary) {
  if (!isRecord(summary)) {
    return null;
  }

  const direct = [
    summary.available,
    summary.on_job,
    summary.en_route,
    summary.on_break,
  ].map(nonNegativeInteger);

  if (direct.every((value) => value !== null)) {
    return direct.reduce((sum, value) => sum + value, 0);
  }

  const total = nonNegativeInteger(summary.total);
  const offDuty = nonNegativeInteger(summary.off_duty);

  if (total !== null && offDuty !== null) {
    return Math.max(0, total - offDuty);
  }

  return null;
}

export function totalTechnicianCount(summary) {
  return isRecord(summary) ? nonNegativeInteger(summary.total) : null;
}
