import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertWritableStockSnapshot,
  createAtomicSnapshotReader,
} from './stockSnapshotReader.js';
import {
  STOCK_DISCARD_MESSAGE,
  canCloseStockDraft,
  isStockDraftDirty,
} from './stockUnsavedChanges.js';

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
  assert.equal(reader.isReady(), true);
  assert.equal(reader.isStale(), false);
  assert.equal(reader.isRefreshing(), false);
  assert.equal(reader.isWritable(), true);
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
  assert.equal(reader.isRefreshing(), true);
  assert.equal(reader.isWritable(), false);

  lines.reject(new Error('Quantités indisponibles'));

  const results = await Promise.allSettled(reads);
  assert.equal(results.every((result) => result.status === 'rejected'), true);
  for (const result of results) {
    assert.match(result.reason.message, /Quantités indisponibles/);
  }
  assert.equal(reader.isStale(), true);
  assert.equal(reader.isWritable(), false);
});

test('stale state survives a retry until a complete cohort is published', async () => {
  let generation = 0;
  const retryLines = deferred();
  const reader = createAtomicSnapshotReader({
    items: () => Promise.resolve(`items-${generation}`),
    warehouses: () => Promise.resolve(`warehouses-${generation}`),
    lines: () => generation === 0
      ? Promise.reject(new Error('temporary failure'))
      : retryLines.promise,
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
  assert.equal(reader.isStale(), true);
  assert.equal(reader.isWritable(), false);

  generation = 1;
  const retry = Promise.all([
    reader.items(),
    reader.warehouses(),
    reader.lines(),
    reader.movements(),
    reader.technicians(),
  ]);

  assert.equal(reader.isRefreshing(), true);
  assert.equal(reader.isStale(), true);
  assert.equal(reader.isWritable(), false);
  assert.throws(
    () => assertWritableStockSnapshot(reader, 'enregistrer une réception'),
    (error) => error?.code === 'BLUEVECTOR_STOCK_SNAPSHOT_NOT_WRITABLE',
  );

  retryLines.resolve('lines-1');
  await retry;

  assert.equal(reader.isRefreshing(), false);
  assert.equal(reader.isStale(), false);
  assert.equal(reader.isWritable(), true);
  assert.doesNotThrow(() => assertWritableStockSnapshot(reader));
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
  assert.equal(reader.isStale(), false);
  assert.equal(reader.isWritable(), true);
});

test('all visible stock mutation entry points respect snapshot writability', () => {
  const warehouseRail = readFileSync(
    new URL('./WarehouseRail.jsx', import.meta.url),
    'utf8',
  );
  const inspector = readFileSync(
    new URL('./StockInspector.jsx', import.meta.url),
    'utf8',
  );

  assert.match(warehouseRail, /const snapshotWritable = stockV3Api\.isSnapshotWritable\(\)/);
  assert.match(warehouseRail, /disabled=!\{snapshotWritable\}|disabled=\{!snapshotWritable\}/);

  assert.match(inspector, /const snapshotWritable = stockV3Api\.isSnapshotWritable\(\)/);
  assert.match(inspector, /disabled=\{!snapshotWritable\}/);
  assert.match(inspector, /disabled=\{!snapshotWritable \|\| !hasAvailableStock\}/);
  assert.match(inspector, /disabled=\{!snapshotWritable \|\| !canReceive\}/);
});

test('stock draft dirty policy only confirms destructive closes when needed', () => {
  const baseline = { reference: 'ONT-1', is_active: true };
  assert.equal(isStockDraftDirty(baseline, baseline), false);
  assert.equal(isStockDraftDirty({ ...baseline, reference: 'ONT-2' }, baseline), true);

  let prompts = 0;
  const confirmDiscard = (message) => {
    prompts += 1;
    assert.equal(message, STOCK_DISCARD_MESSAGE);
    return true;
  };

  assert.equal(canCloseStockDraft({ dirty: false, saving: false, confirmDiscard }), true);
  assert.equal(prompts, 0);
  assert.equal(canCloseStockDraft({ dirty: true, saving: false, confirmDiscard }), true);
  assert.equal(prompts, 1);
  assert.equal(canCloseStockDraft({ dirty: true, saving: true, confirmDiscard }), false);
  assert.equal(prompts, 1);
});

test('stock editor, warehouse and issue modals route destructive exits through the shared guard', () => {
  for (const filename of ['StockEditorModal.jsx', 'WarehouseEditorModal.jsx', 'StockIssueModal.jsx']) {
    const source = readFileSync(new URL(`./${filename}`, import.meta.url), 'utf8');
    assert.match(source, /canCloseStockDraft/);
    assert.match(source, /requestClose/);
    assert.match(source, /event\.key !== 'Escape'/);
    assert.doesNotMatch(source, /onClick=\{onClose\}/);
  }
});
