import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectAllPages,
  createInterventionScopeCoordinator,
  installExhaustiveCollectionFetching,
} from './exhaustiveCollections.js';

function rows(start, count) {
  return Array.from({ length: count }, (_, index) => ({
    id: start + index,
  }));
}

function sliceDataset(dataset, params) {
  return dataset.slice(params.skip, params.skip + params.limit);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

test('collectAllPages verifies a stable paged collection before returning it', async () => {
  const calls = [];
  const dataset = rows(1, 620);
  const fetchPage = async (params) => {
    calls.push(params);
    return {
      data: sliceDataset(dataset, params),
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
    { scheduled_date: '2026-08-20', skip: 0, limit: 500 },
    { scheduled_date: '2026-08-20', skip: 500, limit: 500 },
    { scheduled_date: '2026-08-20', skip: 0, limit: 500 },
    { scheduled_date: '2026-08-20', skip: 500, limit: 500 },
  ]);
});

test('collectAllPages stabilizes after an insertion between offset pages without losing snapshot ids', async () => {
  let dataset = rows(1, 620);
  let mutated = false;
  let calls = 0;

  const response = await collectAllPages(async (params) => {
    calls += 1;
    if (!mutated && params.skip === 500) {
      dataset = [{ id: 0 }, ...dataset];
      mutated = true;
    }
    return { data: sliceDataset(dataset, params) };
  });

  assert.equal(calls, 6);
  assert.equal(response.data.length, 621);
  const ids = new Set(response.data.map((item) => item.id));
  assert.equal(ids.has(0), true);
  for (let id = 1; id <= 620; id += 1) {
    assert.equal(ids.has(id), true, `id ${id} doit rester présent`);
  }
});

test('collectAllPages stabilizes after a deletion between offset pages without losing remaining ids', async () => {
  let dataset = rows(1, 620);
  let mutated = false;
  let calls = 0;

  const response = await collectAllPages(async (params) => {
    calls += 1;
    if (!mutated && params.skip === 500) {
      dataset = dataset.filter((item) => item.id !== 1);
      mutated = true;
    }
    return { data: sliceDataset(dataset, params) };
  });

  assert.equal(calls, 6);
  assert.equal(response.data.length, 619);
  const ids = new Set(response.data.map((item) => item.id));
  assert.equal(ids.has(1), false);
  for (let id = 2; id <= 620; id += 1) {
    assert.equal(ids.has(id), true, `id ${id} doit rester présent`);
  }
});

test('collectAllPages does not accept stable ids when a job status changed between passes', async () => {
  let dataset = rows(1, 620).map((item) => ({
    ...item,
    status: 'ASSIGNED',
    technician_id: 12,
  }));
  let calls = 0;

  const response = await collectAllPages(async (params) => {
    calls += 1;
    if (calls === 3) {
      dataset = dataset.map((item) => (
        item.id === 100
          ? { ...item, status: 'IN_PROGRESS', updated_at: '2026-08-21T01:00:00Z' }
          : item
      ));
    }
    return { data: sliceDataset(dataset, params) };
  });

  assert.equal(calls, 6);
  assert.equal(response.data.find((item) => item.id === 100)?.status, 'IN_PROGRESS');
});

test('collectAllPages does not accept stable ids when an assignment changed between passes', async () => {
  let dataset = rows(1, 620).map((item) => ({
    ...item,
    status: 'ASSIGNED',
    technician_id: 12,
  }));
  let calls = 0;

  const response = await collectAllPages(async (params) => {
    calls += 1;
    if (calls === 3) {
      dataset = dataset.map((item) => (
        item.id === 250
          ? { ...item, technician_id: 44, updated_at: '2026-08-21T01:05:00Z' }
          : item
      ));
    }
    return { data: sliceDataset(dataset, params) };
  });

  assert.equal(calls, 6);
  assert.equal(response.data.find((item) => item.id === 250)?.technician_id, 44);
});

test('collectAllPages fails explicitly when a paged collection never stabilizes', async () => {
  let dataset = rows(1, 620);
  let revision = 0;

  await assert.rejects(
    collectAllPages(async (params) => {
      if (params.skip === 0) {
        revision += 1;
        dataset = [{ id: -revision }, ...dataset];
      }
      return { data: sliceDataset(dataset, params) };
    }),
    (error) => {
      assert.equal(error.code, 'BLUEVECTOR_COLLECTION_UNSTABLE');
      assert.match(error.message, /modifiée pendant le chargement/i);
      return true;
    },
  );
});

test('scope coordinator blocks a requested date until all workspace surfaces are ready', async () => {
  const events = [];
  const coordinator = createInterventionScopeCoordinator((event) => events.push(event));
  const technicians = deferred();
  const jobs = deferred();
  const summary = deferred();

  coordinator.observeTechnicians(technicians.promise);
  coordinator.observeJobs('2026-08-20', jobs.promise);
  coordinator.observeSummary('2026-08-20', summary.promise);

  assert.deepEqual(events.map((event) => event.status), ['loading']);

  technicians.resolve({ data: [] });
  jobs.resolve({ data: [] });
  await flushMicrotasks();
  assert.deepEqual(events.map((event) => event.status), ['loading']);

  summary.resolve({ data: {} });
  await flushMicrotasks();
  assert.deepEqual(events.map((event) => event.status), ['loading', 'ready']);
});

test('scope coordinator reports collection instability as a blocking date error', async () => {
  const events = [];
  const coordinator = createInterventionScopeCoordinator((event) => events.push(event));
  const technicians = deferred();
  const jobs = deferred();
  const summary = deferred();

  coordinator.observeTechnicians(technicians.promise);
  coordinator.observeJobs('2026-08-19', jobs.promise);
  coordinator.observeSummary('2026-08-19', summary.promise);

  const error = new Error('unstable');
  error.code = 'BLUEVECTOR_COLLECTION_UNSTABLE';
  jobs.reject(error);
  technicians.resolve({ data: [] });
  summary.resolve({ data: {} });
  await flushMicrotasks();

  assert.equal(events.at(-1).status, 'error');
  assert.equal(events.at(-1).date, '2026-08-19');
  assert.equal(events.at(-1).code, 'BLUEVECTOR_COLLECTION_UNSTABLE');
});

test('scope coordinator ignores a late failure from an older date generation', async () => {
  const events = [];
  const coordinator = createInterventionScopeCoordinator((event) => events.push(event));
  const oldJobs = deferred();
  const newJobs = deferred();
  const newSummary = deferred();

  coordinator.observeJobs('2026-08-18', oldJobs.promise);
  coordinator.observeJobs('2026-08-19', newJobs.promise);
  coordinator.observeSummary('2026-08-19', newSummary.promise);

  oldJobs.reject(new Error('late old failure'));
  newJobs.resolve({ data: [] });
  newSummary.resolve({ data: {} });
  await flushMicrotasks();

  assert.deepEqual(
    events.map((event) => [event.status, event.date]),
    [
      ['loading', '2026-08-18'],
      ['loading', '2026-08-19'],
      ['ready', '2026-08-19'],
    ],
  );
});

test('installed wrappers make implicit jobs and technicians requests exhaustive and verified', async () => {
  const jobCalls = [];
  const technicianCalls = [];
  const jobs = rows(1, 525);
  const technicians = rows(1, 501);
  const fakeApi = {
    async getJobs(params) {
      jobCalls.push(params);
      return { data: sliceDataset(jobs, params) };
    },
    async getTechnicians(params) {
      technicianCalls.push(params);
      return { data: sliceDataset(technicians, params) };
    },
  };

  installExhaustiveCollectionFetching(fakeApi);

  const [jobsResponse, techniciansResponse] = await Promise.all([
    fakeApi.getJobs({ scheduled_date: '2026-08-20' }),
    fakeApi.getTechnicians(),
  ]);

  assert.equal(jobsResponse.data.length, 525);
  assert.equal(techniciansResponse.data.length, 501);
  assert.equal(jobCalls.length, 4);
  assert.equal(technicianCalls.length, 4);
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

test('single-page collections avoid an unnecessary stability pass', async () => {
  const calls = [];
  const response = await collectAllPages(async (params) => {
    calls.push(params);
    return { data: rows(1, 25) };
  });

  assert.equal(response.data.length, 25);
  assert.equal(calls.length, 1);
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
