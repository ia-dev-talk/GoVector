export const COCKPIT_VIEW_KEYS = Object.freeze([
  'metrics',
  'progression',
  'decisions',
  'capacity',
  'quality',
  'activity',
  'quickAccess',
]);

export const DEFAULT_COCKPIT_ORDER = Object.freeze([...COCKPIT_VIEW_KEYS]);

export const DEFAULT_COCKPIT_VIEW = Object.freeze(
  Object.fromEntries(
    COCKPIT_VIEW_KEYS.map((key) => [key, true]),
  ),
);

export const COCKPIT_VIEW_PRESETS = Object.freeze({
  admin: Object.freeze({
    label: 'Pilotage complet',
    description: 'Vue complète de gouvernance et d’exploitation, sans supposer le rôle de l’utilisateur.',
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
const cockpitRevisionByScope = new Map();
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

export function normalizeCockpitOrder(value) {
  if (!Array.isArray(value)) {
    return [...DEFAULT_COCKPIT_ORDER];
  }

  const seen = new Set();
  const normalized = [];
  value.forEach((item) => {
    const key = String(item ?? '').trim();
    if (COCKPIT_VIEW_KEYS.includes(key) && !seen.has(key)) {
      seen.add(key);
      normalized.push(key);
    }
  });

  DEFAULT_COCKPIT_ORDER.forEach((key) => {
    if (!seen.has(key)) {
      normalized.push(key);
    }
  });

  return normalized;
}

export function visibleCockpitOrder(order, visibility) {
  const normalizedOrder = normalizeCockpitOrder(order);
  const normalizedView = normalizeCockpitView(visibility);

  return normalizedOrder.filter((key) => normalizedView[key]);
}

export function moveCockpitSection(order, key, direction) {
  const normalized = normalizeCockpitOrder(order);
  const index = normalized.indexOf(key);
  const delta = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
  const target = index + delta;

  if (index < 0 || delta === 0 || target < 0 || target >= normalized.length) {
    return normalized;
  }

  const next = [...normalized];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
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

function normalizePreferenceScope(value) {
  return value === null || value === undefined
    ? ''
    : String(value).trim();
}

function normalizePreferenceRevision(value) {
  const revision = Number(value);
  return Number.isInteger(revision) && revision >= 0 ? revision : null;
}

function revisionFromConflict(error) {
  if (error?.response?.status !== 409) {
    return null;
  }

  const detail = error?.response?.data?.detail;
  return normalizePreferenceRevision(
    detail && typeof detail === 'object' && !Array.isArray(detail)
      ? detail.revision
      : null,
  );
}

export function resolveCockpitPreferenceScope({ storage } = {}) {
  const resolvedStorage = storage ?? (
    typeof globalThis !== 'undefined'
      ? globalThis.localStorage
      : undefined
  );

  try {
    const rawUser = resolvedStorage?.getItem('user');
    if (!rawUser) return '';

    const user = JSON.parse(rawUser);
    const userId = normalizePreferenceScope(user?.id);
    return userId ? `user:${userId}` : '';
  } catch {
    return '';
  }
}

export function rememberCockpitPreferenceRevision(revision, { scope } = {}) {
  const normalizedRevision = normalizePreferenceRevision(revision);
  const normalizedScope = normalizePreferenceScope(
    scope ?? resolveCockpitPreferenceScope(),
  );

  if (!normalizedScope || normalizedRevision === null) {
    return null;
  }

  cockpitRevisionByScope.set(normalizedScope, normalizedRevision);
  return normalizedRevision;
}

export function cockpitPreferenceRevision({ scope } = {}) {
  const normalizedScope = normalizePreferenceScope(
    scope ?? resolveCockpitPreferenceScope(),
  );

  if (!normalizedScope) {
    return null;
  }

  return cockpitRevisionByScope.get(normalizedScope) ?? null;
}

export function createBrowserPreferenceCoordinator({
  scope,
  storage,
  locks,
} = {}) {
  const resolvedStorage = storage ?? (
    typeof globalThis !== 'undefined'
      ? globalThis.localStorage
      : undefined
  );
  const resolvedLocks = locks ?? (
    typeof globalThis !== 'undefined'
      ? globalThis.navigator?.locks
      : undefined
  );
  const normalizedScope = normalizePreferenceScope(scope);

  if (!normalizedScope) {
    return {
      publishIntent() {},
      isLatestIntent() {
        return true;
      },
      withLock(run) {
        return Promise.resolve().then(run);
      },
    };
  }

  const namespace = encodeURIComponent(normalizedScope);
  const intentKey = `${COCKPIT_PREFERENCE_INTENT}:${namespace}`;
  const lockKey = `${COCKPIT_PREFERENCE_LOCK}:${namespace}`;

  return {
    publishIntent(token) {
      try {
        resolvedStorage?.setItem(intentKey, token);
      } catch {
        // Private browsing/storage restrictions must not make the cockpit unusable.
      }
    },
    isLatestIntent(token) {
      try {
        const latest = resolvedStorage?.getItem(intentKey);
        return !latest || latest === token;
      } catch {
        return true;
      }
    },
    withLock(run) {
      if (resolvedLocks?.request) {
        return resolvedLocks.request(
          lockKey,
          { mode: 'exclusive' },
          run,
        );
      }
      return Promise.resolve().then(run);
    },
  };
}

export function createCockpitPreferenceSaveQueue({ coordinator, scope } = {}) {
  const resolvedScope = normalizePreferenceScope(
    scope ?? resolveCockpitPreferenceScope(),
  );

  return {
    tail: Promise.resolve(),
    latestSequence: 0,
    pending: 0,
    scope: resolvedScope,
    coordinator: coordinator ?? createBrowserPreferenceCoordinator({
      scope: resolvedScope,
    }),
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

  const coordinator = queue.coordinator ?? createBrowserPreferenceCoordinator({
    scope: queue.scope ?? resolveCockpitPreferenceScope(),
  });
  const sequence = queue.latestSequence + 1;
  const intentToken = createIntentToken();
  const layoutPayload = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload
    : {};
  const viewPayload = layoutPayload.view && typeof layoutPayload.view === 'object' && !Array.isArray(layoutPayload.view)
    ? layoutPayload.view
    : layoutPayload;
  const baseRequestPayload = {
    view: normalizeCockpitView(viewPayload),
    ...(Array.isArray(layoutPayload.order)
      ? { order: normalizeCockpitOrder(layoutPayload.order) }
      : {}),
    client_intent: intentToken,
  };
  queue.latestSequence = sequence;
  queue.pending += 1;
  coordinator.publishIntent(intentToken);

  const run = () => coordinator.withLock(async () => {
    if (!coordinator.isLatestIntent(intentToken)) {
      return { status: 'superseded' };
    }

    const revision = cockpitPreferenceRevision({ scope: queue.scope });
    const requestPayload = {
      ...baseRequestPayload,
      ...(revision === null ? {} : { expected_revision: revision }),
    };
    const result = await save(requestPayload);
    rememberCockpitPreferenceRevision(result?.revision, { scope: queue.scope });
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
        const conflictRevision = revisionFromConflict(error);
        if (conflictRevision !== null) {
          rememberCockpitPreferenceRevision(conflictRevision, { scope: queue.scope });
        }
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
