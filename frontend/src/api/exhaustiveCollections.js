const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 100;
const DEFAULT_STABILITY_ATTEMPTS = 3;
const INSTALL_FLAG = Symbol.for('bluevector.exhaustiveCollectionsInstalled');
export const INTERVENTION_SCOPE_EVENT = 'bluevector:interventions-scope';
const BUSINESS_REVISION_FIELDS = [
  'updated_at',
  'status',
  'technician_id',
  'assigned_technician_id',
  'priority',
  'scheduled_date',
  'sector_id',
  'orienteur_id',
  'is_active',
  'availability',
  'availability_status',
  'work_status',
];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object ?? {}, key);
}

function isExplicitlyPaginated(params) {
  return hasOwn(params, 'limit') || hasOwn(params, 'skip');
}

function stableItemKey(item) {
  if (item && (typeof item === 'object')) {
    const id = item.id ?? item.job_id ?? item.technician_id;
    if (id !== null && id !== undefined) {
      return `id:${String(id)}`;
    }
  }

  return null;
}

function businessRevisionKey(item) {
  if (!item || typeof item !== 'object') {
    return '';
  }

  return BUSINESS_REVISION_FIELDS
    .filter((field) => hasOwn(item, field))
    .map((field) => `${field}:${JSON.stringify(item[field] ?? null)}`)
    .join(',');
}

function collectionSignature(items) {
  return items.map((item, index) => {
    const stableKey = stableItemKey(item);
    if (stableKey) {
      return `${stableKey}[${businessRevisionKey(item)}]`;
    }

    try {
      return `json:${JSON.stringify(item)}`;
    } catch {
      return `index:${index}`;
    }
  }).join('|');
}

function normalizeScopeDate(value) {
  return typeof value === 'string'
    ? value.trim()
    : '';
}

function dispatchInterventionScope(detail) {
  if (
    typeof window === 'undefined' ||
    typeof window.dispatchEvent !== 'function' ||
    typeof CustomEvent === 'undefined'
  ) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(INTERVENTION_SCOPE_EVENT, {
      detail,
    }),
  );
}

export function createInterventionScopeCoordinator(
  notify = () => {},
) {
  let nextCycleId = 0;
  let latestCycle = null;
  let pendingTechnicianPromise = null;

  const settle = (
    cycle,
    surface,
    status,
    error = null,
  ) => {
    if (
      !cycle ||
      cycle !== latestCycle ||
      cycle.failed ||
      cycle.ready
    ) {
      return;
    }

    if (status === 'failed') {
      cycle.failed = true;
      notify({
        status: 'error',
        date: cycle.date,
        requestId: cycle.id,
        code: error?.code || null,
      });
      return;
    }

    cycle[surface] = 'ready';

    if (
      cycle.jobs === 'ready' &&
      cycle.summary === 'ready' &&
      cycle.technicians === 'ready'
    ) {
      cycle.ready = true;
      notify({
        status: 'ready',
        date: cycle.date,
        requestId: cycle.id,
      });
    }
  };

  const observePromise = (
    cycle,
    surface,
    promise,
  ) => {
    Promise.resolve(promise).then(
      () => settle(
        cycle,
        surface,
        'ready',
      ),
      (error) => settle(
        cycle,
        surface,
        'failed',
        error,
      ),
    );
  };

  return {
    observeTechnicians(promise) {
      const request = {
        promise,
      };
      pendingTechnicianPromise = request;

      queueMicrotask(() => {
        if (pendingTechnicianPromise === request) {
          pendingTechnicianPromise = null;
        }
      });
    },

    observeJobs(dateValue, promise) {
      const date = normalizeScopeDate(dateValue);
      if (!date) {
        return;
      }

      const technicianRequest = pendingTechnicianPromise;
      pendingTechnicianPromise = null;

      const cycle = {
        id: ++nextCycleId,
        date,
        jobs: 'pending',
        summary: 'pending',
        technicians: technicianRequest
          ? 'pending'
          : 'ready',
        failed: false,
        ready: false,
      };
      latestCycle = cycle;

      notify({
        status: 'loading',
        date,
        requestId: cycle.id,
      });

      observePromise(
        cycle,
        'jobs',
        promise,
      );

      if (technicianRequest) {
        observePromise(
          cycle,
          'technicians',
          technicianRequest.promise,
        );
      }
    },

    observeSummary(dateValue, promise) {
      const date = normalizeScopeDate(dateValue);
      const cycle = latestCycle;

      if (
        !date ||
        !cycle ||
        cycle.date !== date
      ) {
        return;
      }

      observePromise(
        cycle,
        'summary',
        promise,
      );
    },
  };
}

