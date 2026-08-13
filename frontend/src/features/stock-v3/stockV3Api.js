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

  updateWarehouse: (warehouseId, document) =>
    apiClient.put(
      `/stock-ftth/warehouses/${encodeURIComponent(warehouseId)}`,
      document,
    ),

  retireWarehouse: (warehouseId) =>
    apiClient.delete(
      `/stock-ftth/warehouses/${encodeURIComponent(warehouseId)}`,
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

  createIssue: (document) =>
    apiClient.post(
      '/stock-ftth/technician-allocations',
      document,
    ),

  validateIssue: (issueId) =>
    apiClient.post(
      `/stock-ftth/issues/${encodeURIComponent(
        issueId,
      )}/validate-v2`,
    ),
});
