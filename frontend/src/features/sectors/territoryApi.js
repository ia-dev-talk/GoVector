import { apiClient } from '../../api/client';

function territoryPath(id) {
  const value = Number(id);
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError('Identifiant territoire invalide');
  }
  return `/territories/${value}`;
}

async function reconcileBeforeList() {
  try {
    await apiClient.post('/territories/reconcile');
  } catch (error) {
    // Read-only users must still be able to consult the territory registry.
    // 404 also keeps the frontend compatible during a rolling backend update.
    if (![401, 403, 404].includes(error?.response?.status)) {
      throw error;
    }
  }
}

export const territoryApi = {
  list: async ({ includeInactive = true, reconcile = true } = {}) => {
    if (reconcile) await reconcileBeforeList();
    return apiClient.get('/territories', {
      params: { include_inactive: includeInactive },
    });
  },
  create: (document) => apiClient.post('/territories', document),
  update: (id, document) => apiClient.put(territoryPath(id), document),
  deactivate: (id) => apiClient.delete(territoryPath(id)),
  reconcile: () => apiClient.post('/territories/reconcile'),
  exportGeoJson: ({ includeInactive = false } = {}) => apiClient.get(
    '/territories/geojson',
    { params: { include_inactive: includeInactive } },
  ),
  importGeoJson: (featureCollection, { source = 'qgis', updateExisting = true } = {}) => apiClient.post(
    '/territories/import-geojson',
    {
      feature_collection: featureCollection,
      source,
      update_existing: updateExisting,
    },
  ),
};

export default territoryApi;
