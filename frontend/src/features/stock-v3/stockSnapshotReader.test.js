import assert from 'node:assert/strict';
import test from 'node:test';

import { createAtomicSnapshotReader } from './stockSnapshotReader.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('stock snapshot readers share one coherent request cohort', async () => {
  const calls = new Map();
  const loaders = Object.fromEntries(
    ['items', 'warehouses', 'lines', 'movements', 'technicians'].map((key) => [
      key,
      () => {
        calls.set(key, (calls.get(key) ?? 0) + 1);
        return Promise.resolve(`${key}-snapshot-a`);
      },
    ]),
  );
  const reader = createAtomicSnapshotReader(loaders);

  const values = await Promise.all([
    reader.items(),
    reader.warehouses(),
    reader.lines(),
    reader.movements(),
    reader.technicians(),
  ]);

  assert.deepEqual(values, [
    'items-snapshot-a',
    'warehouses-snapshot-a',
    'lines-snapshot-a',
    'movements-snapshot-a',
    'technicians-snapshot-a',
  ]);
  for (const key of Object.keys(loaders)) assert.equal(calls.get(key), 1);
});

test('one failed stock dependency rejects the entire published cohort', async () => {
  const lines = deferred();
  const reader = createAtomicSnapshotReader({
    items: () => Promise.resolve('items-b'),
    warehouses: () => Promise.resolve('warehouses-b'),
    lines: () => lines.promise,
    movements: () => Promise.resolve('movements-b'),
    technicians: () => Promise.resolve('technicians-b'),
  });

  const reads = [
    reader.items(),
    reader.warehouses(),
    reader.lines(),
    reader.movements(),
    reader.technicians(),
  ];
  lines.reject(new Error('Quantités indisponibles'));

  const results = await Promise.allSettled(reads);
  assert.equal(results.every((result) => result.status === 'rejected'), true);
  for (const result of results) {
    assert.match(result.reason.message, /Quantités indisponibles/);
  }
});

test('a failed stock cohort is released so the next refresh can recover', async () => {
  let generation = 0;
  const reader = createAtomicSnapshotReader({
    items: () => Promise.resolve(`items-${generation}`),
    warehouses: () => Promise.resolve(`warehouses-${generation}`),
    lines: () => generation === 0
      ? Promise.reject(new Error('temporary failure'))
      : Promise.resolve(`lines-${generation}`),
    movements: () => Promise.resolve(`movements-${generation}`),
    technicians: () => Promise.resolve(`technicians-${generation}`),
  });

  const failed = await Promise.allSettled([
    reader.items(),
    reader.warehouses(),
    reader.lines(),
    reader.movements(),
    reader.technicians(),
  ]);
  assert.equal(failed.every((result) => result.status === 'rejected'), true);

  generation = 1;
  assert.equal(await reader.lines(), 'lines-1');
  assert.equal(await reader.items(), 'items-1');
});
