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

export async function fetchCompleteReportJobs({
  fetchPage,
  dateFrom,
  dateTo,
  pageSize = 500,
  maxPagesPerDay = 200,
}) {
  if (typeof fetchPage !== 'function') {
    throw new TypeError('fetchPage doit être une fonction.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
    throw new RangeError('pageSize doit être compris entre 1 et 500.');
  }
  if (!Number.isInteger(maxPagesPerDay) || maxPagesPerDay < 1) {
    throw new RangeError('maxPagesPerDay invalide.');
  }

  const jobs = [];
  const seenIds = new Set();
  const dates = enumerateCivilDateKeys(dateFrom, dateTo);

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

      for (const record of records) {
        const id = jobIdentity(record);
        if (id === null) {
          throw new TypeError(`Intervention sans identifiant valide pour ${scheduledDate}.`);
        }
        if (seenIds.has(id)) {
          const error = new Error('Le périmètre Rapports a changé pendant la pagination. Réessayez.');
          error.code = 'BLUEVECTOR_REPORT_COLLECTION_UNSTABLE';
          throw error;
        }
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

  return jobs;
}
