export const SECTOR_SNAPSHOT_KEYS = [
  'sectors',
  'technicians',
  'jobs',
  'assignments',
];

export function canMutateSectorSnapshot({
  canManage = false,
  loading = false,
  refreshing = false,
  stale = false,
} = {}) {
  return Boolean(canManage) && !loading && !refreshing && !stale;
}

export function buildSectorSnapshotFromSettled(results, toRecords) {
  if (!Array.isArray(results) || results.length !== SECTOR_SNAPSHOT_KEYS.length) {
    throw new Error('Invalid sector snapshot result set');
  }

  const failedIndexes = results
    .map((result, index) => (result?.status === 'fulfilled' ? -1 : index))
    .filter((index) => index >= 0);

  if (failedIndexes.length > 0) {
    return {
      ok: false,
      failedIndexes,
      snapshot: null,
    };
  }

  const normalize = typeof toRecords === 'function'
    ? toRecords
    : (value) => value;

  return {
    ok: true,
    failedIndexes: [],
    snapshot: Object.fromEntries(
      SECTOR_SNAPSHOT_KEYS.map((key, index) => [
        key,
        normalize(results[index]?.value?.data),
      ]),
    ),
  };
}
