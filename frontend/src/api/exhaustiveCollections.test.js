import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectAllPages,
  installExhaustiveCollectionFetching,
} from './exhaustiveCollections.js';

function rows(start, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: start + index,
  }));
}

test('collectAllPages fetches every page until exhaustion', async () => {
  const calls = [];
  const fetchPage = async (params) => {
    calls.push(params);
    const start = params.skip;
    const remaining = 620 - start;
    const count = Math.max(0, Math.min(params.limit, remaining));
    return {
      data: rows(start + 1, count),
      status: 200,
    };
  };

  const response = await collectAllPages(fetchPage, {
    scheduled_date: '2026-08-20',
  });

  assert.equal(response.data.length, 620);
  assert.equal(response.data[0].id, 1);
  assert.equal(response.data.at(-1).id, 620);
  assert.deepEqual(calls, [
    {
      scheduled_date: '2026-08-20',
      skip: 0,
      limit: 500,
    },
    {
      scheduled_date: '2026-08-20',
      skip: 500,
      limit: 500,
    },
  ]);
});

test('collectAllPages de-duplicates stable ids across shifting pages', async () => {
  let call = 0;
  const response = await collectAllPages(
    async () => {
      call += 1;
      if (call === 1) {
        return { data: rows(1, 500) };
      }
      return { data: [{ id: 500 }, { id: 501 }] };
    },
  );

  assert.equal(response.data.length, 501);
  assert.equal(response.data.at(-1).id, 501);
});

test('installed wrappers make implicit jobs and technicians requests exhaustive', async () => {
  const jobCalls = [];
  const technicianCalls = [];
  const fakeApi = {
    async getJobs(params) {
      jobCalls.push(params);
      return {
        data: params.skip === 0
          ? rows(1, 500)
          : rows(501, 25),
      };
    },
    async getTechnicians(params) {
      technicianCalls.push(params);
      return {
        data: params.skip === 0
          ? rows(1, 500)
          : rows(501, 1),
      };
    },
  };

  installExhaustiveCollectionFetching(fakeApi);

  const [jobs, technicians] = await Promise.all([
    fakeApi.getJobs({ scheduled_date: '2026-08-20' }),
    fakeApi.getTechnicians(),
  ]);

  assert.equal(jobs.data.length, 525);
  assert.equal(technicians.data.length, 501);
  assert.equal(jobCalls.length, 2);
  assert.equal(technicianCalls.length, 2);
});

test('explicit pagination remains untouched', async () => {
  const calls = [];
  const fakeApi = {
    async getJobs(params) {
      calls.push(params);
      return { data: [{ id: 42 }] };
    },
    async getTechnicians(params) {
      return { data: [], params };
    },
  };

  installExhaustiveCollectionFetching(fakeApi);
  const response = await fakeApi.getJobs({ skip: 10, limit: 20 });

  assert.deepEqual(calls, [{ skip: 10, limit: 20 }]);
  assert.deepEqual(response.data, [{ id: 42 }]);
});

test('installation is idempotent', async () => {
  const calls = [];
  const fakeApi = {
    async getJobs(params) {
      calls.push(params);
      return { data: [] };
    },
    async getTechnicians() {
      return { data: [] };
    },
  };

  installExhaustiveCollectionFetching(fakeApi);
  const wrappedGetJobs = fakeApi.getJobs;
  installExhaustiveCollectionFetching(fakeApi);

  assert.equal(fakeApi.getJobs, wrappedGetJobs);
  await fakeApi.getJobs();
  assert.equal(calls.length, 1);
});
