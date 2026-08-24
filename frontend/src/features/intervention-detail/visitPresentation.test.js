import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fieldVisitPresentation,
  hasCurrentFieldVisit,
  isCurrentFieldVisit,
} from './visitPresentation.js';

test('an old technician passage is historical after reassignment', () => {
  const currentAssignment = {
    id: 22,
    technician_id: 2,
    technician_name: 'Khadija El Harti',
    visit_id: null,
  };
  const karimVisit = {
    id: 10,
    primary_technician_id: 1,
    primary_technician_name: 'Karim Tazi',
    outcome: 'reassigned',
    ended_at: null,
  };

  assert.equal(isCurrentFieldVisit(karimVisit, currentAssignment), false);
  assert.deepEqual(fieldVisitPresentation(karimVisit, currentAssignment), {
    isCurrent: false,
    headingPrefix: 'Historique · ',
    trailingState: 'réaffecté',
  });
  assert.equal(hasCurrentFieldVisit([karimVisit], currentAssignment), false);
});

test('only the passage linked to the active assignment is current', () => {
  const currentAssignment = { technician_id: 2, visit_id: 11 };
  const visits = [
    { id: 10, primary_technician_id: 1, ended_at: '2026-08-24T11:00:00Z' },
    { id: 11, primary_technician_id: 2, status: 'assigned', ended_at: null },
  ];

  assert.equal(isCurrentFieldVisit(visits[0], currentAssignment), false);
  assert.equal(isCurrentFieldVisit(visits[1], currentAssignment), true);
  assert.equal(hasCurrentFieldVisit(visits, currentAssignment), true);
  assert.equal(
    fieldVisitPresentation(visits[1], currentAssignment).trailingState,
    'en attente de démarrage',
  );
});
