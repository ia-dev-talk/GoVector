import {
  api,
  apiClient,
} from '../../api/client';
import {
  assertWritableStockSnapshot,
  createAtomicSnapshotReader,
} from './stockSnapshotReader.js';

const stockSnapshotReader = createAtomicSnapshotReader({
  items: () => api.getStockItems(),
  warehouses: () => api.getWarehouses(),
  lines: () => apiClient.get('/stock-ftth/lines'),
  movements: () => apiClient.get('/stock-ftth/movements'),
  technicians: () => api.getTechnicians(),
});

function guardedStockMutation(action, run) {
  assertWritableStockSnapshot(stockSnapshotReader, action);
  return run();
}

export const stockV3Api = Object.freeze({
  // StocksPage reads these five resources together. They intentionally share
  // one all-or-nothing cohort so Promise.allSettled cannot publish a mixture
  // of fresh and stale stock generations after a partial refresh failure.
  getItems: stockSnapshotReader.items,

  getWarehouses: stockSnapshotReader.warehouses,

  getTechnicians: stockSnapshotReader.technicians,

  isSnapshotReady: stockSnapshotReader.isReady,
  isSnapshotStale: stockSnapshotReader.isStale,
  isSnapshotRefreshing: stockSnapshotReader.isRefreshing,
  isSnapshotWritable: stockSnapshotReader.isWritable,

  createWarehouse: (document) => guardedStockMutation(
    'créer un dépôt',
    () => apiClient.post(
      '/stock-ftth/warehouses',
      document,
    ),
  ),

  updateWarehouse: (warehouseId, document) => guardedStockMutation(
    'modifier un dépôt',
    () => apiClient.put(
      `/stock-ftth/warehouses/${encodeURIComponent(warehouseId)}`,
      document,
    ),
  ),

  retireWarehouse: (warehouseId) => guardedStockMutation(
    'retirer un dépôt',
    () => apiClient.delete(
      `/stock-ftth/warehouses/${encodeURIComponent(warehouseId)}`,
    ),
  ),

  getLines: stockSnapshotReader.lines,

  getMovements: stockSnapshotReader.movements,

  getHistory: (params = {}) =>
    apiClient.get(
      '/stock-ftth/history-v2',
      { params },
    ),

  createItem: (document) => guardedStockMutation(
    'créer un article',
    () => apiClient.post(
      '/stock-ftth/items',
      document,
    ),
  ),

  updateItem: (
    itemId,
    document,
  ) => guardedStockMutation(
    'modifier un article',
    () => apiClient.put(
      `/stock-ftth/items/${encodeURIComponent(
        itemId,
      )}`,
      document,
    ),
  ),

  receive: (params) => guardedStockMutation(
    'enregistrer une réception',
    () => api.addReception(params),
  ),

  createIssue: (document) => guardedStockMutation(
    'affecter du stock à un technicien',
    () => apiClient.post(
      '/stock-ftth/technician-allocations',
      document,
    ),
  ),

  validateIssue: (issueId) => guardedStockMutation(
    'valider une dotation',
    () => apiClient.post(
      `/stock-ftth/issues/${encodeURIComponent(
        issueId,
      )}/validate-v2`,
    ),
  ),
});
