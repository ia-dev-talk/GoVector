import assert from 'node:assert/strict';
import test from 'node:test';

import {
  jobAllowsCommand,
  normalizeWorkflowCapabilities,
  statusMetadataFor,
  statusMetadataIndex,
} from './workflow-capabilities.js';
import {
  buildCockpitPilotage,
  cockpitJobSector,
} from '../components/cockpit/cockpitPilotageSelectors.js';

const COCKPIT_STATUS_METADATA = [
  ['assigned', true, 'assigned'],
  ['accepted', true, 'accepted'],
  ['en_route', true, 'en_route'],
  ['on_site', true, 'on_site'],
  ['in_progress', true, 'in_progress'],
  ['work_in_progress', true, 'in_progress'],
  ['installation_done', true, 'installation_done'],
  ['client_validation', true, 'client_validation'],
  ['en_attente_validation', false, 'en_attente_validation'],
  ['completed', false, 'completed'],
].map(([code, fieldActive, canonical]) => ({
  code,
  canonical,
  field_active: fieldActive,
  order_open: canonical !== 'completed',
}));

function cockpitPilotageFor(status, extra = {}) {
  return buildCockpitPilotage({
    jobs: [{
      id: 31,
      status,
      assigned_tech_id: 7,
      ...extra,
    }],
    statusMetadata: COCKPIT_STATUS_METADATA,
  });
}


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
  assert.equal(pilotage.summary.in_progress, 0);
  assert.equal(
    pilotage.stages.find((stage) => stage.key === 'started').value,
    1,
  );
  assert.equal(pilotage.summary.completed, 0);
});


test('missing capabilities remain unavailable instead of inventing metadata', () => {
  const capabilities = normalizeWorkflowCapabilities(null);
  assert.deepEqual(capabilities.statuses, []);
  assert.equal(statusMetadataFor(statusMetadataIndex([]), 'completed'), null);
});

test('job commands require an explicit backend capability', () => {
  const capabilities = {
    allowed_commands: ['validate', 'reassign'],
  };

  assert.equal(jobAllowsCommand(capabilities, 'validate'), true);
  assert.equal(jobAllowsCommand(capabilities, 'accept_and_start'), false);
  assert.equal(jobAllowsCommand(null, 'validate'), false);
});

test('assigned intervention with an expired slot is never started or in progress', () => {
  const pilotage = cockpitPilotageFor('assigned', {
    scheduled_date: '2026-08-24T00:00:00Z',
    time_slot_start: '08:00',
    time_slot_end: '10:00',
  });

  assert.equal(pilotage.summary.total, 1);
  assert.equal(pilotage.summary.assigned, 1);
  assert.equal(pilotage.summary.in_progress, 0);
  assert.equal(
    pilotage.stages.find((stage) => stage.key === 'started')?.value,
    0,
  );
});

test('started evidence remains cumulative after an interrupted terminal status', () => {
  const pilotage = cockpitPilotageFor('failed', {
    started_at: '2026-08-24T08:05:00Z',
  });

  assert.equal(pilotage.summary.in_progress, 0);
  assert.equal(
    pilotage.stages.find((stage) => stage.key === 'started')?.value,
    1,
  );
});

test('cockpit lifecycle mapping distinguishes assignment from field activity', () => {
  const expectations = [
    ['assigned', 0, 0],
    ['accepted', 0, 0],
    ['en_route', 1, 1],
    ['on_site', 1, 1],
    ['in_progress', 1, 1],
    ['work_in_progress', 1, 1],
    ['installation_done', 0, 1],
    ['client_validation', 0, 1],
    ['en_attente_validation', 0, 1],
    ['completed', 0, 1],
  ];

  expectations.forEach(([status, inProgress, started]) => {
    const pilotage = cockpitPilotageFor(status);
    assert.equal(
      pilotage.summary.in_progress,
      inProgress,
      `${status} in_progress`,
    );
    assert.equal(
      pilotage.stages.find((stage) => stage.key === 'started')?.value,
      started,
      `${status} started`,
    );
  });
});

test('cockpit prefers the canonical operational sector identity', () => {
  assert.equal(
    cockpitJobSector({
      sector_name: 'Secteur Sud',
      sector_raw: 'Sidi Maârouf',
      route_criteria: 'Ancienne route',
    }),
    'Secteur Sud',
  );
  assert.equal(
    cockpitJobSector({ sector_raw: 'Sidi Maârouf' }),
    'Sidi Maârouf',
  );
});
