import test from 'node:test';
import assert from 'node:assert/strict';
import { getInterventionPermissions } from './interventionPermissions.js';

test('intervention deletion is limited to chef and admin roles', () => {
  assert.equal(
    getInterventionPermissions('ADMIN').canDeleteIntervention,
    true,
  );
  assert.equal(
    getInterventionPermissions('CHEF_ORIENTEUR').canDeleteIntervention,
    true,
  );
  assert.equal(
    getInterventionPermissions('ORIENTEUR').canDeleteIntervention,
    false,
  );
});

test('intervention deletion fails closed for missing or unknown roles', () => {
  assert.equal(
    getInterventionPermissions(null).canDeleteIntervention,
    false,
  );
  assert.equal(
    getInterventionPermissions('TECHNICIAN').canDeleteIntervention,
    false,
  );
  assert.equal(
    getInterventionPermissions('unknown').canDeleteIntervention,
    false,
  );
});
