import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getInterventionPermissions,
  isInterventionDeleteRequest,
} from './interventionPermissions.js';

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

test('intervention delete request matching is narrow and method-aware', () => {
  assert.equal(
    isInterventionDeleteRequest({ method: 'delete', url: '/jobs/41' }),
    true,
  );
  assert.equal(
    isInterventionDeleteRequest({
      method: 'DELETE',
      url: '/api/v1/jobs/41?force=false',
    }),
    true,
  );
  assert.equal(
    isInterventionDeleteRequest({ method: 'get', url: '/jobs/41' }),
    false,
  );
  assert.equal(
    isInterventionDeleteRequest({ method: 'delete', url: '/jobs/41/media/2' }),
    false,
  );
  assert.equal(
    isInterventionDeleteRequest({ method: 'delete', url: '/stock/41' }),
    false,
  );
});
