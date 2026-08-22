import {
  civilDateFromKey,
  localCivilDateKey,
  operationalPeriodRange,
} from './operationalTime.js';

function parseCivilDate(value) {
  return civilDateFromKey(value);
}

export function resolveReportPeriodSelection({
  period,
  exactDate,
  customStart,
  customEnd,
  now = new Date(),
  timeZone,
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
    if (localCivilDateKey(start) > localCivilDateKey(end)) {
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
    range: operationalPeriodRange(period, now, timeZone),
    error: '',
  };
}
