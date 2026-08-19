export const COCKPIT_VIEW_KEYS = Object.freeze([
  'metrics',
  'progression',
  'decisions',
  'capacity',
  'quality',
  'activity',
  'quickAccess',
]);

export const DEFAULT_COCKPIT_VIEW = Object.freeze(
  Object.fromEntries(
    COCKPIT_VIEW_KEYS.map((key) => [key, true]),
  ),
);

export function normalizeCockpitView(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};

  const normalized = Object.fromEntries(
    COCKPIT_VIEW_KEYS.map((key) => [
      key,
      typeof source[key] === 'boolean'
        ? source[key]
        : DEFAULT_COCKPIT_VIEW[key],
    ]),
  );

  return Object.values(normalized).some(Boolean)
    ? normalized
    : { ...DEFAULT_COCKPIT_VIEW };
}

export function toggleCockpitSection(current, key) {
  const normalized = normalizeCockpitView(current);

  if (!COCKPIT_VIEW_KEYS.includes(key)) {
    return normalized;
  }

  const visibleCount = Object.values(normalized).filter(Boolean).length;
  if (normalized[key] && visibleCount <= 1) {
    return normalized;
  }

  return {
    ...normalized,
    [key]: !normalized[key],
  };
}

export function cockpitViewFingerprint(value) {
  return JSON.stringify(normalizeCockpitView(value));
}

export function createCockpitPreferenceSaveQueue() {
  return {
    tail: Promise.resolve(),
    latestSequence: 0,
    pending: 0,
  };
}

export function enqueueCockpitPreferenceSave(
  queue,
  {
    payload,
    save,
    onLatestSaved,
    onLatestError,
  },
) {
  if (!queue || typeof queue !== 'object') {
    throw new TypeError('File de sauvegarde Cockpit invalide');
  }

  if (typeof save !== 'function') {
    throw new TypeError('Fonction de sauvegarde Cockpit obligatoire');
  }

  const sequence = queue.latestSequence + 1;
  queue.latestSequence = sequence;
  queue.pending += 1;

  const run = () => Promise.resolve().then(() => save(payload));

  queue.tail = Promise.resolve(queue.tail)
    .catch(() => undefined)
    .then(run)
    .then(
      (result) => {
        queue.pending = Math.max(0, queue.pending - 1);
        if (queue.latestSequence === sequence) {
          onLatestSaved?.(result);
        }
        return result;
      },
      (error) => {
        queue.pending = Math.max(0, queue.pending - 1);
        if (queue.latestSequence === sequence) {
          onLatestError?.(error);
        }
        return undefined;
      },
    );

  return queue.tail;
}
