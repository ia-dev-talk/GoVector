import {
  civilDateKeyInTimeZone,
  localCivilDateKey,
} from './operationalTime.js';

export function reportIncludesCivilDate(
  range,
  date = new Date(),
  timeZone,
) {
  const start = localCivilDateKey(range?.start);
  const end = localCivilDateKey(range?.end);
  const target = civilDateKeyInTimeZone(date, timeZone);

  return Boolean(start && end && target && start <= target && target <= end);
}

export function resolveReportRealtimeStatus(
  range,
  connected,
  now = new Date(),
  timeZone,
) {
  const start = localCivilDateKey(range?.start);
  const end = localCivilDateKey(range?.end);
  const today = civilDateKeyInTimeZone(now, timeZone);

  if (!start || !end || !today || start > end) {
    return {
      label: 'HORS TEMPS RÉEL',
      tone: 'neutral',
      liveRelevant: false,
    };
  }

  if (reportIncludesCivilDate(range, now, timeZone)) {
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
