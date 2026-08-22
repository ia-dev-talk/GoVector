import {
  api,
  apiClient,
} from '../../api/client';
import { createAtomicSnapshotReader } from './stockSnapshotReader.js';


const stockSnapshotReader = createAtomicSnapshotReader({
  items: () => api.getStockItems(),
  warehouses: () => api.getWarehouses(),
  lines: () => apiClient.get('/stock-ftth/lines'),
  movements: () => apiClient.get('/stock-ftth/movements'),
  technicians: () => api.getTechnicians(),
});


export const stockV3Api = Object.freeze({
  // StocksPage reads these five resources together. They intentionally share
  // one all-or-nothing cohort so Promise.allSettled cannot publish a mixture
  // of fresh and stale stock generations after a partial refresh failure.
  getItems: stockSnapshotReader.items,

  getWarehouses: stockSnapshotReader.warehouses,

  getTechnicians: stockSnapshotReader.technicians,

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

  getLines: stockSnapshotReader.lines,

  getMovements: stockSnapshotReader.movements,

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
