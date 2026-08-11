import axios from 'axios';

const API_PREFIX = '/api/v1';
const DEFAULT_API_URL = 'http://localhost:8000';
const DEFAULT_FILES_URL = 'http://localhost:8080';
const SESSION_EXPIRED_EVENT = 'bluevector:session-expired';

function normalizeText(value) {
  return value === null || value === undefined
    ? ''
    : String(value).trim();
}

function stripTrailingSlash(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function buildApiBaseUrl(configuredUrl) {
  const base = stripTrailingSlash(configuredUrl);

  if (!base) {
    return API_PREFIX;
  }

  if (base.endsWith(API_PREFIX)) {
    return base;
  }

  if (base.endsWith('/api')) {
    return `${base}/v1`;
  }

  return `${base}${API_PREFIX}`;
}

function readStoredValue(key) {
  try {
    return normalizeText(
      window.localStorage.getItem(key),
    );
  } catch {
    return '';
  }
}

function removeStoredValue(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Le stockage peut être indisponible ou bloqué.
  }
}

function setHeader(headers, name, value) {
  if (!headers) {
    return;
  }

  if (typeof headers.set === 'function') {
    headers.set(name, value);
  } else {
    headers[name] = value;
  }
}

function getHeader(headers, name) {
  if (!headers) {
    return '';
  }

  if (typeof headers.get === 'function') {
    return normalizeText(headers.get(name));
  }

  return normalizeText(
    headers[name] ??
      headers[name.toLowerCase()],
  );
}

function deleteHeader(headers, name) {
  if (!headers) {
    return;
  }

  if (typeof headers.delete === 'function') {
    headers.delete(name);
  } else {
    delete headers[name];
    delete headers[name.toLowerCase()];
  }
}

function normalizeRequestUrl(url, baseURL) {
  const requestUrl = normalizeText(url);
  const base = stripTrailingSlash(baseURL);

  if (
    !requestUrl ||
    /^https?:\/\//i.test(requestUrl) ||
    !base.endsWith(API_PREFIX)
  ) {
    return url;
  }

  if (requestUrl === API_PREFIX) {
    return '/';
  }

  return requestUrl.startsWith(`${API_PREFIX}/`)
    ? requestUrl.slice(API_PREFIX.length)
    : url;
}

function appendParam(
  searchParams,
  key,
  value,
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => {
      appendParam(searchParams, key, item);
    });

    return;
  }

  if (value instanceof Date) {
    if (!Number.isNaN(value.getTime())) {
      searchParams.append(
        key,
        value.toISOString(),
      );
    }

    return;
  }

  searchParams.append(
    key,
    isRecord(value)
      ? JSON.stringify(value)
      : String(value),
  );
}

function serializeParams(params) {
  const searchParams =
    new URLSearchParams();

  if (!isRecord(params)) {
    return '';
  }

  Object.entries(params).forEach(
    ([key, value]) => {
      appendParam(
        searchParams,
        key,
        value,
      );
    },
  );

  return searchParams.toString();
}

function withParams(
  params = {},
  config = {},
) {
  return {
    ...config,
    params: isRecord(params)
      ? params
      : {},
  };
}

function pathSegment(
  value,
  label = 'Identifiant',
) {
  const text = normalizeText(value);

  if (!text) {
    throw new TypeError(
      `${label} obligatoire`,
    );
  }

  return encodeURIComponent(text);
}

function isLoginRequest(config) {
  const rawUrl = normalizeText(
    config?.url,
  );

  if (!rawUrl) {
    return false;
  }

  try {
    return new URL(
      rawUrl,
      'http://bluevector.local',
    ).pathname.endsWith('/auth/login');
  } catch {
    return rawUrl
      .split('?')[0]
      .endsWith('/auth/login');
  }
}

function getBearerToken(config) {
  const authorization = getHeader(
    config?.headers,
    'Authorization',
  );

  const match = authorization.match(
    /^Bearer\s+(.+)$/i,
  );

  return match
    ? normalizeText(match[1])
    : '';
}

