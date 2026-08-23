import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHolderOptions,
  filterHolderOptions,
  scopeForWarehouseSelection,
} from './stockHolderScope.js';

const warehouses = [
  { id: 1, name: 'Dépôt Central', code: 'CASA-01', city: 'Casablanca', warehouse_type: 'DEPOT' },
  { id: 2, name: 'Dotation Yassine', code: 'TECH-7', warehouse_type: 'TECHNICIEN' },
];

const technicians = [
  { id: 7, name: 'Yassine Benali', employee_id: 'T-007', team: 'Équipe A' },
  { id: 8, name: 'Sara Amrani', employee_id: 'T-008', team: 'Équipe B' },
];

test('holder options separate depots and technicians including technicians without stock', () => {
  const groups = buildHolderOptions(warehouses, technicians);

  assert.deepEqual(groups.physical.map((item) => item.key), ['warehouse:1']);
  assert.deepEqual(groups.technicians.map((item) => item.key), ['technician:8', 'technician:7']);

  const sara = groups.technicians.find((item) => item.technicianId === 8);
  assert.equal(sara.empty, true);
  assert.match(sara.meta, /aucun stock/i);
});

test('holder search matches technician name, matricule and warehouse code', () => {
  const groups = buildHolderOptions(warehouses, technicians);

  assert.deepEqual(
    filterHolderOptions(groups, 'T-007').technicians.map((item) => item.technicianId),
    [7],
  );
  assert.deepEqual(
    filterHolderOptions(groups, 'CASA-01').physical.map((item) => item.warehouseId),
    [1],
  );
  assert.deepEqual(
    filterHolderOptions(groups, 'Sara').technicians.map((item) => item.technicianId),
    [8],
  );
});

test('rail technician warehouse resolves the same technician and warehouse scope as holder picker', () => {
  assert.deepEqual(
    scopeForWarehouseSelection(2, warehouses, technicians),
    { kind: 'technician', warehouseId: 2, technicianId: 7 },
  );
});

test('rail physical warehouse and all-stock selection keep technician scope cleared', () => {
  assert.deepEqual(
    scopeForWarehouseSelection(1, warehouses, technicians),
    { kind: 'warehouse', warehouseId: 1, technicianId: null },
  );
  assert.deepEqual(
    scopeForWarehouseSelection(null, warehouses, technicians),
    { kind: 'all', warehouseId: null, technicianId: null },
  );
});
