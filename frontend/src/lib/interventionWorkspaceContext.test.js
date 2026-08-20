import test from 'node:test';
import assert from 'node:assert/strict';

import { getInterventionWorkspaceContextLabel } from './interventionWorkspaceContext.js';


test('Interventions n’annonce jamais un faux état temps réel', () => {
  assert.equal(
    getInterventionWorkspaceContextLabel({
      isToday: true,
      isDemo: false,
    }),
    'Vue du jour',
  );

  assert.equal(
    getInterventionWorkspaceContextLabel({
      isToday: false,
      isDemo: false,
    }),
    'Vue historique',
  );

  assert.equal(
    getInterventionWorkspaceContextLabel({
      isToday: true,
      isDemo: true,
    }),
    'Simulation',
  );
});
