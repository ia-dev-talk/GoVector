import assert from 'node:assert/strict';
import test from 'node:test';

import {
  eligibleTechniciansForJobs,
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

test('assignment rail keeps only team coverage and real skills for one sector', () => {
  const technicians = [
    {
      id: 3,
      name: 'Compatible',
      is_active: true,
      status: 'disponible',
      team_id: 8,
      team_name: 'Équipe Sud',
      sector_ids: [4],
      skills: ['PTO', 'MESURE'],
    },
    {
      id: 4,
      name: 'Mauvais secteur',
      is_active: true,
      status: 'disponible',
      team_id: 9,
      sector_ids: [7],
      skills: ['PTO', 'MESURE'],
    },
    {
      id: 5,
      name: 'Compétence manquante',
      is_active: true,
      status: 'disponible',
      team_id: 8,
      sector_ids: [4],
      skills: ['PTO'],
    },
  ];
  const jobs = [
    { id: 10, sector_id: 4, required_skills: ['PTO'] },
    { id: 11, sector_id: 4, required_skills: ['MESURE'] },
  ];

  assert.deepEqual(
    eligibleTechniciansForJobs(technicians, jobs, [10, 11]),
    [technicians[0]],
  );
  assert.deepEqual(
    eligibleTechniciansForJobs(
      technicians,
      [...jobs, { id: 12, sector_id: 7, required_skills: [] }],
      [10, 12],
    ),
    [],
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
