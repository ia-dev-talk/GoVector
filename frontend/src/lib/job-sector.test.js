import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterTechniciansForInterventionScope,
  jobOperationalSector,
} from './job-sector.js';

test('uses the canonical operational sector before the raw locality', () => {
  assert.equal(
    jobOperationalSector({
      sector_id: 4,
      sector_name: 'Secteur Sud',
      sector_raw: 'Sidi Maârouf',
      route_criteria: 'Sidi Maârouf',
    }),
    'Secteur Sud',
  );
});

test('keeps raw route values as a compatibility fallback for legacy rows', () => {
  assert.equal(
    jobOperationalSector({ route_criteria: 'Sidi Maârouf' }),
    'Sidi Maârouf',
  );
  assert.equal(jobOperationalSector(null), '');
});

test('job sector filter keeps technicians visible when no technician sector contract exists', () => {
  const technicians = [
    { id: 3, name: 'Karim Tazi', team: 'Équipe A' },
    { id: 4, name: 'Khadija El Harti', team: 'Équipe B' },
  ];

  assert.deepEqual(
    filterTechniciansForInterventionScope(technicians, {
      sector: 'Secteur Sud',
    }),
    technicians,
  );
  assert.deepEqual(
    filterTechniciansForInterventionScope(technicians, {
      sector: 'Secteur Sud',
      team: 'Équipe A',
    }),
    [technicians[0]],
  );
});
