export function normalizeExportFilters(value) {
  if (
    value === null ||
    value === undefined ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(([key, filterValue]) =>
      String(key ?? '').trim() &&
      filterValue !== undefined &&
      filterValue !== null &&
      filterValue !== '',
    ),
  );
}

function normalizeCivilDate(value) {
  const normalized = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? normalized
    : '';
}

export function buildReportExportFilters({
  startDate,
  endDate,
  filters = {},
} = {}) {
  const normalizedStart = normalizeCivilDate(startDate);
  const normalizedEnd = normalizeCivilDate(endDate);

  if (!normalizedStart || !normalizedEnd) {
    throw new TypeError('Le périmètre export Rapports exige une date de début et de fin valides.');
  }

  if (normalizedStart > normalizedEnd) {
    throw new RangeError('La date de début de l’export doit précéder la date de fin.');
  }

  const normalized = normalizeExportFilters(filters);
  delete normalized.date_preset;
  delete normalized.start_date;
  delete normalized.end_date;

  return {
    ...normalized,
    start_date: normalizedStart,
    end_date: normalizedEnd,
  };
}

export function resolveExportFilters(localFilters, fixedFilters = null) {
  if (fixedFilters !== null && fixedFilters !== undefined) {
    return normalizeExportFilters(fixedFilters);
  }

  return normalizeExportFilters(localFilters);
}
