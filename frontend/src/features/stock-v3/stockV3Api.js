import {
  api,
  apiClient,
} from '../../api/client';


export const stockV3Api = Object.freeze({
  getItems: () =>
    api.getStockItems(),

  getWarehouses: () =>
    api.getWarehouses(),

  createWarehouse: (document) =>
    apiClient.post(
      '/stock-ftth/warehouses',
      document,
    ),

  getLines: () =>
    apiClient.get(
      '/stock-ftth/lines',
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
});
