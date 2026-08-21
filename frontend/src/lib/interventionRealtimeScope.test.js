import test from 'node:test';
import assert from 'node:assert/strict';
import {
  registerInterventionRealtimeScope,
  shouldForwardInterventionRealtimeEvent,
} from './interventionRealtimeScope.js';


test('dispatch realtime is forwarded when no Interventions scope is registered', () => {
  assert.equal(
    shouldForwardInterventionRealtimeEvent(
      'dispatch',
    ),
    true,
  );
});


test('historical and simulated Interventions scopes block dispatch callbacks only', () => {
  const releaseHistorical =
    registerInterventionRealtimeScope(false);

  try {
    assert.equal(
      shouldForwardInterventionRealtimeEvent(
        'dispatch',
      ),
      false,
    );
    assert.equal(
      shouldForwardInterventionRealtimeEvent(
        'dashboard',
      ),
      true,
    );
  } finally {
    releaseHistorical();
  }

  const releaseSimulation =
    registerInterventionRealtimeScope(false);

  try {
    assert.equal(
      shouldForwardInterventionRealtimeEvent(
        'dispatch',
      ),
      false,
    );
  } finally {
    releaseSimulation();
  }
});


test('today scope allows dispatch callbacks and cleanup restores the neutral default', () => {
  const releaseToday =
    registerInterventionRealtimeScope(true);

  assert.equal(
    shouldForwardInterventionRealtimeEvent(
      'dispatch',
    ),
    true,
  );

  releaseToday();

  assert.equal(
    shouldForwardInterventionRealtimeEvent(
      'dispatch',
    ),
    true,
  );
});


test('cleanup from an older registration cannot clear a newer scope', () => {
  const releaseHistorical =
    registerInterventionRealtimeScope(false);
  const releaseToday =
    registerInterventionRealtimeScope(true);

  releaseHistorical();

  assert.equal(
    shouldForwardInterventionRealtimeEvent(
      'dispatch',
    ),
    true,
  );

  releaseToday();

  assert.equal(
    shouldForwardInterventionRealtimeEvent(
      'dispatch',
    ),
    true,
  );
});
