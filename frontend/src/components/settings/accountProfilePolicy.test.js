import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOperationalAccountProfilePayload,
  canMutateOrganizationSnapshot,
  filterOperationalAccounts,
  operationalAccountRoleLabel,
  resolveOperationalAccountProfilePolicy,
  resolveOrganizationAvailability,
  resolveOrganizationSnapshot,
} from './accountProfilePolicy.js';

test('account directory uses readable role labels and combined filters', () => {
  const accounts = [
    { username: 'chef', email: 'chef@example.test', role: 'CHEF_ORIENTEUR', is_active: true },
    { username: 'field', email: 'field@example.test', role: 'TECHNICIAN', is_active: false },
  ];

  assert.equal(operationalAccountRoleLabel('CHEF_ORIENTEUR'), 'Agent terrain');
  assert.equal(operationalAccountRoleLabel('TECHNICIAN'), 'Technicien');
  assert.deepEqual(
    filterOperationalAccounts(accounts, { query: 'technicien', status: 'INACTIVE' }),
    [accounts[1]],
  );
  assert.deepEqual(
    filterOperationalAccounts(accounts, { role: 'CHEF_ORIENTEUR', status: 'ACTIVE' }),
    [accounts[0]],
  );
});

test('account profile policy mirrors backend role requirements', () => {
  assert.deepEqual(resolveOperationalAccountProfilePolicy('TECHNICIAN'), {
    role: 'TECHNICIAN',
    supported: true,
    field: 'technician_id',
    label: 'profil technicien',
  });
  assert.deepEqual(resolveOperationalAccountProfilePolicy('ORIENTEUR'), {
    role: 'ORIENTEUR',
    supported: true,
    field: 'orienteur_id',
    label: 'profil orienteur',
  });
  assert.equal(resolveOperationalAccountProfilePolicy('ADMIN').field, null);
  assert.deepEqual(resolveOperationalAccountProfilePolicy('CHEF_ORIENTEUR'), {
    role: 'CHEF_ORIENTEUR',
    supported: true,
    field: 'orienteur_id',
    label: 'profil équipe',
  });
});

test('technician accounts require exactly one valid technician profile', () => {
  assert.equal(
    buildOperationalAccountProfilePayload('TECHNICIAN', {}).valid,
    false,
  );
  assert.deepEqual(
    buildOperationalAccountProfilePayload('TECHNICIAN', {
      technicianId: '42',
      orienteurId: '7',
    }),
    {
      valid: true,
      error: '',
      technician_id: 42,
      orienteur_id: null,
    },
  );
});

test('orienteur accounts require exactly one valid orienteur profile', () => {
  assert.equal(
    buildOperationalAccountProfilePayload('ORIENTEUR', { orienteurId: '0' }).valid,
    false,
  );
  assert.deepEqual(
    buildOperationalAccountProfilePayload('ORIENTEUR', {
      technicianId: '42',
      orienteurId: '7',
    }),
    {
      valid: true,
      error: '',
      technician_id: null,
      orienteur_id: 7,
    },
  );
});

test('admin drops stale links while field agent requires its team profile', () => {
  assert.deepEqual(
    buildOperationalAccountProfilePayload('ADMIN', { technicianId: '42', orienteurId: '7' }),
    { valid: true, error: '', technician_id: null, orienteur_id: null },
  );
  assert.equal(buildOperationalAccountProfilePayload('CHEF_ORIENTEUR', {}).valid, false);
  assert.deepEqual(
    buildOperationalAccountProfilePayload('CHEF_ORIENTEUR', { orienteurId: '7' }),
    { valid: true, error: '', technician_id: null, orienteur_id: 7 },
  );
});

test('unsupported roles fail closed', () => {
  const result = buildOperationalAccountProfilePayload('CLIENT', {
    technicianId: '42',
    orienteurId: '7',
  });
  assert.equal(result.valid, false);
  assert.equal(result.technician_id, null);
  assert.equal(result.orienteur_id, null);
});

test('organization snapshot publishes only when every source succeeds', () => {
  const results = Array.from({ length: 7 }, (_, index) => ({
    status: 'fulfilled',
    value: { data: index === 5 ? { values: {} } : [{ id: index + 1 }] },
  }));
  const snapshot = resolveOrganizationSnapshot(results);
  assert.equal(snapshot.complete, true);
  assert.deepEqual(snapshot.warnings, []);
  assert.deepEqual(snapshot.values[3], [{ id: 4 }]);
});

test('organization snapshot never converts a failed source into a business empty list', () => {
  const results = Array.from({ length: 7 }, (_, index) => ({
    status: 'fulfilled',
    value: { data: [{ id: index + 1 }] },
  }));
  results[3] = { status: 'rejected', reason: new Error('sectors unavailable') };

  const snapshot = resolveOrganizationSnapshot(results);
  assert.equal(snapshot.complete, false);
  assert.deepEqual(snapshot.warnings, ['secteurs']);
  assert.equal(snapshot.values, null);
});

test('organization availability distinguishes first-load failure from stale snapshot', () => {
  assert.equal(
    resolveOrganizationAvailability({ loading: true, hasSnapshot: false }),
    'loading',
  );
  assert.equal(
    resolveOrganizationAvailability({ hasSnapshot: false, warnings: ['secteurs'] }),
    'unavailable',
  );
  assert.equal(
    resolveOrganizationAvailability({ hasSnapshot: true, warnings: ['secteurs'] }),
    'stale',
  );
  assert.equal(
    resolveOrganizationAvailability({ hasSnapshot: true, warnings: [] }),
    'ready',
  );
});

test('organization mutations require a fresh complete snapshot', () => {
  assert.equal(canMutateOrganizationSnapshot({ hasSnapshot: true }), true);
  assert.equal(canMutateOrganizationSnapshot({ hasSnapshot: false }), false);
  assert.equal(canMutateOrganizationSnapshot({ hasSnapshot: true, loading: true }), false);
  assert.equal(canMutateOrganizationSnapshot({ hasSnapshot: true, warnings: ['secteurs'] }), false);
});
