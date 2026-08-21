import {
  apiError,
  asRecords,
  isRecord,
  localDateKey,
} from './reportUtils.js';

function invalidResponse(label) {
  return `${label} : réponse invalide.`;
}

function settledError(result, label, fallback) {
  if (result?.status === 'rejected') {
    return apiError(result.reason, fallback);
  }

  return invalidResponse(label);
}

export function resolveReportSnapshot(results, { limit = 1000 } = {}) {
  if (!Array.isArray(results) || results.length < 3) {
    return {
      ok: false,
      errors: ['Snapshot Rapports incomplet.'],
      snapshot: null,
    };
  }

  const [current, previous, technicians] = results;
  const errors = [];

  const currentJobs = (
    current.status === 'fulfilled' && Array.isArray(current.value?.data)
  )
    ? asRecords(current.value.data)
    : null;
  if (currentJobs === null) {
    errors.push(settledError(
      current,
      'Interventions',
      'Interventions indisponibles.',
    ));
  }

  const previousJobs = (
    previous.status === 'fulfilled' && Array.isArray(previous.value?.data)
  )
    ? asRecords(previous.value.data)
    : null;
  if (previousJobs === null) {
    errors.push(settledError(
      previous,
      'Comparaison',
      'Comparaison indisponible.',
    ));
  }

  const technicianSummary = (
    technicians.status === 'fulfilled' && isRecord(technicians.value?.data)
  )
    ? technicians.value.data
    : null;
  if (technicianSummary === null) {
    errors.push(settledError(
      technicians,
      'Techniciens',
      'Techniciens indisponibles.',
    ));
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      snapshot: null,
    };
  }

  return {
    ok: true,
    errors: [],
    snapshot: {
      jobs: currentJobs,
      previousJobs,
      technicians: technicianSummary,
      resultLimitReached: currentJobs.length >= limit,
    },
  };
}

export function reportRangeKey(range) {
  if (!(range?.start instanceof Date) || !(range?.end instanceof Date)) {
    return '';
  }

  return `${localDateKey(range.start)}:${localDateKey(range.end)}`;
}

export function reportScopesMatch(requestedRange, displayedRange) {
  const requested = reportRangeKey(requestedRange);
  const displayed = reportRangeKey(displayedRange);
  return Boolean(requested && displayed && requested === displayed);
}
