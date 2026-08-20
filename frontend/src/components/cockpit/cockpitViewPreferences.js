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

export const COCKPIT_VIEW_PRESETS = Object.freeze({
  admin: Object.freeze({
    label: 'Admin',
    description: 'Vision complète pour gouvernance et exploitation.',
    view: Object.freeze({ ...DEFAULT_COCKPIT_VIEW }),
  }),
  dispatch: Object.freeze({
    label: 'Dispatch',
    description: 'Affectation, arbitrage et capacité terrain en priorité.',
    view: Object.freeze({
      metrics: true,
      progression: true,
      decisions: true,
      capacity: true,
      quality: false,
      activity: true,
      quickAccess: true,
    }),
  }),
  supervision: Object.freeze({
    label: 'Supervision',
    description: 'Décisions, qualité, capacité et événements récents.',
    view: Object.freeze({
      metrics: true,
      progression: false,
      decisions: true,
      capacity: true,
      quality: true,
      activity: true,
      quickAccess: true,
    }),
  }),
  direction: Object.freeze({
    label: 'Direction',
    description: 'Synthèse, avancement et qualité sans surcharge opérationnelle.',
    view: Object.freeze({
      metrics: true,
      progression: true,
      decisions: false,
      capacity: false,
      quality: true,
      activity: true,
      quickAccess: false,
    }),
  }),
  stock: Object.freeze({
    label: 'Stock',
    description: 'Qualité, mouvements et accès aux surfaces opérationnelles.',
    view: Object.freeze({
      metrics: true,
      progression: false,
      decisions: false,
      capacity: false,
      quality: true,
      activity: true,
      quickAccess: true,
    }),
  }),
  secteurs: Object.freeze({
    label: 'Secteurs',
    description: 'Charge territoriale, qualité et navigation opérationnelle.',
    view: Object.freeze({
      metrics: true,
      progression: false,
      decisions: false,
      capacity: true,
      quality: true,
      activity: false,
      quickAccess: true,
    }),
  }),
});

const COCKPIT_PREFERENCE_LOCK = 'bluevector:cockpit-view:save:v1';
const COCKPIT_PREFERENCE_INTENT = 'bluevector:cockpit-view:intent:v1';
let cockpitIntentCounter = 0;

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

export function applyCockpitPreset(presetKey) {
  const preset = COCKPIT_VIEW_PRESETS[presetKey];
  return preset
    ? normalizeCockpitView(preset.view)
    : { ...DEFAULT_COCKPIT_VIEW };
}

export function detectCockpitPreset(value) {
  const fingerprint = cockpitViewFingerprint(value);
  return Object.entries(COCKPIT_VIEW_PRESETS).find(([, preset]) => (
    cockpitViewFingerprint(preset.view) === fingerprint
  ))?.[0] ?? null;
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

export function canRetryCockpitPreferenceSync({ syncState, hydrated } = {}) {
  return syncState === 'error' && hydrated === true;
}

function intentClockMilliseconds() {
  const performanceApi = typeof globalThis !== 'undefined'
    ? globalThis.performance
    : undefined;
  const timeOrigin = Number(performanceApi?.timeOrigin);
  const elapsed = Number(performanceApi?.now?.());

  if (Number.isFinite(timeOrigin) && Number.isFinite(elapsed)) {
    return Math.round(timeOrigin + elapsed);
  }

  return Date.now();
}

function createIntentToken() {
  cockpitIntentCounter += 1;
  return `${intentClockMilliseconds()}:${cockpitIntentCounter}:${Math.random().toString(36).slice(2)}`;
}

function createBrowserPreferenceCoordinator() {
  const storage = typeof globalThis !== 'undefined'
    ? globalThis.localStorage
    : undefined;
  const locks = typeof globalThis !== 'undefined'
    ? globalThis.navigator?.locks
    : undefined;

  return {
    publishIntent(token) {
      try {
        storage?.setItem(COCKPIT_PREFERENCE_INTENT, token);
      } catch {
        // Private browsing/storage restrictions must not make the cockpit unusable.
      }
    },
    isLatestIntent(token) {
      try {
        const latest = storage?.getItem(COCKPIT_PREFERENCE_INTENT);
        return !latest || latest === token;
      } catch {
        // The server also orders writes by client_intent, so storage is only
        // an optimization for suppressing obsolete requests and acknowledgements.
        return true;
      }
    },
    withLock(run) {
      if (locks?.request) {
        return locks.request(
          COCKPIT_PREFERENCE_LOCK,
          { mode: 'exclusive' },
          run,
        );
      }
      return Promise.resolve().then(run);
    },
  };
}

export function createCockpitPreferenceSaveQueue({ coordinator } = {}) {
  return {
    tail: Promise.resolve(),
    latestSequence: 0,
    pending: 0,
    coordinator: coordinator ?? createBrowserPreferenceCoordinator(),
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

  const coordinator = queue.coordinator ?? createBrowserPreferenceCoordinator();
  const sequence = queue.latestSequence + 1;
  const intentToken = createIntentToken();
  const requestPayload = {
    view: normalizeCockpitView(payload),
    client_intent: intentToken,
  };
  queue.latestSequence = sequence;
  queue.pending += 1;
  coordinator.publishIntent(intentToken);

  const run = () => coordinator.withLock(async () => {
    if (!coordinator.isLatestIntent(intentToken)) {
      return { status: 'superseded' };
    }

    const result = await save(requestPayload);
    return {
      status: coordinator.isLatestIntent(intentToken) ? 'saved' : 'superseded',
      result,
    };
  });

  queue.tail = Promise.resolve(queue.tail)
    .catch(() => undefined)
    .then(run)
    .then(
      (outcome) => {
        queue.pending = Math.max(0, queue.pending - 1);
        if (
          outcome?.status === 'saved' &&
          queue.latestSequence === sequence
        ) {
          onLatestSaved?.(outcome.result);
        }
        return outcome?.result;
      },
      (error) => {
        queue.pending = Math.max(0, queue.pending - 1);
        if (
          queue.latestSequence === sequence &&
          coordinator.isLatestIntent(intentToken)
        ) {
          onLatestError?.(error);
        }
        return undefined;
      },
    );

  return queue.tail;
}
