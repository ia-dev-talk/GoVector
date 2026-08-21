import assert from 'node:assert/strict';
import test from 'node:test';

import {
  enumerateCivilDateKeys,
  fetchCompleteReportJobs,
} from './reportJobLoader.js';

test('enumerateCivilDateKeys conserve une plage civile inclusive', () => {
  assert.deepEqual(
    enumerateCivilDateKeys('2026-08-19', '2026-08-21'),
    ['2026-08-19', '2026-08-20', '2026-08-21'],
  );
});

test('fetchCompleteReportJobs pagine chaque journée sans plafond global à 1000', async () => {
  const calls = [];
  const perDay = new Map([
    ['2026-08-20', Array.from({ length: 650 }, (_, index) => ({ id: index + 1 }))],
    ['2026-08-21', Array.from({ length: 525 }, (_, index) => ({ id: 1001 + index }))],
  ]);

  const jobs = await fetchCompleteReportJobs({
    dateFrom: '2026-08-20',
    dateTo: '2026-08-21',
    pageSize: 500,
    fetchPage: async (params) => {
      calls.push(params);
      const records = perDay.get(params.scheduled_date) || [];
      return { data: records.slice(params.skip, params.skip + params.limit) };
    },
  });

  assert.equal(jobs.length, 1175);
  assert.deepEqual(calls, [
    { scheduled_date: '2026-08-20', skip: 0, limit: 500 },
    { scheduled_date: '2026-08-20', skip: 500, limit: 500 },
    { scheduled_date: '2026-08-21', skip: 0, limit: 500 },
    { scheduled_date: '2026-08-21', skip: 500, limit: 500 },
  ]);
});

test('fetchCompleteReportJobs refuse un doublon révélant une pagination instable', async () => {
  await assert.rejects(
    fetchCompleteReportJobs({
      dateFrom: '2026-08-21',
      dateTo: '2026-08-21',
      pageSize: 2,
      fetchPage: async ({ skip }) => ({
        data: skip === 0
          ? [{ id: 1 }, { id: 2 }]
          : [{ id: 2 }, { id: 3 }],
      }),
    }),
    (error) => error?.code === 'BLUEVECTOR_REPORT_COLLECTION_UNSTABLE',
  );
});
