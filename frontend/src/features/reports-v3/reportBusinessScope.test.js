import assert from 'node:assert/strict';
import test from 'node:test';

import { buildReportExportFilters } from '../../components/export/exportScope.js';
import {
  buildReportBusinessFilterOptions,
  filterReportJobs,
  normalizeReportBusinessFilters,
  reportBusinessFilterCount,
} from './reportBusinessScope.js';

const JOBS = [
  {
    id: 1,
    sector_id: 7,
    sector_name: 'Maarif',
    assigned_tech_id: 12,
    assigned_tech_name: 'Amine',
    job_type: 'INSTALLATION',
    operator: 'IAM',
    status: 'COMPLETED',
  },
  {
    id: 2,
    sector_id: 8,
    sector_name: 'Hay Hassani',
    assigned_tech_id: 44,
    assigned_tech_name: 'Yassine',
    job_type: 'SAV',
    operator: 'Orange',
    status: 'IN_PROGRESS',
  },
  {
    id: 3,
    sector_id: 7,
    sector_name: 'Maarif',
    assigned_tech_id: 12,
    assigned_tech_name: 'Amine',
    job_type: 'INSTALLATION',
    operator: 'iam',
    status: 'COMPLETED',
  },
];

test('normalise les cinq dimensions métier sans conserver les valeurs vides', () => {
  assert.deepEqual(
    normalizeReportBusinessFilters({
      sector_id: '7',
      technician_id: 12,
      job_type: 'JobType.INSTALLATION',
      operator: ' iam ',
      status: 'JobStatus.COMPLETED',
      ignored: 'x',
    }),
    {
      sector_id: 7,
      technician_id: 12,
      job_type: 'installation',
      operator: 'IAM',
      status: 'completed',
    },
  );
});

test('combine secteur, technicien, type, opérateur et statut sur le dataset complet', () => {
  const filters = {
    sector_id: 7,
    technician_id: 12,
    job_type: 'installation',
    operator: 'IAM',
    status: 'completed',
  };

  assert.deepEqual(filterReportJobs(JOBS, filters).map((job) => job.id), [1, 3]);
  assert.equal(reportBusinessFilterCount(filters), 5);
});

test('construit des options dédupliquées et lisibles depuis les données réelles', () => {
  const options = buildReportBusinessFilterOptions(JOBS);

  assert.deepEqual(options.sectors, [
    { value: 8, label: 'Hay Hassani' },
    { value: 7, label: 'Maarif' },
  ]);
  assert.deepEqual(options.technicians, [
    { value: 12, label: 'Amine' },
    { value: 44, label: 'Yassine' },
  ]);
  assert.deepEqual(options.operators.map((item) => item.value), ['IAM', 'ORANGE']);
});

test('le filtre Rapports utilise le secteur opérationnel canonique et non la micro-zone brute', () => {
  const jobs = [{
    id: 31,
    sector_id: 4,
    sector_name: 'Secteur Sud',
    sector_raw: 'Sidi Maârouf',
    route_criteria: 'Sidi Maârouf',
    status: 'ASSIGNED',
  }];

  assert.deepEqual(buildReportBusinessFilterOptions(jobs).sectors, [
    { value: 4, label: 'Secteur Sud' },
  ]);
  assert.deepEqual(
    filterReportJobs(jobs, { sector_id: 4 }).map((job) => job.id),
    [31],
  );
  assert.equal(filterReportJobs(jobs, { sector_id: 3 }).length, 0);
});

test('le scope export reprend exactement la période et les filtres métier normalisés', () => {
  const filters = normalizeReportBusinessFilters({
    sector_id: '7',
    technician_id: '12',
    job_type: 'INSTALLATION',
    operator: 'iam',
    status: 'COMPLETED',
  });

  assert.deepEqual(
    buildReportExportFilters({
      startDate: '2026-08-01',
      endDate: '2026-08-21',
      filters,
    }),
    {
      sector_id: 7,
      technician_id: 12,
      job_type: 'installation',
      operator: 'IAM',
      status: 'completed',
      start_date: '2026-08-01',
      end_date: '2026-08-21',
    },
  );
});
