function civilDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function reportIncludesCivilDate(range, date = new Date()) {
  const start = civilDateKey(range?.start);
  const end = civilDateKey(range?.end);
  const target = civilDateKey(date);

  return Boolean(start && end && target && start <= target && target <= end);
}

export function resolveReportRealtimeStatus(
  range,
  connected,
  now = new Date(),
) {
  const start = civilDateKey(range?.start);
  const end = civilDateKey(range?.end);
  const today = civilDateKey(now);

  if (!start || !end || !today || start > end) {
    return {
      label: 'HORS TEMPS RÉEL',
      tone: 'neutral',
      liveRelevant: false,
    };
  }

  if (reportIncludesCivilDate(range, now)) {
    return connected
      ? {
          label: 'TEMPS RÉEL',
          tone: 'connected',
          liveRelevant: true,
        }
      : {
          label: 'TEMPS RÉEL INDISPONIBLE',
          tone: 'reconnecting',
          liveRelevant: true,
        };
  }

  if (end < today) {
    return {
      label: 'VUE HISTORIQUE',
      tone: 'neutral',
      liveRelevant: false,
    };
  }

  if (start > today) {
    return {
      label: 'PÉRIODE FUTURE',
      tone: 'neutral',
      liveRelevant: false,
    };
  }

  return {
    label: 'HORS TEMPS RÉEL',
    tone: 'neutral',
    liveRelevant: false,
  };
}
