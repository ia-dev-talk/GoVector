import { apiClient } from './client';

function normalizeId(value, label = 'Ticket') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new TypeError(`${label} invalide`);
  }
  return id;
}

export const feedbackApi = Object.freeze({
  list: (params = {}) => apiClient.get('/feedback', { params }),
  get: (ticketId) => apiClient.get(`/feedback/${normalizeId(ticketId)}`),
  create: (document) => apiClient.post('/feedback', document),
  comment: (ticketId, body) => apiClient.post(
    `/feedback/${normalizeId(ticketId)}/comments`,
    { body: String(body ?? '').trim() },
  ),
  update: (ticketId, document) => apiClient.patch(
    `/feedback/${normalizeId(ticketId)}`,
    document,
  ),
});
