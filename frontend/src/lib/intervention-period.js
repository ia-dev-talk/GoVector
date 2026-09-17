function startOfLocalDay(value) {
  const source = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(source.getTime())) return null;
  return new Date(
    source.getFullYear(),
    source.getMonth(),
    source.getDate(),
  );
}

export function formatLocalDate(value) {
  const date = startOfLocalDay(value);
  if (!date) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function addDays(value, count) {
  const date = startOfLocalDay(value);
  if (!date) return null;
  date.setDate(date.getDate() + count);
  return date;
}

function mondayOfWeek(value) {
  const date = startOfLocalDay(value);
  if (!date) return null;
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(date, offset);
}

export function buildInterventionPeriod(scope, anchorValue = new Date()) {
  const anchor = startOfLocalDay(anchorValue);
  if (!anchor) {
    return { from: '', to: '', scope: 'today' };
  }

  if (scope === 'unscheduled') {
    return { from: '', to: '', scope: 'unscheduled' };
  }

  let from = anchor;
  let to = anchor;

  if (scope === 'tomorrow') {
    from = addDays(anchor, 1);
    to = from;
  } else if (scope === 'week') {
    from = mondayOfWeek(anchor);
    to = addDays(from, 6);
  } else if (scope === 'month') {
    from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  } else if (scope === 'next_month') {
    from = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    to = new Date(anchor.getFullYear(), anchor.getMonth() + 2, 0);
  } else if (scope === 'year') {
    from = new Date(anchor.getFullYear(), 0, 1);
    to = new Date(anchor.getFullYear(), 11, 31);
  }

  return {
    from: formatLocalDate(from),
    to: formatLocalDate(to),
    scope,
  };
}

export function isValidInterventionPeriod(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '')) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to || '')) return false;
  return from <= to;
}

export function interventionDateSpan(jobs) {
  const dates = (Array.isArray(jobs) ? jobs : [])
    .map((job) => String(job?.scheduled_date || '').slice(0, 10))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();

  if (dates.length === 0) {
    return { first: null, last: null, distinctDates: 0 };
  }

  return {
    first: dates[0],
    last: dates[dates.length - 1],
    distinctDates: new Set(dates).size,
  };
}
