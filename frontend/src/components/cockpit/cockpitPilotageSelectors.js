import {
  statusMetadataFor,
  statusMetadataIndex,
} from '../../lib/workflow-capabilities.js';

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

  return String(value).trim() || fallback;
}

export function normalizeStatus(value) {
  const normalized = text(value);
  const parts = normalized.split('.');

  return text(parts[parts.length - 1])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[\s-]+/g, '_');
}

function normalizePriority(value) {
  const normalized = text(value);
  const parts = normalized.split('.');

  return text(parts[parts.length - 1]).toLocaleUpperCase('fr');
}

function count(value, fallback = 0) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function hasAssignment(job) {
  return Boolean(
    text(
      job?.assigned_tech_id ??
        job?.assigned_technician_id ??
        job?.technician_id ??
        job?.assignment?.technician_id ??
        job?.assignment?.technician?.id,
    ) ||
      text(
        job?.assigned_tech_name ??
          job?.assigned_technician_name ??
          job?.technician_name ??
          job?.assignment?.technician_name ??
          job?.assignment?.technician?.name,
      ),
  );
}

function jobSector(job) {
  return text(
    job?.route_criteria ??
      job?.sector_raw ??
      job?.sector_name ??
      job?.sector,
  );
}

function coordinate(value, minimum, maximum) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function hasGps(job) {
  const latitude = coordinate(job?.latitude, -90, 90);
  const longitude = coordinate(job?.longitude, -180, 180);

  return (
    latitude !== null &&
    longitude !== null &&
    !(latitude === 0 && longitude === 0)
  );
}

function percent(numerator, denominator) {
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  return Math.max(
    0,
    Math.min(100, Math.round((Number(numerator) / denominator) * 100)),
  );
}

function computedSummary(jobs, statusMetadata) {
  const metadata = statusMetadataIndex(statusMetadata);
  const summary = {
    total: jobs.length,
    assigned: 0,
    in_progress: 0,
    completed: 0,
    urgent: 0,
    unassigned: 0,
  };

  jobs.forEach((job) => {
    const status = normalizeStatus(job?.status);
    const lifecycle = statusMetadataFor(metadata, status);
    const assigned = hasAssignment(job);

    if (assigned) summary.assigned += 1;
    if (lifecycle?.field_active === true) summary.in_progress += 1;
    if (lifecycle?.canonical === 'completed') summary.completed += 1;
    if (normalizePriority(job?.priority) === 'URGENT') summary.urgent += 1;

    if (!assigned && lifecycle?.order_open === true) {
      summary.unassigned += 1;
    }
  });

  return summary;
}

function resolveSummary(jobs, backendSummary, statusMetadata) {
  const fallback = computedSummary(jobs, statusMetadata);

  if (!isRecord(backendSummary)) {
    return fallback;
  }

  return {
    total: count(backendSummary.total, fallback.total),
    assigned: count(backendSummary.assigned, fallback.assigned),
    in_progress: count(
      backendSummary.in_progress,
      fallback.in_progress,
    ),
    completed: count(backendSummary.completed, fallback.completed),
    urgent: count(backendSummary.urgent, fallback.urgent),
    unassigned: count(backendSummary.unassigned, fallback.unassigned),
  };
}

function buildQuality(jobs) {
  const total = jobs.length;
  const definitions = [
    ['operator', 'Opérateur', (job) => Boolean(text(job?.operator))],
    ['sector', 'Secteur', (job) => Boolean(jobSector(job))],
    ['type', 'Type', (job) => Boolean(text(job?.job_type))],
    ['assignment', 'Affectation', hasAssignment],
    ['gps', 'Coordonnées GPS', hasGps],
  ];

  const metrics = definitions.map(([key, label, predicate]) => {
    const complete = jobs.filter(predicate).length;

    return {
      key,
      label,
      complete,
      value: percent(complete, total),
    };
  });

  const values = metrics
    .map((metric) => metric.value)
    .filter(Number.isFinite);

  return {
    metrics,
    overall:
      values.length > 0
        ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
        : null,
  };
}

