function parseCivilDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new TypeError('Date civile invalide.');

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new TypeError('Date civile invalide.');
  }

  return date;
}

function civilDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function enumerateCivilDateKeys(dateFrom, dateTo) {
  const start = parseCivilDate(dateFrom);
  const end = parseCivilDate(dateTo);

  if (start > end) throw new RangeError('La date de début dépasse la date de fin.');

  const result = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    result.push(civilDateKey(cursor));
  }
  return result;
}

function jobIdentity(job) {
  const id = Number(job?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function unstableCollectionError() {
  const error = new Error('Le périmètre Rapports a changé pendant la pagination. Réessayez.');
  error.code = 'BLUEVECTOR_REPORT_COLLECTION_UNSTABLE';
  return error;
}

function jobFingerprint(job) {
  return JSON.stringify([
    jobIdentity(job),
    job?.updated_at ?? null,
    job?.scheduled_date ?? null,
    job?.status ?? null,
    job?.priority ?? null,
    job?.technician_id ?? job?.assigned_technician_id ?? null,
    job?.job_type_id ?? job?.job_type ?? job?.type ?? null,
    job?.operator ?? job?.operator_name ?? null,
    job?.sector_id ?? null,
    job?.orienteur_id ?? null,
    job?.deleted_at ?? null,
  ]);
}

function snapshotFingerprint(jobs) {
  return jobs.map(jobFingerprint).join('\n');
}

async function collectReportSnapshot({
  fetchPage,
  dates,
  pageSize,
  maxPagesPerDay,
}) {
  const jobs = [];
  const seenIds = new Set();
  let paginated = false;

  for (const scheduledDate of dates) {
    for (let page = 0; page < maxPagesPerDay; page += 1) {
      const response = await fetchPage({
        scheduled_date: scheduledDate,
        skip: page * pageSize,
        limit: pageSize,
      });
      const records = response?.data;
      if (!Array.isArray(records)) {
        throw new TypeError(`Réponse interventions invalide pour ${scheduledDate}.`);
      }
      if (page > 0) paginated = true;

      for (const record of records) {
        const id = jobIdentity(record);
        if (id === null) {
          throw new TypeError(`Intervention sans identifiant valide pour ${scheduledDate}.`);
        }
        if (seenIds.has(id)) throw unstableCollectionError();
        seenIds.add(id);
        jobs.push(record);
      }

      if (records.length < pageSize) break;
      if (page === maxPagesPerDay - 1) {
        const error = new Error(`Trop d’interventions à charger pour ${scheduledDate}.`);
        error.code = 'BLUEVECTOR_REPORT_COLLECTION_TOO_LARGE';
        throw error;
      }
    }
  }

  return {
    jobs,
    paginated,
    fingerprint: snapshotFingerprint(jobs),
  };
}

async function collectRangeReportSnapshot({
  fetchRangePage,
  dateFrom,
  dateTo,
  pageSize,
  maxPages,
}) {
  const jobs = [];
  const seenIds = new Set();
  let paginated = false;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchRangePage({
      scheduled_from: dateFrom,
      scheduled_to: dateTo,
      skip: page * pageSize,
      limit: pageSize,
    });
    const records = response?.data;
    if (!Array.isArray(records)) {
      throw new TypeError(`Réponse interventions invalide pour ${dateFrom} → ${dateTo}.`);
    }
    if (page > 0) paginated = true;

    for (const record of records) {
      const id = jobIdentity(record);
      if (id === null) {
        throw new TypeError(`Intervention sans identifiant valide pour ${dateFrom} → ${dateTo}.`);
      }
      if (seenIds.has(id)) throw unstableCollectionError();
      seenIds.add(id);
      jobs.push(record);
    }

    if (records.length < pageSize) break;
    if (page === maxPages - 1) {
      const error = new Error(`Trop d’interventions à charger pour ${dateFrom} → ${dateTo}.`);
      error.code = 'BLUEVECTOR_REPORT_COLLECTION_TOO_LARGE';
      throw error;
    }
  }

  return {
    jobs,
    paginated,
    fingerprint: snapshotFingerprint(jobs),
  };
}

export async function fetchCompleteReportJobs({
  fetchPage,
  fetchRangePage,
  dateFrom,
  dateTo,
  pageSize = 500,
  maxPagesPerDay = 200,
  maxSnapshotPasses = 3,
}) {
  if (typeof fetchPage !== 'function' && typeof fetchRangePage !== 'function') {
    throw new TypeError('fetchPage ou fetchRangePage doit être une fonction.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throw new RangeError('pageSize doit être compris entre 1 et 500.');
  }
  if (!Number.isInteger(maxPagesPerDay) || maxPagesPerDay < 1) {
    throw new RangeError('maxPagesPerDay invalide.');
  }
  if (!Number.isInteger(maxSnapshotPasses) || maxSnapshotPasses < 2) {
    throw new RangeError('maxSnapshotPasses doit être supérieur ou égal à 2.');
  }

  const collectSnapshot = typeof fetchRangePage === 'function'
    ? () => collectRangeReportSnapshot({
      fetchRangePage,
      dateFrom,
      dateTo,
      pageSize,
      maxPages: maxPagesPerDay,
    })
    : () => collectReportSnapshot({
      fetchPage,
      dates: enumerateCivilDateKeys(dateFrom, dateTo),
      pageSize,
      maxPagesPerDay,
    });
  let previous = await collectSnapshot();

  if (!previous.paginated) return previous.jobs;

  for (let pass = 1; pass < maxSnapshotPasses; pass += 1) {
    const current = await collectSnapshot();
    if (current.fingerprint === previous.fingerprint) return current.jobs;
    previous = current;
  }

  throw unstableCollectionError();
}
