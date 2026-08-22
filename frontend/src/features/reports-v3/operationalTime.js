const DEFAULT_OPERATIONAL_TIME_ZONE = 'Africa/Casablanca';

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isValidTimeZone(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveOperationalTimeZone(explicitTimeZone) {
  const configured =
    explicitTimeZone ?? import.meta.env?.VITE_OPERATIONAL_TIMEZONE;
  return isValidTimeZone(configured)
    ? configured.trim()
    : DEFAULT_OPERATIONAL_TIME_ZONE;
}

export function localCivilDateKey(date) {
  if (!isValidDate(date)) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function civilDateKeyInTimeZone(
  date = new Date(),
  explicitTimeZone,
) {
  if (!isValidDate(date)) return '';
  const timeZone = resolveOperationalTimeZone(explicitTimeZone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => ['year', 'month', 'day'].includes(part.type))
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function civilDateFromKey(value) {
  const normalized = String(value ?? '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function addCivilDays(date, days) {
  if (!isValidDate(date)) return null;
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function operationalPeriodRange(
  period,
  now = new Date(),
  explicitTimeZone,
) {
  const today = civilDateFromKey(
    civilDateKeyInTimeZone(now, explicitTimeZone),
  );
  if (!today) return null;

  if (period === 'yesterday') {
    const yesterday = addCivilDays(today, -1);
    return { start: yesterday, end: yesterday };
  }

  if (period === 'this_week') {
    const weekday = today.getDay();
    const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
    return { start: addCivilDays(today, -daysSinceMonday), end: today };
  }

  if (period === 'this_month') {
    return {
      start: new Date(today.getFullYear(), today.getMonth(), 1, 12),
      end: today,
    };
  }

  if (period === 'last_month') {
    return {
      start: new Date(today.getFullYear(), today.getMonth() - 1, 1, 12),
      end: new Date(today.getFullYear(), today.getMonth(), 0, 12),
    };
  }

  if (period === 'this_year') {
    return {
      start: new Date(today.getFullYear(), 0, 1, 12),
      end: today,
    };
  }

  return { start: today, end: today };
}
