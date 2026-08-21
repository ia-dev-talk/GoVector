const BUSINESS_FILTER_KEYS = Object.freeze([
  'sector_id',
  'technician_id',
  'job_type',
  'operator',
  'status',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return '';
  return String(value).trim();
}

function positiveInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function token(value) {
  const normalized = text(value);
  const parts = normalized.split('.');
  return text(parts[parts.length - 1])
    .toLocaleLowerCase('fr')
    .replace(/[\s-]+/g, '_');
}

function operatorToken(value) {
  return text(value).toLocaleUpperCase('fr');
}

function humanize(value) {
  const normalized = token(value).replace(/_/g, ' ');
  return normalized
    ? normalized.charAt(0).toLocaleUpperCase('fr') + normalized.slice(1)
    : '';
}

function assignedTechnicianId(job) {
  return positiveInteger(
    job?.assigned_tech_id ??
      job?.assigned_technician_id ??
      job?.technician_id ??
      job?.assignment?.technician_id,
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

function sectorId(job) {
  return positiveInteger(job?.sector_id ?? job?.sector?.id);
}

function sectorName(job) {
  return text(
    job?.sector_name ??
      job?.sector?.name ??
      job?.sector_raw ??
      job?.zone_name ??
      job?.zone ??
      job?.area,
  );
}

function addIdOption(map, id, label, fallbackPrefix) {
  if (id === null || map.has(id)) return;
  map.set(id, {
    value: id,
    label: label || `${fallbackPrefix} #${id}`,
  });
}

function sortedOptions(values) {
  return [...values].sort((first, second) =>
    first.label.localeCompare(second.label, 'fr', { sensitivity: 'base' }),
  );
}

export function normalizeReportBusinessFilters(value) {
  if (!isRecord(value)) return {};

  const result = {};

  BUSINESS_FILTER_KEYS.forEach((key) => {
    const raw = value[key];

    if (key === 'sector_id' || key === 'technician_id') {
      const id = positiveInteger(raw);
      if (id !== null) result[key] = id;
      return;
    }

    if (key === 'operator') {
      const normalized = operatorToken(raw);
      if (normalized) result[key] = normalized;
      return;
    }

    const normalized = token(raw);
    if (normalized) result[key] = normalized;
  });

  return result;
}

export function filterReportJobs(jobs, filters = {}) {
  const normalized = normalizeReportBusinessFilters(filters);
  const records = Array.isArray(jobs) ? jobs.filter(isRecord) : [];

  return records.filter((job) => {
    if (normalized.sector_id && sectorId(job) !== normalized.sector_id) return false;
    if (
      normalized.technician_id &&
      assignedTechnicianId(job) !== normalized.technician_id
    ) return false;
    if (normalized.job_type && token(job?.job_type) !== normalized.job_type) return false;
    if (normalized.operator && operatorToken(job?.operator) !== normalized.operator) return false;
    if (normalized.status && token(job?.status) !== normalized.status) return false;
    return true;
  });
}

export function buildReportBusinessFilterOptions(jobs) {
  const records = Array.isArray(jobs) ? jobs.filter(isRecord) : [];
  const sectors = new Map();
  const technicians = new Map();
  const operators = new Map();
  const jobTypes = new Map();
  const statuses = new Map();

  records.forEach((job) => {
    addIdOption(sectors, sectorId(job), sectorName(job), 'Secteur');
    addIdOption(
      technicians,
      assignedTechnicianId(job),
      assignedTechnicianName(job),
      'Technicien',
    );

    const operator = operatorToken(job?.operator);
    if (operator && !operators.has(operator)) {
      operators.set(operator, { value: operator, label: operator });
    }

    const jobType = token(job?.job_type);
    if (jobType && !jobTypes.has(jobType)) {
      jobTypes.set(jobType, { value: jobType, label: humanize(jobType) });
    }

    const status = token(job?.status);
    if (status && !statuses.has(status)) {
      statuses.set(status, { value: status, label: humanize(status) });
    }
  });

  return {
    sectors: sortedOptions(sectors.values()),
    technicians: sortedOptions(technicians.values()),
    operators: sortedOptions(operators.values()),
    jobTypes: sortedOptions(jobTypes.values()),
    statuses: sortedOptions(statuses.values()),
  };
}

export function reportBusinessFilterCount(filters) {
  return Object.keys(normalizeReportBusinessFilters(filters)).length;
}
