import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeWorkflowCapabilities,
  statusMetadataFor,
  statusMetadataIndex,
} from './workflow-capabilities.js';
import { buildCockpitPilotage } from '../components/cockpit/cockpitPilotageSelectors.js';


test('installation_done stays open and active from backend metadata', () => {
  const capabilities = normalizeWorkflowCapabilities({
    schema_version: 1,
    statuses: [
      {
        code: 'installation_done',
        label: 'Installation terminée',
        order_open: true,
        field_active: true,
        canonical: 'installation_done',
        category: 'field_active',
      },
      {
        code: 'work_in_progress',
        label: 'Travaux en cours',
        order_open: true,
        field_active: true,
        canonical: 'in_progress',
        category: 'field_active',
      },
    ],
  });
  const index = statusMetadataIndex(capabilities.statuses);

  assert.equal(statusMetadataFor(index, 'installation_done').order_open, true);
  assert.equal(statusMetadataFor(index, 'installation_done').field_active, true);
  assert.equal(statusMetadataFor(index, 'WORK_IN_PROGRESS').canonical, 'in_progress');

  const pilotage = buildCockpitPilotage({
    jobs: [{ id: 1, status: 'installation_done' }],
    statusMetadata: capabilities.statuses,
  });
  assert.equal(pilotage.summary.in_progress, 1);
  assert.equal(pilotage.summary.completed, 0);
});


test('missing capabilities remain unavailable instead of inventing metadata', () => {
  const capabilities = normalizeWorkflowCapabilities(null);
  assert.deepEqual(capabilities.statuses, []);
  assert.equal(statusMetadataFor(statusMetadataIndex([]), 'completed'), null);
});
