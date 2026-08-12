import {
  api,
  apiClient,
} from '../../api/client';


export const stockV3Api = Object.freeze({
  getItems: () =>
    api.getStockItems(),

  getWarehouses: () =>
    api.getWarehouses(),

  getTechnicians: () =>
    api.getTechnicians(),

  createWarehouse: (document) =>
    apiClient.post(
      '/stock-ftth/warehouses',
      document,
    ),

  getLines: (params = {}) =>
    apiClient.get(
      '/stock-ftth/lines',
      { params },
    ),

  getMovements: (params = {}) =>
    apiClient.get(
      '/stock-ftth/movements',
      {
        params,
      },
    ),

  getHistory: (params = {}) =>
    apiClient.get(
      '/stock-ftth/history-v2',
      { params },
    ),

  createItem: (document) =>
    apiClient.post(
      '/stock-ftth/items',
      document,
    ),

  updateItem: (
    itemId,
    document,
  ) =>
    apiClient.put(
      `/stock-ftth/items/${encodeURIComponent(
        itemId,
      )}`,
      document,
    ),

  receive: (params) =>
    api.addReception(params),

  // The public-V2 modal is a direct allocation workflow, so creation and
  // physical transfer are committed atomically by the server.
  createIssue: (document) =>
    apiClient.post(
      '/stock-ftth/technician-allocations',
      document,
    ),

  // Kept as an idempotent compatibility check for the existing page workflow.
  // An allocation created above is already VALIDE, so this call is a no-op.
  validateIssue: (issueId) =>
    apiClient.post(
      `/stock-ftth/issues/${encodeURIComponent(
        issueId,
      )}/validate-v2`,
    ),
});