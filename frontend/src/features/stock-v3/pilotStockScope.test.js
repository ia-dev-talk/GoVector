import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterPilotStockItems,
  filterPilotStockWarehouses,
  getPilotStockCodes,
  isPilotStockItem,
} from './pilotStockScope.js';

test('pilot stock only exposes confirmed FO16 and FO64 cable references', () => {
  assert.deepEqual(getPilotStockCodes(), ['FO16', 'FO64']);

  const source = [
    { reference: 'FO16', label: 'Câble fibre optique 16 FO' },
    { reference: 'CABLE-FO-64', label: 'Touret 64 fibres' },
    { reference: 'REF-096', label: 'Câble FO 96 fibres' },
    { reference: 'SYN-CABLE-DROP-INWI', label: 'Câble drop synthétique INWI' },
    { reference: 'SYN-ONT-ORANGE', label: 'ONT FTTH synthétique ORANGE' },
  ];

  assert.deepEqual(
    filterPilotStockItems(source).map((item) => item.reference),
    ['FO16', 'CABLE-FO-64'],
  );
});

test('pilot stock hides synthetic depots without hiding technician custody', () => {
  const warehouses = [
    { id: 1, code: 'CASA-01', name: 'Dépôt Casablanca', type: 'DEPOT' },
    { id: 2, code: 'SYN-CASA', name: 'Dépôt central synthétique Casablanca', type: 'DEPOT' },
    { id: 3, code: 'TECH-7', name: 'Stock Karim Tazi', type: 'TECHNICIEN' },
  ];

  assert.deepEqual(
    filterPilotStockWarehouses(warehouses).map((warehouse) => warehouse.id),
    [1, 3],
  );
});

test('pilot stock scope never admits unrelated synthetic equipment', () => {
  assert.equal(isPilotStockItem({ reference: 'SYN-CABLE-DROP-INWI' }), false);
  assert.equal(isPilotStockItem({ reference: 'SYN-ONT-INWI' }), false);
  assert.equal(isPilotStockItem({ reference: 'FO-96' }), false);
});
