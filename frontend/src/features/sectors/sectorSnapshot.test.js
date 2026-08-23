import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSectorSnapshotFromSettled,
  canMutateSectorSnapshot,
  reconcileVisibleSectorSelection,
} from './sectorSnapshot.js';

const fulfilled = (data) => ({ status: 'fulfilled', value: { data } });
const rejected = (message) => ({ status: 'rejected', reason: new Error(message) });
const normalize = (value) => (Array.isArray(value) ? value : []);

test('sector snapshot publishes all four business slices together', () => {
  const result = buildSectorSnapshotFromSettled([
    fulfilled([{ id: 1 }]),
    fulfilled([{ id: 2 }]),
    fulfilled([{ id: 3 }]),
    fulfilled([{ id: 4 }]),
  ], normalize);

  assert.equal(result.ok, true);
  assert.deepEqual(result.failedIndexes, []);
  assert.deepEqual(result.snapshot, {
    sectors: [{ id: 1 }],
    technicians: [{ id: 2 }],
    jobs: [{ id: 3 }],
    assignments: [{ id: 4 }],
  });
});

test('sector snapshot rejects partial refresh instead of mixing generations', () => {
  const result = buildSectorSnapshotFromSettled([
    fulfilled([{ id: 'sector-b' }]),
    fulfilled([{ id: 'tech-b' }]),
    fulfilled([{ id: 'job-b' }]),
    rejected('assignments unavailable'),
  ], normalize);

  assert.equal(result.ok, false);
  assert.deepEqual(result.failedIndexes, [3]);
  assert.equal(result.snapshot, null);
});

test('sector snapshot rejects symmetric technician failure even if assignments are fresh', () => {
  const result = buildSectorSnapshotFromSettled([
    fulfilled([{ id: 'sector-c' }]),
    rejected('technicians unavailable'),
    fulfilled([{ id: 'job-c' }]),
    fulfilled([{ id: 'assignment-c' }]),
  ], normalize);

  assert.equal(result.ok, false);
  assert.deepEqual(result.failedIndexes, [1]);
  assert.equal(result.snapshot, null);
});

test('sector mutations are writable only on a fresh settled snapshot', () => {
  assert.equal(canMutateSectorSnapshot({ canManage: true }), true);
  assert.equal(canMutateSectorSnapshot({ canManage: false }), false);
  assert.equal(canMutateSectorSnapshot({ canManage: true, loading: true }), false);
  assert.equal(canMutateSectorSnapshot({ canManage: true, refreshing: true }), false);
  assert.equal(canMutateSectorSnapshot({ canManage: true, stale: true }), false);
  assert.equal(canMutateSectorSnapshot({
    canManage: true,
    loading: false,
    refreshing: false,
    stale: false,
  }), true);
});

test('sector selection is cleared when filters remove the selected sector', () => {
  const visible = [{ id: 2 }, { id: 3 }];
  assert.equal(reconcileVisibleSectorSelection(visible, 2), 2);
  assert.equal(reconcileVisibleSectorSelection(visible, 1), null);
  assert.equal(reconcileVisibleSectorSelection([], 2), null);
  assert.equal(reconcileVisibleSectorSelection(visible, null), null);
});

test('sector selection supports the normalized id contract used by the registry', () => {
  const visible = [{ rawId: '42' }];
  const getId = (sector) => Number(sector.rawId);
  assert.equal(reconcileVisibleSectorSelection(visible, 42, getId), 42);
  assert.equal(reconcileVisibleSectorSelection(visible, 7, getId), null);
});
