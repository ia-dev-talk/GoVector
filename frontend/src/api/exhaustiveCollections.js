const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 100;
const DEFAULT_STABILITY_ATTEMPTS = 3;
const INSTALL_FLAG = Symbol.for('bluevector.exhaustiveCollectionsInstalled');
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

  if (originalGetJobs) {
    api.getJobs = (params = {}) => (
      isExplicitlyPaginated(params)
        ? originalGetJobs(params)
        : collectAllPages(originalGetJobs, params)
    );
  }

  if (originalGetTechnicians) {
    api.getTechnicians = (params = {}) => (
      isExplicitlyPaginated(params)
        ? originalGetTechnicians(params)
        : collectAllPages(originalGetTechnicians, params)
    );
  }

  Object.defineProperty(api, INSTALL_FLAG, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return api;
}
