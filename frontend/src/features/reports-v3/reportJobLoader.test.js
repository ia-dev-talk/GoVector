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
  const expectedPass = [
    { scheduled_date: '2026-08-20', skip: 0, limit: 500 },
    { scheduled_date: '2026-08-20', skip: 500, limit: 500 },
    { scheduled_date: '2026-08-21', skip: 0, limit: 500 },
    { scheduled_date: '2026-08-21', skip: 500, limit: 500 },
  ];
  assert.deepEqual(calls, [...expectedPass, ...expectedPass]);
});

test('fetchCompleteReportJobs ne double pas les requêtes si aucune journée ne nécessite de pagination', async () => {
  const calls = [];
  const jobs = await fetchCompleteReportJobs({
    dateFrom: '2026-08-20',
    dateTo: '2026-08-21',
    pageSize: 500,
    fetchPage: async (params) => {
      calls.push(params);
      return { data: [{ id: params.scheduled_date === '2026-08-20' ? 1 : 2 }] };
    },
  });

  assert.deepEqual(jobs.map((job) => job.id), [1, 2]);
  assert.equal(calls.length, 2);
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

test('fetchCompleteReportJobs réessaie après une suppression qui décale les offsets', async () => {
  let records = Array.from({ length: 5 }, (_, index) => ({ id: index + 1, status: 'ASSIGNED' }));
  let callCount = 0;

  const jobs = await fetchCompleteReportJobs({
    dateFrom: '2026-08-21',
    dateTo: '2026-08-21',
    pageSize: 3,
    fetchPage: async ({ skip, limit }) => {
      callCount += 1;
      if (callCount === 2) records = records.filter((job) => job.id !== 1);
      return { data: records.slice(skip, skip + limit) };
    },
  });

  assert.deepEqual(jobs.map((job) => job.id), [2, 3, 4, 5]);
  assert.equal(callCount, 6);
});

test('fetchCompleteReportJobs réessaie quand une intervention sort du jour entre deux pages', async () => {
  let records = Array.from({ length: 5 }, (_, index) => ({
    id: index + 1,
    scheduled_date: '2026-08-21',
  }));
  let callCount = 0;

  const jobs = await fetchCompleteReportJobs({
    dateFrom: '2026-08-21',
    dateTo: '2026-08-21',
    pageSize: 3,
    fetchPage: async ({ skip, limit }) => {
      callCount += 1;
      if (callCount === 2) {
        records = records.filter((job) => job.id !== 1);
      }
      return { data: records.slice(skip, skip + limit) };
    },
  });

  assert.deepEqual(jobs.map((job) => job.id), [2, 3, 4, 5]);
  assert.equal(callCount, 6);
});

test('fetchCompleteReportJobs échoue si aucun snapshot paginé consécutif ne se stabilise', async () => {
  let callCount = 0;

  await assert.rejects(
    fetchCompleteReportJobs({
      dateFrom: '2026-08-21',
      dateTo: '2026-08-21',
      pageSize: 2,
      maxSnapshotPasses: 3,
      fetchPage: async ({ skip }) => {
        const pass = Math.floor(callCount / 2);
        callCount += 1;
        const status = pass % 2 === 0 ? 'ASSIGNED' : 'IN_PROGRESS';
        const records = [
          { id: 1, status },
          { id: 2, status: 'ASSIGNED' },
          { id: 3, status: 'ASSIGNED' },
        ];
        return { data: records.slice(skip, skip + 2) };
      },
    }),
    (error) => error?.code === 'BLUEVECTOR_REPORT_COLLECTION_UNSTABLE',
  );
  assert.equal(callCount, 6);
});
