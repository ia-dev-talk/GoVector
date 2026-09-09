import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIELD_AGENT_ROLE,
  fieldAgentReviewCounters,
  fieldAgentStatusLabel,
  isAwaitingAgentReview,
  isFieldAgentRole,
  normalizeFieldAgentEntries,
} from './fieldAgentReview.js';

test('legacy CHEF_ORIENTEUR is routed as Agent terrain only', () => {
  assert.equal(isFieldAgentRole(FIELD_AGENT_ROLE), true);
  assert.equal(isFieldAgentRole('ORIENTEUR'), false);
  assert.equal(isFieldAgentRole('ADMIN'), false);
  assert.equal(isFieldAgentRole('TECHNICIAN'), false);
});

test('agent review queue always puts submitted work first', () => {
  const entries = normalizeFieldAgentEntries({
    jobs: [
      {
        job: {
          id: 10,
          status: 'in_progress',
          scheduled_date: '2026-09-10T08:00:00',
        },
      },
      {
        job: {
          id: 12,
          status: 'en_attente_validation',
          scheduled_date: '2026-09-10T14:00:00',
        },
      },
      {
        job: {
          id: 11,
          status: 'EN_ATTENTE_VALIDATION',
          scheduled_date: '2026-09-10T09:00:00',
        },
      },
    ],
  });

  assert.deepEqual(entries.map((entry) => entry.job.id), [11, 12, 10]);
  assert.equal(isAwaitingAgentReview(entries[0].job), true);
});

test('agent counters separate review queue from active team work', () => {
  const counters = fieldAgentReviewCounters([
    { job: { status: 'en_attente_validation' } },
    { job: { status: 'in_progress' } },
    { job: { status: 'en_route' } },
  ]);

  assert.deepEqual(counters, {
    total: 3,
    awaitingReview: 1,
    active: 2,
  });
});

test('agent status labels use operational wording', () => {
  assert.equal(fieldAgentStatusLabel('en_attente_validation'), 'À contrôler');
  assert.equal(fieldAgentStatusLabel('en_route'), 'En trajet');
  assert.equal(fieldAgentStatusLabel('on_site'), 'Sur site');
  assert.equal(fieldAgentStatusLabel('completed'), 'Clôturée');
});

test('malformed payloads cannot create phantom team jobs', () => {
  assert.deepEqual(normalizeFieldAgentEntries(null), []);
  assert.deepEqual(normalizeFieldAgentEntries({ jobs: [{ job: {} }, null] }), []);
});
