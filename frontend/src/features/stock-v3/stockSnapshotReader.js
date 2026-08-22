export function createAtomicSnapshotReader(loaders) {
  const entries = Object.entries(loaders ?? {});
  if (entries.length === 0) {
    throw new Error('At least one stock snapshot loader is required.');
  }

  let activeSnapshot = null;
  let snapshotReady = false;
  let snapshotStale = false;

  const readSnapshot = () => {
    if (activeSnapshot) return activeSnapshot;

    const currentSnapshot = Promise.all(
      entries.map(([, load]) => Promise.resolve().then(() => load())),
    ).then((values) => Object.fromEntries(
      entries.map(([key], index) => [key, values[index]]),
    ));

    activeSnapshot = currentSnapshot;
    const release = () => {
      if (activeSnapshot === currentSnapshot) activeSnapshot = null;
    };
    currentSnapshot.then(
      () => {
        snapshotReady = true;
        snapshotStale = false;
        release();
      },
      () => {
        snapshotStale = true;
        release();
      },
    );

    return currentSnapshot;
  };

  const readers = Object.fromEntries(
    entries.map(([key]) => [
      key,
      () => readSnapshot().then((snapshot) => snapshot[key]),
    ]),
  );

  return Object.freeze({
    ...readers,
    isReady: () => snapshotReady,
    isStale: () => snapshotStale,
    isRefreshing: () => activeSnapshot !== null,
    isWritable: () => snapshotReady && !snapshotStale && activeSnapshot === null,
  });
}

export function assertWritableStockSnapshot(reader, action = 'modifier le stock') {
  if (reader?.isWritable?.()) return;

  const error = new Error(
    `Impossible de ${action} tant qu’un snapshot stock complet et frais n’est pas validé. Actualisez les données puis réessayez.`,
  );
  error.code = 'BLUEVECTOR_STOCK_SNAPSHOT_NOT_WRITABLE';
  throw error;
}
