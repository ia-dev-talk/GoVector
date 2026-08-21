import { localDateKey, periodRange } from './reportUtils';

function parseCivilDate(value) {
  const normalized = String(value ?? '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function resolveReportPeriodSelection({
  period,
  exactDate,
  customStart,
  customEnd,
  now = new Date(),
}) {
  if (period === 'exact') {
    const date = parseCivilDate(exactDate);
    if (!date) {
      return {
        ok: false,
        range: null,
        error: 'Choisissez un jour exact valide.',
      };
    }
    return { ok: true, range: { start: date, end: date }, error: '' };
  }

  if (period === 'custom') {
    const start = parseCivilDate(customStart);
    const end = parseCivilDate(customEnd);
    if (!start || !end) {
      return {
        ok: false,
        range: null,
        error: 'Choisissez une date de début et une date de fin valides.',
      };
    }
    if (localDateKey(start) > localDateKey(end)) {
      return {
        ok: false,
        range: null,
        error: 'La date de début doit être antérieure ou égale à la date de fin.',
      };
    }
    return { ok: true, range: { start, end }, error: '' };
  }

  return {
    ok: true,
    range: periodRange(period, now),
    error: '',
  };
}
