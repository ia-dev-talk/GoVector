import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterFeedbackTickets,
  reconcileFeedbackSelection,
} from './feedbackSelection.js';

const tickets = [
  { id: 1, public_id: 'FB-001', title: 'Carte GPS', description: 'Position absente', page: 'Carte live', ticket_type: 'BUG', status: 'OPEN' },
  { id: 2, public_id: 'FB-002', title: 'Export CSV', description: 'Colonnes rapports', page: 'Rapports', ticket_type: 'UX', status: 'IN_PROGRESS' },
];

test('filterFeedbackTickets searches the visible feedback scope', () => {
  assert.deepEqual(filterFeedbackTickets(tickets, 'rapports').map((ticket) => ticket.id), [2]);
  assert.deepEqual(filterFeedbackTickets(tickets, 'fb-001').map((ticket) => ticket.id), [1]);
  assert.equal(filterFeedbackTickets(tickets, 'introuvable').length, 0);
  assert.equal(filterFeedbackTickets(tickets, '').length, 2);
});

test('reconcileFeedbackSelection never keeps a hidden ticket authoritative', () => {
  const visible = filterFeedbackTickets(tickets, 'rapports');
  assert.equal(reconcileFeedbackSelection(visible, 1), 2);
  assert.equal(reconcileFeedbackSelection(visible, 2), 2);
  assert.equal(reconcileFeedbackSelection([], 2), null);
});
