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
          (technician?.team_name || technician?.team) === filters.team,
      )
    : records;
}

function identifier(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizedSkills(values) {
  if (!Array.isArray(values)) return null;
  return new Set(
    values
      .filter((value) => typeof value === 'string')
      .map((value) => value.trim().toLocaleLowerCase())
      .filter(Boolean),
  );
}

/**
 * Narrow the assignment rail to profiles whose administered team covers the
 * one selected sector and whose real skill catalog satisfies every job.
 * Planning conflicts remain authoritative in the backend transaction.
 */
export function eligibleTechniciansForJobs(
  technicians,
  jobs,
  selectedJobIds,
) {
  const ids = new Set(
    (Array.isArray(selectedJobIds) ? selectedJobIds : [])
      .map(identifier)
      .filter(Boolean),
  );
  const records = Array.isArray(technicians) ? technicians : [];
  if (ids.size === 0) return records;

  const selectedJobs = (Array.isArray(jobs) ? jobs : []).filter(
    (job) => ids.has(identifier(job?.id)),
  );
  if (selectedJobs.length !== ids.size) return [];

  const sectorIds = new Set(
    selectedJobs.map((job) => identifier(job?.sector_id)),
  );
  if (sectorIds.size !== 1 || sectorIds.has(null)) return [];
  const [sectorId] = sectorIds;

  const requiredSkills = new Set();
  for (const job of selectedJobs) {
    const skills = normalizedSkills(job?.required_skills);
    if (skills === null) return [];
    for (const skill of skills) requiredSkills.add(skill);
  }

  return records.filter((technician) => {
    const teamId = identifier(technician?.team_id);
    const coverage = Array.isArray(technician?.sector_ids)
      ? technician.sector_ids.map(identifier).filter(Boolean)
      : [];
    const skills = normalizedSkills(technician?.skills);
    const status = text(technician?.status).toLocaleLowerCase();
    return (
      technician?.is_active !== false
      && teamId !== null
      && coverage.includes(sectorId)
      && skills !== null
      && [...requiredSkills].every((skill) => skills.has(skill))
      && !['pause', 'hors_service'].includes(status)
    );
  });
}
