import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterPilotStockItems,
  getPilotStockCodes,
  isPilotStockItem,
} from './pilotStockScope.js';

test('pilot stock only exposes confirmed FO16 FO64 FO96 cable references', () => {
  assert.deepEqual(getPilotStockCodes(), ['FO16', 'FO64', 'FO96']);

  const source = [
    { reference: 'FO16', label: 'Câble fibre optique 16 FO' },
    { reference: 'CABLE-FO-64', label: 'Touret 64 fibres' },
    { reference: 'REF-096', label: 'Câble FO 96 fibres' },
    { reference: 'SYN-CABLE-DROP-INWI', label: 'Câble drop synthétique INWI' },
    { reference: 'SYN-ONT-ORANGE', label: 'ONT FTTH synthétique ORANGE' },
  ];

  assert.deepEqual(
    filterPilotStockItems(source).map((item) => item.reference),
    ['FO16', 'CABLE-FO-64', 'REF-096'],
  );
});

test('pilot stock scope never admits unrelated synthetic equipment', () => {
  assert.equal(isPilotStockItem({ reference: 'SYN-CABLE-DROP-INWI' }), false);
  assert.equal(isPilotStockItem({ reference: 'SYN-ONT-INWI' }), false);
  assert.equal(isPilotStockItem({ reference: 'FO-96' }), true);
});