function urgentUnassigned(jobs, statusMetadata) {
  const metadata = statusMetadataIndex(statusMetadata);
  return jobs.filter((job) => {
    const status = normalizeStatus(job?.status);
    const lifecycle = statusMetadataFor(metadata, status);

    return (
      normalizePriority(job?.priority) === 'URGENT' &&
      !hasAssignment(job) &&
      lifecycle?.order_open === true
    );
  }).length;
}

function buildDecisions(jobs, summary, personnel, quality, statusMetadata) {
  const decisions = [];
  const urgentCount = urgentUnassigned(jobs, statusMetadata);

  if (urgentCount > 0) {
    decisions.push({
      key: 'urgent',
      tone: 'danger',
      title: `${urgentCount} urgence${urgentCount > 1 ? 's' : ''} non affectée${urgentCount > 1 ? 's' : ''}`,
      detail: 'Affectation immédiate requise.',
      page: 'exploitation',
    });
  }

  const otherUnassigned = Math.max(0, summary.unassigned - urgentCount);

  if (otherUnassigned > 0) {
    decisions.push({
      key: 'unassigned',
      tone: 'warning',
      title: `${otherUnassigned} intervention${otherUnassigned > 1 ? 's' : ''} à affecter`,
      detail: 'Compléter le planning terrain.',
      page: 'interventions',
    });
  }

  if (summary.unassigned > 0 && personnel.available === 0) {
    decisions.push({
      key: 'capacity',
      tone: 'warning',
      title: 'Aucune ressource disponible',
      detail: 'Vérifier les statuts et horaires.',
      page: 'personnel',
    });
  }

  const incomplete = quality.metrics
    .filter(
      (metric) =>
        ['operator', 'sector'].includes(metric.key) &&
        metric.value !== null &&
        metric.value < 100,
    )
    .map((metric) => metric.label.toLocaleLowerCase('fr'));

  if (incomplete.length > 0) {
    decisions.push({
      key: 'quality',
      tone: 'info',
      title: 'Données métier incomplètes',
      detail: `Compléter ${incomplete.join(' et ')}.`,
      page: 'rapports',
    });
  }

  return decisions.slice(0, 4);
}

export function buildCockpitPilotage({
  jobs = [],
  summary = null,
  personnelSummary = null,
  sectorLoad = [],
  positionedCounts = null,
  statusMetadata = [],
}) {
  const safeJobs = asRecords(jobs);
  const resolvedSummary = resolveSummary(safeJobs, summary, statusMetadata);

  const personnel = {
    available: count(personnelSummary?.available),
    onJob: count(personnelSummary?.onJob),
    onBreak: count(personnelSummary?.onBreak),
    offline: count(personnelSummary?.offline),
  };

  personnel.total =
    personnel.available +
    personnel.onJob +
    personnel.onBreak +
    personnel.offline;

  const started = Math.min(
    resolvedSummary.total,
    resolvedSummary.in_progress + resolvedSummary.completed,
  );

  const stages = [
    {
      key: 'planned',
      label: 'Planifiées',
      value: resolvedSummary.total,
      rate: resolvedSummary.total > 0 ? 100 : null,
    },
    {
      key: 'assigned',
      label: 'Affectées',
      value: resolvedSummary.assigned,
      rate: percent(resolvedSummary.assigned, resolvedSummary.total),
    },
    {
      key: 'started',
      label: 'Démarrées',
      value: started,
      rate: percent(started, resolvedSummary.total),
    },
    {
      key: 'completed',
      label: 'Terminées',
      value: resolvedSummary.completed,
      rate: percent(resolvedSummary.completed, resolvedSummary.total),
    },
  ];

  const quality = buildQuality(safeJobs);

  return {
    summary: resolvedSummary,
    personnel,
    stages,
    quality,
    decisions: buildDecisions(
      safeJobs,
      resolvedSummary,
      personnel,
      quality,
      statusMetadata,
    ),
    sectors: asRecords(sectorLoad)
      .map((row) => ({
        sector: text(row?.sector, 'Non renseigné'),
        count: count(row?.count),
      }))
      .filter((row) => row.count > 0)
      .slice(0, 5),
    geo: {
      technicians: count(positionedCounts?.technicians),
      jobs: count(positionedCounts?.jobs),
    },
  };
}