function createImportFormData(
  file,
  mappingOverrides = null,
  columnOverrides = null,
  headerRowOverrides = null,
) {
  if (typeof FormData === 'undefined') {
    throw new Error(
      'FormData indisponible dans cet environnement',
    );
  }

  if (!file) {
    throw new TypeError(
      'Fichier Excel obligatoire',
    );
  }

  const formData = new FormData();

  formData.append('file', file);
  if (isRecord(mappingOverrides) && Object.keys(mappingOverrides).length > 0) {
    formData.append('mapping_overrides', JSON.stringify(mappingOverrides));
  }
  if (isRecord(columnOverrides) && Object.keys(columnOverrides).length > 0) {
    formData.append('column_overrides', JSON.stringify(columnOverrides));
  }
  if (isRecord(headerRowOverrides) && Object.keys(headerRowOverrides).length > 0) {
    formData.append('header_row_overrides', JSON.stringify(headerRowOverrides));
  }

  return formData;
}

const configuredApiUrl = normalizeText(
  import.meta.env.VITE_API_URL,
);

export const API_URL =
  stripTrailingSlash(
    configuredApiUrl ||
      DEFAULT_API_URL,
  );

export const FILES_URL =
  stripTrailingSlash(
    import.meta.env.VITE_FILES_URL ||
      DEFAULT_FILES_URL,
  );

export const apiClient = axios.create({
  baseURL: buildApiBaseUrl(
    configuredApiUrl,
  ),
  headers: {
    'Content-Type': 'application/json',
  },
  paramsSerializer: {
    serialize: serializeParams,
  },
});

let observedToken =
  readStoredValue('token');

let sessionExpirationNotified = false;

apiClient.interceptors.request.use(
  (config) => {
    config.url = normalizeRequestUrl(
      config.url,
      config.baseURL ??
        apiClient.defaults.baseURL,
    );

    config.headers =
      config.headers || {};

    if (
      typeof FormData !== 'undefined' &&
      config.data instanceof FormData
    ) {
      deleteHeader(
        config.headers,
        'Content-Type',
      );
    }

    const token =
      readStoredValue('token');

    if (token !== observedToken) {
      observedToken = token;
      sessionExpirationNotified =
        false;
    }

    if (token) {
      setHeader(
        config.headers,
        'Authorization',
        `Bearer ${token}`,
      );
    } else {
      deleteHeader(
        config.headers,
        'Authorization',
      );
    }

    return config;
  },
);

apiClient.interceptors.response.use(
  (response) => {
    if (isLoginRequest(response.config)) {
      sessionExpirationNotified =
        false;
    }

    return response;
  },
  (error) => {
    if (
      axios.isCancel(error) ||
      error?.code === 'ERR_CANCELED'
    ) {
      return Promise.reject(error);
    }

    const requestToken =
      getBearerToken(error?.config);

    const currentToken =
      readStoredValue('token');

    if (
      error?.response?.status === 401 &&
      !isLoginRequest(error?.config) &&
      requestToken &&
      requestToken === currentToken
    ) {
      removeStoredValue('token');
      removeStoredValue('user');

      observedToken = '';

      if (!sessionExpirationNotified) {
        sessionExpirationNotified =
          true;

        window.dispatchEvent(
          new Event(
            SESSION_EXPIRED_EVENT,
          ),
        );
      }
    }

    return Promise.reject(error);
  },
);

const uploadExcelFile = (
  file,
  mappingOverrides = null,
  columnOverrides = null,
  headerRowOverrides = null,
) =>
  apiClient.post(
    '/import/excel',
    createImportFormData(
      file,
      mappingOverrides,
      columnOverrides,
      headerRowOverrides,
    ),
  );

const reassignAssignment = (
  jobId,
  newTechId,
) =>
  apiClient.post(
    '/assignments/reassign',
    {
      job_id: jobId,
      new_technician_id:
        newTechId,
    },
  );

const reassignJobAction = (
  jobId,
  data,
) =>
  apiClient.post(
    `/job-actions/${pathSegment(
      jobId,
      'Intervention',
    )}/reassign`,
    data,
  );

