import { apiClient } from '../../api/client';

function territoryPath(id) {
  const value = String(id ?? '').trim();
  if (!value) throw new TypeError('Territoire obligatoire');
  return `/territories/${encodeURIComponent(value)}`;
}

export const territoryApi = {
  list: ({ includeInactive = true } = {}) =>
    apiClient.get('/territories', {
      params: { include_inactive: includeInactive },
    }),

  create: (document) => apiClient.post('/territories', document),

  update: (id, document) => apiClient.put(territoryPath(id), document),

  deactivate: (id) => apiClient.delete(territoryPath(id)),

  exportGeoJson: ({ includeInactive = false } = {}) =>
    apiClient.get('/territories/geojson', {
      params: { include_inactive: includeInactive },
    }),

  importGeoJson: (featureCollection, { source = 'qgis', updateExisting = true } = {}) =>
    apiClient.post('/territories/import-geojson', {
      feature_collection: featureCollection,
      source,
      update_existing: updateExisting,
    }),
};

export default territoryApi;
