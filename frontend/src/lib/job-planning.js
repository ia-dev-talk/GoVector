const MINIMUM_ESTIMATED_DURATION_MINUTES = 15;
const MAXIMUM_ESTIMATED_DURATION_MINUTES = 480;

export const FALLBACK_ESTIMATED_DURATION_MINUTES = 60;

function finiteDuration(value) {
  const duration = Number(value);

  return Number.isFinite(duration) &&
    duration >= MINIMUM_ESTIMATED_DURATION_MINUTES &&
    duration <= MAXIMUM_ESTIMATED_DURATION_MINUTES
    ? duration
    : null;
}

export function durationInputParts(value) {
  const duration = finiteDuration(value);

  if (duration === null) {
    return { hours: '', minutes: '' };
  }

  return {
    hours: Math.floor(duration / 60),
    minutes: duration % 60,
  };
}

export function durationMinutesFromParts(hours, minutes) {
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);

  if (
    !Number.isInteger(parsedHours) ||
    !Number.isInteger(parsedMinutes) ||
    parsedHours < 0 ||
    parsedHours > 8 ||
    parsedMinutes < 0 ||
    parsedMinutes > 59
  ) {
    return null;
  }

  return finiteDuration((parsedHours * 60) + parsedMinutes);
}

export function formatDurationHoursMinutes(value) {
  const parts = durationInputParts(value);

  if (parts.hours === '' || parts.minutes === '') {
    return '';
  }

  return (
    `${String(parts.hours).padStart(2, '0')} h ` +
    `${String(parts.minutes).padStart(2, '0')}`
  );
}

export function catalogEstimatedDuration(catalogItem, fallback) {
  return (
    finiteDuration(
      catalogItem?.metadata?.default_estimated_duration_minutes,
    ) ??
    finiteDuration(fallback) ??
    FALLBACK_ESTIMATED_DURATION_MINUTES
  );
}

export function deriveTimeSlotEnd(start, duration) {
  const match = String(start ?? '').trim().match(/^(\d{2}):(\d{2})$/);
  const normalizedDuration = finiteDuration(duration);

  if (!match || normalizedDuration === null) {
    return '';
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const startMinutes = hours * 60 + minutes;
  const endMinutes = startMinutes + normalizedDuration;

  if (
    hours > 23 ||
    minutes > 59 ||
    endMinutes >= 24 * 60
  ) {
    return '';
  }

  return [
    String(Math.floor(endMinutes / 60)).padStart(2, '0'),
    String(endMinutes % 60).padStart(2, '0'),
  ].join(':');
}

export function applyPlanningFieldChange(
  current,
  name,
  value,
  { jobTypeDuration = null } = {},
) {
  const next = {
    ...current,
    [name]: value,
  };

  let duration = null;
  let start = current?.time_slot_start;

  if (name === 'job_type') {
    duration = finiteDuration(jobTypeDuration);

    if (duration !== null) {
      next.estimated_duration = duration;
    }
  } else if (name === 'estimated_duration') {
    duration = finiteDuration(value);
  } else if (name === 'time_slot_start') {
    duration = finiteDuration(current?.estimated_duration);
    start = value;
  }

  if (duration !== null) {
    const derivedEnd = deriveTimeSlotEnd(start, duration);

    if (derivedEnd) {
      next.time_slot_end = derivedEnd;
    }
  }

  return next;
}