export const api = {
  // AUTH
  login: async (
    username,
    password,
  ) => {
    const form =
      new URLSearchParams();

    form.append(
      'username',
      normalizeText(username),
    );

    form.append(
      'password',
      String(password ?? ''),
    );

    const response =
      await apiClient.post(
        '/auth/login',
        form,
        {
          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded',
          },
        },
      );

    sessionExpirationNotified = false;

    return response.data;
  },

  getMe: () =>
    apiClient.get('/auth/me'),

  // TECHNICIANS
  getTechnicians: (params = {}) =>
    apiClient.get(
      '/technicians/',
      withParams(params),
    ),

  getTechnician: (id) =>
    apiClient.get(
      `/technicians/${pathSegment(
        id,
        'Technicien',
      )}`,
    ),

  createTechnician: (data) =>
    apiClient.post(
      '/technicians/',
      data,
    ),

  updateTechnician: (id, data) =>
    apiClient.patch(
      `/technicians/${pathSegment(
        id,
        'Technicien',
      )}`,
      data,
    ),

  updateTechLocation: (id, data) =>
    apiClient.patch(
      `/technicians/${pathSegment(
        id,
        'Technicien',
      )}/location`,
      data,
    ),

  updateTechStatus: (
    id,
    status,
  ) =>
    apiClient.patch(
      `/technicians/${pathSegment(
        id,
        'Technicien',
      )}/status`,
      {
        status,
      },
    ),

  getTechWorkload: (id) =>
    apiClient.get(
      `/technicians/${pathSegment(
        id,
        'Technicien',
      )}/workload`,
    ),

  getTechnicianDetails: (id) =>
    apiClient.get(
      `/technicians/${pathSegment(
        id,
        'Technicien',
      )}/details`,
    ),

  // JOBS
  getJobs: (params = {}) =>
    apiClient.get(
      '/jobs/',
      withParams(params),
    ),

  getJob: (id) =>
    apiClient.get(
      `/jobs/${pathSegment(
        id,
        'Intervention',
      )}`,
    ),

  createJob: (data) =>
    apiClient.post('/jobs/', data),

  updateJob: (id, data) =>
    apiClient.patch(
      `/jobs/${pathSegment(
        id,
        'Intervention',
      )}`,
      data,
    ),

  deleteJob: (id) =>
    apiClient.delete(
      `/jobs/${pathSegment(
        id,
        'Intervention',
      )}`,
    ),

  getJobsSummary: (params = {}) =>
    apiClient.get(
      '/jobs/summary',
      withParams(params),
    ),

  getPendingJobs: (params = {}) =>
    apiClient.get(
      '/jobs/pending',
      withParams(params),
    ),

  completeJob: (jobId) =>
    apiClient.post(
      `/jobs/${pathSegment(
        jobId,
        'Intervention',
      )}/complete`,
      {},
    ),

  cancelJob: (jobId) =>
    apiClient.post(
      `/jobs/${pathSegment(
        jobId,
        'Intervention',
      )}/cancel`,
      {},
    ),

  updateJobStatus: (
    jobId,
    status,
  ) =>
    apiClient.patch(
      `/jobs/${pathSegment(
        jobId,
        'Intervention',
      )}/status`,
      {
        status,
      },
    ),

  canDo: (jobId, techId) =>
    apiClient.get(
      `/jobs/${pathSegment(
        jobId,
        'Intervention',
      )}/can-do/${pathSegment(
        techId,
        'Technicien',
      )}`,
    ),

  getJobStock: (jobId) =>
    apiClient.get(
      `/jobs/${pathSegment(
        jobId,
        'Intervention',
      )}/stock`,
    ),

  consumeJobStock: (
    jobId,
    items,
  ) => {
    if (!Array.isArray(items)) {
      throw new TypeError(
        'La consommation de stock doit être un tableau',
      );
    }

    return apiClient.post(
      `/jobs/${pathSegment(
        jobId,
        'Intervention',
      )}/consume-stock`,
      null,
      withParams({
        items: JSON.stringify(items),
      }),
    );
  },

  searchJobs: (params = {}) =>
    apiClient.get(
      '/jobs/search/query',
      withParams(params),
    ),

  // ASSIGNMENTS
  createAssignment: (data) =>
    apiClient.post(
      '/assignments/',
      data,
    ),

  getJobAssignment: (jobId) =>
    apiClient.get(
      `/assignments/job/${pathSegment(
        jobId,
        'Intervention',
      )}`,
    ),

  getTechAssignments: (techId) =>
    apiClient.get(
      `/assignments/technician/${pathSegment(
        techId,
        'Technicien',
      )}`,
    ),

  unassignJob: (jobId) =>
    apiClient.post(
      '/assignments/unassign',
      {
        job_id: jobId,
      },
    ),

  reassignAssignment,

  batchAssign: (
    jobIds,
    techId,
  ) =>
    apiClient.post(
      '/assignments/batch-assign',
      {
        job_ids: jobIds,
        technician_id: techId,
      },
    ),

  batchUnassign: (jobIds) =>
    apiClient.post(
      '/assignments/batch-unassign',
      {
        job_ids: jobIds,
      },
    ),

  // ROUTING & DISPATCH
  autoRoute: (data = {}) =>
    apiClient.post(
      '/routing/auto-route',
      data,
    ),

  getRoutingBestTech: (jobId) =>
    apiClient.get(
      `/routing/best-tech/${pathSegment(
        jobId,
        'Intervention',
      )}`,
    ),

  getBestTech: (jobId) =>
    apiClient.post(
      '/dispatch/best-tech',
      null,
      withParams({
        job_id: jobId,
      }),
    ),

  getDispatchBestTech: (jobId) =>
    apiClient.post(
      '/dispatch/best-tech',
      null,
      withParams({
        job_id: jobId,
      }),
    ),

  getRankedTechs: (jobId) =>
    apiClient.get(
      '/dispatch/rank',
      withParams({
        job_id: jobId,
      }),
    ),

  // IMPORT EXCEL
  uploadExcel: uploadExcelFile,
  importExcel: uploadExcelFile,
  getImportContract: () => apiClient.get('/import/excel/contract'),

  confirmExcelImport: (payload) =>
    apiClient.post(
      '/import/confirm',
      payload,
    ),

  getImportHistory: (
    params = {},
  ) =>
    apiClient.get(
      '/import/history',
      withParams(params),
    ),

  getImportStats: () =>
    apiClient.get(
      '/import/history/stats',
    ),

  getImportRecord: (id) =>
    apiClient.get(
      `/import/history/${pathSegment(
        id,
        'Import',
      )}`,
    ),

  // SIMULATION
  simStatus: () =>
    apiClient.get(
      '/simulation/status',
    ),

  simStart: (speed = 200) =>
    apiClient.post(
      '/simulation/start',
      {
        speed,
      },
    ),

  simPause: () =>
    apiClient.post(
      '/simulation/pause',
    ),

  simResume: () =>
    apiClient.post(
      '/simulation/resume',
    ),

  simStop: () =>
    apiClient.post(
      '/simulation/stop',
    ),

  simSetSpeed: (speed) =>
    apiClient.post(
      '/simulation/speed',
      {
        speed,
      },
    ),

  // DASHBOARD
  getDashboardSummary: (
    params = {},
  ) =>
    apiClient.get(
      '/dashboard/summary',
      withParams(params),
    ),

  getDashboardJobs: (
    params = {},
  ) =>
    apiClient.get(
      '/dashboard/jobs',
      withParams(params),
    ),

  getDashboardTechnicians: (
    params = {},
  ) =>
    apiClient.get(
      '/dashboard/technicians',
      withParams(params),
    ),

  getDashboardPerformance: (
    params = {},
  ) =>
    apiClient.get(
      '/dashboard/performance',
      withParams(params),
    ),

  getDashboardSuccessRate: (
    params = {},
  ) =>
    apiClient.get(
      '/dashboard/success-rate',
      withParams(params),
    ),

  getChartsSecteurs: (
    params = {},
  ) =>
    apiClient.get(
      '/dashboard/charts/secteurs',
      withParams(params),
    ),

  getChartsStatus: (
    params = {},
  ) =>
    apiClient.get(
      '/dashboard/charts/status',
      withParams(params),
    ),

  // SMART MAP
  getMapLayers: (params = {}) =>
    apiClient.get(
      '/map/layers',
      withParams(params),
    ),

  getMapClusters: (params = {}) =>
    apiClient.get(
      '/map/clusters',
      withParams(params),
    ),

  searchOnMap: (params = {}) =>
    apiClient.get(
      '/map/search',
      withParams(params),
    ),

  getMapBounds: (params = {}) =>
    apiClient.get(
      '/map/bounds',
      withParams(params),
    ),

  // TOUR MANAGEMENT
  optimizeTour: (techId) =>
    apiClient.post(
      '/tour/optimize',
      null,
      withParams({
        technician_id: techId,
      }),
    ),

  reorderTour: (
    techId,
    jobIds,
  ) =>
    apiClient.post(
      '/tour/reorder',
      null,
      withParams({
        technician_id: techId,
        job_ids: jobIds,
      }),
    ),

  mergeTours: (
    techAId,
    techBId,
  ) =>
    apiClient.post(
      '/tour/merge',
      null,
      withParams({
        technician_a_id: techAId,
        technician_b_id: techBId,
      }),
    ),

  calculateETA: (
    techId,
    startTime,
  ) =>
    apiClient.get(
      '/tour/eta',
      withParams({
        technician_id: techId,
        start_time:
          normalizeText(startTime) ||
          undefined,
      }),
    ),

  // CAN DO ALL
  canDoAll: async (
    jobId,
    techIds,
  ) => {
    if (!Array.isArray(techIds)) {
      return [];
    }

    const uniqueTechIds = [
      ...new Set(
        techIds
          .map(normalizeText)
          .filter(Boolean),
      ),
    ];

    const results =
      await Promise.allSettled(
        uniqueTechIds.map((techId) =>
          apiClient.get(
            `/jobs/${pathSegment(
              jobId,
              'Intervention',
            )}/can-do/${pathSegment(
              techId,
              'Technicien',
            )}`,
          ),
        ),
      );

    return results
      .filter(
        (result) =>
          result.status ===
          'fulfilled',
      )
      .map(
        (result) =>
          result.value.data,
      );
  },

  // INCIDENTS
  getIncidents: (params = {}) =>
    apiClient.get(
      '/incidents',
      withParams(params),
    ),

  getIncident: (id) =>
    apiClient.get(
      `/incidents/${pathSegment(
        id,
        'Incident',
      )}`,
    ),

  createIncident: (data) =>
    apiClient.post(
      '/incidents',
      data,
    ),

  updateIncident: (id, data) =>
    apiClient.put(
      `/incidents/${pathSegment(
        id,
        'Incident',
      )}`,
      data,
    ),

  deleteIncident: (id) =>
    apiClient.delete(
      `/incidents/${pathSegment(
        id,
        'Incident',
      )}`,
    ),

  escalateIncident: (id) =>
    apiClient.post(
      `/incidents/${pathSegment(
        id,
        'Incident',
      )}/escalate`,
    ),

  getIncidentsStats: () =>
    apiClient.get(
      '/incidents/stats/summary',
    ),

  // FTTH NETWORK
  getNros: (params = {}) =>
    apiClient.get(
      '/ftth/nros',
      withParams(params),
    ),

  getSros: (params = {}) =>
    apiClient.get(
      '/ftth/sros',
      withParams(params),
    ),

  getPbos: (params = {}) =>
    apiClient.get(
      '/ftth/pbos',
      withParams(params),
    ),

  getPtos: (params = {}) =>
    apiClient.get(
      '/ftth/ptos',
      withParams(params),
    ),

  getNetworkTree: (
    params = {},
  ) =>
    apiClient.get(
      '/ftth/tree',
      withParams(params),
    ),

  searchFtth: (q) =>
    apiClient.get(
      '/ftth/search',
      withParams({
        q: normalizeText(q),
      }),
    ),

  // AI ASSISTANT
  aiChat: (data) =>
    apiClient.post(
      '/ai/chat',
      data,
    ),

  // STOCK MANAGEMENT
  getStock: (params = {}) =>
    apiClient.get(
      '/stock',
      withParams(params),
    ),

  createEquipment: (data) =>
    apiClient.post('/stock', data),

  updateEquipment: (id, data) =>
    apiClient.put(
      `/stock/${pathSegment(
        id,
        'Équipement',
      )}`,
      data,
    ),

  deleteEquipment: (id) =>
    apiClient.delete(
      `/stock/${pathSegment(
        id,
        'Équipement',
      )}`,
    ),

  getStockSummary: (
    params = {},
  ) =>
    apiClient.get(
      '/stock/summary',
      withParams(params),
    ),

  exportStock: async (
    params = {},
  ) => {
    const response =
      await apiClient.get(
        '/stock/export',
        withParams(params, {
          responseType: 'blob',
        }),
      );

    return response.data;
  },

  // STOCK FTTH V2
  getWarehouses: (
    params = {},
  ) =>
    apiClient.get(
      '/stock-ftth/warehouses',
      withParams(params),
    ),

  getStockItems: (params = {}) =>
    apiClient.get(
      '/stock-ftth/items',
      withParams(params),
    ),

  getStockHistory: (
    params = {},
  ) =>
    apiClient.get(
      '/stock/history',
      withParams(params),
    ),

  createIssue: (data) =>
    apiClient.post(
      '/stock-ftth/issues',
      data,
    ),

  createReturn: (data) =>
    apiClient.post(
      '/stock-ftth/returns',
      data,
    ),

  createConsumption: (data) =>
    apiClient.post(
      '/stock-ftth/consumptions',
      data,
    ),

  addReception: (params) =>
    apiClient.post(
      '/stock-ftth/receptions',
      null,
      withParams(params),
    ),

  // EXPORT CENTER
  exportGenerate: (data) =>
    apiClient.post(
      '/export/generate',
      data,
      {
        responseType: 'blob',
      },
    ),

  exportPreview: (data) =>
    apiClient.post(
      '/export/preview',
      data,
    ),

  getExportColumns: () =>
    apiClient.get(
      '/export/columns',
    ),

  getExportProfiles: () =>
    apiClient.get(
      '/export/profiles',
    ),

  getExportFormats: () =>
    apiClient.get(
      '/export/formats',
    ),

  getExportTemplates: () =>
    apiClient.get(
      '/export/templates',
    ),

  createExportTemplate: (data) =>
    apiClient.post(
      '/export/templates',
      data,
    ),

  updateExportTemplate: (
    id,
    data,
  ) =>
    apiClient.put(
      `/export/templates/${pathSegment(
        id,
        'Modèle export',
      )}`,
      data,
    ),

  deleteExportTemplate: (id) =>
    apiClient.delete(
      `/export/templates/${pathSegment(
        id,
        'Modèle export',
      )}`,
    ),

  getExportHistory: (
    params = {},
  ) =>
    apiClient.get(
      '/export/history',
      withParams(params),
    ),

  // REPORTS LEGACY
  getJobsReport: (params = {}) =>
    apiClient.get(
      '/reports/jobs',
      withParams(params),
    ),

  getTechniciansReport: (
    params = {},
  ) =>
    apiClient.get(
      '/reports/technicians',
      withParams(params),
    ),

  getIncidentsReport: (
    params = {},
  ) =>
    apiClient.get(
      '/reports/incidents',
      withParams(params),
    ),

  getImportsReport: (
    params = {},
  ) =>
    apiClient.get(
      '/reports/imports',
      withParams(params),
    ),

  getKpiReport: (params = {}) =>
    apiClient.get(
      '/reports/kpi',
      withParams(params),
    ),

  // SECTORS
  getSectors: (params = {}) =>
    apiClient.get(
      '/sectors/',
      withParams(params),
    ),

  getSector: (id) =>
    apiClient.get(
      `/sectors/${pathSegment(
        id,
        'Secteur',
      )}`,
    ),

  createSector: (data) =>
    apiClient.post(
      '/sectors/',
      data,
    ),

  updateSector: (id, data) =>
    apiClient.put(
      `/sectors/${pathSegment(
        id,
        'Secteur',
      )}`,
      data,
    ),

  deleteSector: (id) =>
    apiClient.delete(
      `/sectors/${pathSegment(
        id,
        'Secteur',
      )}`,
    ),

  getSectorStats: (sectorId) =>
    apiClient.get(
      `/sectors/${pathSegment(
        sectorId,
        'Secteur',
      )}/stats`,
    ),

  getGlobalSectorStats: () =>
    apiClient.get(
      '/sectors/stats/global',
    ),

  // ORIENTEURS
  getOrienteurs: (
    params = {},
  ) =>
    apiClient.get(
      '/orienteurs/',
      withParams(params),
    ),

  getOrienteur: (id) =>
    apiClient.get(
      `/orienteurs/${pathSegment(
        id,
        'Orienteur',
      )}`,
    ),

  createOrienteur: (data) =>
    apiClient.post(
      '/orienteurs/',
      data,
    ),

  updateOrienteur: (
    id,
    data,
  ) =>
    apiClient.put(
      `/orienteurs/${pathSegment(
        id,
        'Orienteur',
      )}`,
      data,
    ),

  deleteOrienteur: (id) =>
    apiClient.delete(
      `/orienteurs/${pathSegment(
        id,
        'Orienteur',
      )}`,
    ),

  addOrienteurSector: (
    orienteurId,
    data,
  ) =>
    apiClient.post(
      `/orienteurs/${pathSegment(
        orienteurId,
        'Orienteur',
      )}/sectors`,
      data,
    ),

  removeOrienteurSector: (
    sectorId,
  ) =>
    apiClient.delete(
      `/orienteurs/sectors/${pathSegment(
        sectorId,
        'Affectation secteur',
      )}`,
    ),

  assignTechnicianToOrienteur: (
    orienteurId,
    technicianId,
  ) =>
    apiClient.post(
      `/orienteurs/${pathSegment(
        orienteurId,
        'Orienteur',
      )}/technicians/${pathSegment(
        technicianId,
        'Technicien',
      )}`,
      {},
    ),

  removeTechnicianFromOrienteur: (
    orienteurId,
    technicianId,
  ) =>
    apiClient.delete(
      `/orienteurs/${pathSegment(
        orienteurId,
        'Orienteur',
      )}/technicians/${pathSegment(
        technicianId,
        'Technicien',
      )}`,
    ),

  getOrienteurTechnicians: (
    orienteurId,
  ) =>
    apiClient.get(
      `/orienteurs/${pathSegment(
        orienteurId,
        'Orienteur',
      )}/technicians`,
    ),

  // JOB ACTIONS
  reassignJob: (
    jobId,
    dataOrTechId,
  ) =>
    isRecord(dataOrTechId)
      ? reassignJobAction(
          jobId,
          dataOrTechId,
        )
      : reassignAssignment(
          jobId,
          dataOrTechId,
        ),

  reassignJobAction,

  postponeJob: (jobId, data) =>
    apiClient.post(
      `/job-actions/${pathSegment(
        jobId,
        'Intervention',
      )}/postpone`,
      data,
    ),

  duplicateJob: (jobId) =>
    apiClient.post(
      `/job-actions/${pathSegment(
        jobId,
        'Intervention',
      )}/duplicate`,
    ),

  cancelJobWithReason: (
    jobId,
    data,
  ) =>
    apiClient.post(
      `/job-actions/${pathSegment(
        jobId,
        'Intervention',
      )}/cancel`,
      data,
    ),

  archiveJob: (
    jobId,
    data = {},
  ) =>
    apiClient.post(
      `/job-actions/${pathSegment(
        jobId,
        'Intervention',
      )}/archive`,
      data,
    ),

  getJobTimeline: (jobId) =>
    apiClient.get(
      `/job-actions/${pathSegment(
        jobId,
        'Intervention',
      )}/timeline`,
    ),

  getJobEquipment: (jobId) =>
    apiClient.get(
      `/job-actions/${pathSegment(
        jobId,
        'Intervention',
      )}/equipment`,
    ),

  getJobFieldRecord: (jobId) =>
    apiClient.get(
      `/job-actions/${pathSegment(jobId, 'Intervention')}/field-record`,
    ),

  resolveJobSiteObservation: (jobId, observationId, data) =>
    apiClient.post(
      `/job-actions/${pathSegment(jobId, 'Intervention')}/site-observations/${pathSegment(observationId, 'Repère')}/resolve`,
      data,
    ),

  resolveJobSiteAttribute: (jobId, observationId, data) =>
    apiClient.post(
      `/job-actions/${pathSegment(jobId, 'Intervention')}/site-attributes/${pathSegment(observationId, 'Observation')}/resolve`,
      data,
    ),

  resolvePreparedAddress: (data) =>
    apiClient.post('/geocoding/resolve', data),

  importSharedMapLocation: (value) =>
    apiClient.post('/geocoding/shared-map-location', { value }),

  uploadJobAttachment: (jobId, formData) => {
    if (!(formData instanceof FormData)) {
      throw new TypeError('La pièce jointe doit être envoyée en multipart.');
    }
    return apiClient.post(
      `/job-actions/${pathSegment(jobId, 'Intervention')}/attachments`,
      formData,
    );
  },

  addJobOfficeNote: (jobId, text) =>
    apiClient.post(
      `/job-actions/${pathSegment(jobId, 'Intervention')}/office-notes`,
      { text },
    ),

  getJobCommunications: (jobId) =>
    apiClient.get(
      `/job-actions/${pathSegment(jobId, 'Intervention')}/communications`,
    ),

  addJobCommunication: (jobId, data) =>
    apiClient.post(
      `/job-actions/${pathSegment(jobId, 'Intervention')}/communications`,
      data,
    ),

  acknowledgeJobCommunication: (jobId, communicationId) =>
    apiClient.post(
      `/job-actions/${pathSegment(jobId, 'Intervention')}/communications/${pathSegment(communicationId, 'Message')}/acknowledge`,
    ),

  resolveJobCommunication: (jobId, communicationId) =>
    apiClient.post(
      `/job-actions/${pathSegment(jobId, 'Intervention')}/communications/${pathSegment(communicationId, 'Message')}/resolve`,
    ),

  downloadJobAttachment: (jobId, attachmentId) =>
    apiClient.get(
      `/job-actions/${pathSegment(jobId, 'Intervention')}/attachments/${pathSegment(attachmentId, 'Pièce jointe')}/download`,
      { responseType: 'blob' },
    ),

  downloadTechnicianMedia: (jobId, mediaId) =>
    apiClient.get(
      `/job-actions/${pathSegment(jobId, 'Intervention')}/media/${pathSegment(mediaId, 'Média')}/download`,
      { responseType: 'blob' },
    ),

  // APPLICATION SETTINGS
  getRuntimeSettings: () =>
    apiClient.get(
      '/settings/runtime',
    ),

  getWorkflowCapabilities: () =>
    apiClient.get(
      '/workflow/capabilities',
    ),

  getJobWorkflowCapabilities: (jobId) =>
    apiClient.get(
      `/workflow/jobs/${pathSegment(
        jobId,
        'Intervention',
      )}/capabilities`,
    ),

  getOperationalSettings: () =>
    apiClient.get(
      '/settings/operational',
    ),

  updateOperationalSettings: (data) => {
    if (!isRecord(data)) {
      throw new TypeError(
        'Les paramètres opérationnels doivent être un objet',
      );
    }

    return apiClient.put(
      '/settings/operational',
      data,
    );
  },

  // V1 ADMINISTRATION
  getV1Clients: () => apiClient.get('/admin/v1/clients'),
  createV1Client: (data) => apiClient.post('/admin/v1/clients', data),
  updateV1Client: (id, data) =>
    apiClient.patch(`/admin/v1/clients/${pathSegment(id, 'Client')}`, data),
  createV1ClientAccount: (data) =>
    apiClient.post('/admin/v1/client-accounts', data),
  getV1Teams: () => apiClient.get('/admin/v1/teams'),
  createV1Team: (data) => apiClient.post('/admin/v1/teams', data),
  updateV1Team: (id, data) =>
    apiClient.patch(`/admin/v1/teams/${pathSegment(id, 'Équipe')}`, data),
  putV1TeamTechnician: (teamId, technicianId, data) =>
    apiClient.put(
      `/admin/v1/teams/${pathSegment(teamId, 'Équipe')}/technicians/${pathSegment(technicianId, 'Technicien')}`,
      data,
    ),
  removeV1TeamTechnician: (teamId, technicianId) =>
    apiClient.delete(
      `/admin/v1/teams/${pathSegment(teamId, 'Équipe')}/technicians/${pathSegment(technicianId, 'Technicien')}`,
    ),
  getClientV1Overview: () => apiClient.get('/client/v1/overview'),

  // AUDIT & SECURITY
  getAuditLog: (params = {}) =>
    apiClient.get(
      '/audit/log',
      withParams(params),
    ),

  getAuditSummary: (
    params = {},
  ) =>
    apiClient.get(
      '/audit/summary',
      withParams(params),
    ),
};

export default api;
