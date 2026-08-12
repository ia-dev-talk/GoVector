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

  createIssue: (document) =>
    apiClient.post(
      '/stock-ftth/issues',
      document,
    ),

  // Public V2: validation is a physical depot -> technician custody transfer,
  // not a reservation masquerading as an allocation.
  validateIssue: (issueId) =>
    apiClient.post(
      `/stock-ftth/issues/${encodeURIComponent(
        issueId,
      )}/validate-v2`,
    ),
});