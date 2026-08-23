function normalizeScalar(value) {
  if (value === null || value === undefined) return '';
  return String(value);
}

export function personnelDraftFingerprint(entries = []) {
  const normalized = Array.isArray(entries)
    ? entries.map((entry, index) => ({
        index,
        type: normalizeScalar(entry?.type).toLowerCase(),
        value: normalizeScalar(entry?.value),
        checked: Boolean(entry?.checked),
      }))
    : [];

  return JSON.stringify(normalized);
}

export function isPersonnelDraftDirty(baselineFingerprint, currentFingerprint) {
  return Boolean(baselineFingerprint) && baselineFingerprint !== currentFingerprint;
}

function normalizeIdentifier(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeNumberList(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(normalizeIdentifier)
      .filter(Boolean),
  )].sort((left, right) => left - right);
}

function normalizeStringList(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeScalar(value).trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right, 'fr', { sensitivity: 'base' }));
}

export function personnelServerFingerprint(tech) {
  if (!tech || typeof tech !== 'object') return '';

  return JSON.stringify({
    id: normalizeIdentifier(tech.id),
    name: normalizeScalar(tech.name).trim(),
    employee_id: normalizeScalar(tech.employee_id).trim(),
    phone: normalizeScalar(tech.phone).trim(),
    email: normalizeScalar(tech.email).trim(),
    address: normalizeScalar(tech.home_address ?? tech.address).trim(),
    primary_sector_id: normalizeIdentifier(tech.primary_sector_id),
    sector_ids: normalizeNumberList(tech.sector_ids),
    shift_start: normalizeScalar(tech.shift_start).trim(),
    shift_end: normalizeScalar(tech.shift_end).trim(),
    max_jobs_per_day: tech.max_jobs_per_day ?? null,
    live_status: normalizeScalar(tech.live_status).trim().toLowerCase(),
    skills: normalizeStringList(tech.skills),
  });
}

export function hasPersonnelServerConflict({
  dirty,
  baselineFingerprint,
  currentFingerprint,
}) {
  return Boolean(
    dirty &&
    baselineFingerprint &&
    currentFingerprint &&
    baselineFingerprint !== currentFingerprint
  );
}
