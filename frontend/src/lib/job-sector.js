function text(value) {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean'
  ) {
    return '';
  }

  return String(value).trim();
}

/**
 * Canonical operational-sector label exposed by the backend contract.
 * Raw locality/route values remain a compatibility fallback for legacy rows.
 */
export function jobOperationalSector(job) {
  const relationalName =
    job?.sector && typeof job.sector === 'object'
      ? job.sector.name
      : '';
  const legacySector =
    typeof job?.sector === 'string'
      ? job.sector
      : '';

  return (
    [
      job?.sector_name,
      relationalName,
      job?.sector_label,
      job?.sector_raw,
      job?.route_criteria,
      legacySector,
    ]
      .map(text)
      .find(Boolean) || ''
  );
}

/**
 * Job-sector filters must not hide the assignment rail: TechnicianResponse
 * has no canonical job-sector identity. Team remains a valid shared filter.
 */
export function filterTechniciansForInterventionScope(
  technicians,
  filters = {},
) {
  const records = Array.isArray(technicians)
    ? technicians
    : [];

  return filters.team
    ? records.filter(
        (technician) =>
          technician?.team === filters.team,
      )
    : records;
}
