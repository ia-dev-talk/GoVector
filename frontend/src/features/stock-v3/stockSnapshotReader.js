export function createAtomicSnapshotReader(loaders) {
  const entries = Object.entries(loaders ?? {});
  if (entries.length === 0) {
    throw new Error('At least one stock snapshot loader is required.');
  }

  let activeSnapshot = null;

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
    currentSnapshot.then(release, release);

    return currentSnapshot;
  };

  return Object.freeze(Object.fromEntries(
    entries.map(([key]) => [
      key,
      () => readSnapshot().then((snapshot) => snapshot[key]),
    ]),
  ));
}