async function collectSinglePass(
  fetchPage,
  baseParams,
  pageSize,
  maxPages,
) {
  const collected = [];
  const seen = new Set();
  let firstResponse = null;
  let paged = false;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await fetchPage({
      ...baseParams,
      skip: page * pageSize,
      limit: pageSize,
    });
    const rows = Array.isArray(response?.data)
      ? response.data
      : [];

    firstResponse ??= response;
    paged ||= page > 0 || rows.length === pageSize;

    rows.forEach((row) => {
      const key = stableItemKey(row);
      if (key && seen.has(key)) {
        return;
      }
      if (key) {
        seen.add(key);
      }
      collected.push(row);
    });

    if (rows.length < pageSize) {
      return {
        response: {
          ...(firstResponse ?? response ?? {}),
          data: collected,
        },
        signature: collectionSignature(collected),
        paged,
      };
    }
  }

  const error = new Error(
    `Collection trop volumineuse : plus de ${pageSize * maxPages} éléments.`,
  );
  error.code = 'BLUEVECTOR_COLLECTION_PAGE_LIMIT';
  throw error;
}

export async function collectAllPages(
  fetchPage,
  params = {},
  {
    pageSize = DEFAULT_PAGE_SIZE,
    maxPages = DEFAULT_MAX_PAGES,
    stabilityAttempts = DEFAULT_STABILITY_ATTEMPTS,
  } = {},
) {
  if (typeof fetchPage !== 'function') {
    throw new TypeError('fetchPage doit être une fonction');
  }

  if (!Number.isInteger(stabilityAttempts) || stabilityAttempts < 2) {
    throw new TypeError('stabilityAttempts doit être un entier >= 2');
  }

  const baseParams = {
    ...(params ?? {}),
  };

  let previousPass = await collectSinglePass(
    fetchPage,
    baseParams,
    pageSize,
    maxPages,
  );

  if (!previousPass.paged) {
    return previousPass.response;
  }

  for (let attempt = 1; attempt < stabilityAttempts; attempt += 1) {
    const currentPass = await collectSinglePass(
      fetchPage,
      baseParams,
      pageSize,
      maxPages,
    );

    if (currentPass.signature === previousPass.signature) {
      return currentPass.response;
    }

    previousPass = currentPass;
  }

  const error = new Error(
    'Collection modifiée pendant le chargement. Actualisez pour obtenir un état cohérent.',
  );
  error.code = 'BLUEVECTOR_COLLECTION_UNSTABLE';
  throw error;
}

export function installExhaustiveCollectionFetching(api) {
  if (!api || typeof api !== 'object' || api[INSTALL_FLAG]) {
    return api;
  }

  const originalGetJobs = api.getJobs?.bind(api);
  const originalGetTechnicians = api.getTechnicians?.bind(api);
  const originalGetJobsSummary = api.getJobsSummary?.bind(api);
  const scopeCoordinator = createInterventionScopeCoordinator(
    dispatchInterventionScope,
  );

  if (originalGetTechnicians) {
    api.getTechnicians = (params = {}) => {
      const promise = isExplicitlyPaginated(params)
        ? originalGetTechnicians(params)
        : collectAllPages(originalGetTechnicians, params);

      if (!isExplicitlyPaginated(params)) {
        scopeCoordinator.observeTechnicians(promise);
      }

      return promise;
    };
  }

  if (originalGetJobs) {
    api.getJobs = (params = {}) => {
      const promise = isExplicitlyPaginated(params)
        ? originalGetJobs(params)
        : collectAllPages(originalGetJobs, params);

      if (
        !isExplicitlyPaginated(params) &&
        normalizeScopeDate(params?.scheduled_date)
      ) {
        scopeCoordinator.observeJobs(
          params.scheduled_date,
          promise,
        );
      }

      return promise;
    };
  }

  if (originalGetJobsSummary) {
    api.getJobsSummary = (params = {}) => {
      const promise = originalGetJobsSummary(params);
      const targetDate = normalizeScopeDate(
        params?.target_date,
      );

      if (targetDate) {
        scopeCoordinator.observeSummary(
          targetDate,
          promise,
        );
      }

      return promise;
    };
  }

  Object.defineProperty(api, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return api;
}
