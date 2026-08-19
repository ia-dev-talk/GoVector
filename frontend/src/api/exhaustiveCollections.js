const DEFAULT_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 100;
const INSTALL_FLAG = Symbol.for('bluevector.exhaustiveCollectionsInstalled');

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

export async function collectAllPages(
  fetchPage,
  params = {},
  {
    pageSize = DEFAULT_PAGE_SIZE,
    maxPages = DEFAULT_MAX_PAGES,
  } = {},
) {
  if (typeof fetchPage !== 'function') {
    throw new TypeError('fetchPage doit être une fonction');
  }

  const baseParams = {
    ...(params ?? {}),
  };
  const collected = [];
  const seen = new Set();
  let firstResponse = null;

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
        ...(firstResponse ?? response ?? {}),
        data: collected,
      };
    }
  }

  const error = new Error(
    `Collection trop volumineuse : plus de ${pageSize * maxPages} éléments.`,
  );
  error.code = 'BLUEVECTOR_COLLECTION_PAGE_LIMIT';
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
