import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildReportExportFilters,
  normalizeExportFilters,
  resolveExportFilters,
} from './exportScope.js';

test('buildReportExportFilters verrouille la période Rapports et conserve les filtres métier actifs', () => {
  assert.deepEqual(
    buildReportExportFilters({
      startDate: '2026-08-01',
      endDate: '2026-08-21',
      filters: {
        status: 'completed',
        sector_id: 42,
        date_preset: 'today',
        start_date: '2020-01-01',
        end_date: '2020-01-02',
      },
    }),
    {
      status: 'completed',
      sector_id: 42,
      start_date: '2026-08-01',
      end_date: '2026-08-21',
    },
  );
});

test('resolveExportFilters rend le scope fixe autoritatif face aux filtres locaux ou template', () => {
  const fixed = {
    start_date: '2026-08-20',
    end_date: '2026-08-21',
    status: 'assigned',
  };

  assert.deepEqual(
    resolveExportFilters(
      {
        date_preset: 'last_month',
        operator: 'ORANGE',
      },
      fixed,
    ),
    fixed,
  );
});

test('resolveExportFilters conserve le comportement historique hors scope fixe', () => {
  assert.deepEqual(
    resolveExportFilters({
      operator: 'IAM',
      status: '',
      technician_id: null,
    }),
    { operator: 'IAM' },
  );
});

test('buildReportExportFilters refuse un scope incomplet ou inversé', () => {
  assert.throws(
    () => buildReportExportFilters({
      startDate: '2026-08-21',
      endDate: '2026-08-20',
    }),
    RangeError,
  );

  assert.throws(
    () => buildReportExportFilters({
      startDate: '21/08/2026',
      endDate: '2026-08-21',
    }),
    TypeError,
  );
});

test('normalizeExportFilters retire uniquement les valeurs réellement absentes', () => {
  assert.deepEqual(
    normalizeExportFilters({
      search: 'client',
      sector_id: 0,
      enabled: false,
      empty: '',
      missing: undefined,
    }),
    {
      search: 'client',
      sector_id: 0,
      enabled: false,
    },
  );
});
