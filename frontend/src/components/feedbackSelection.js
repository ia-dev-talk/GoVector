function text(value) {
  return value == null ? '' : String(value).trim();
}

function ticketKey(ticket) {
  return ticket?.id ?? ticket?.public_id ?? '';
}

export function filterFeedbackTickets(tickets, query) {
  const rows = Array.isArray(tickets) ? tickets : [];
  const needle = text(query).toLowerCase();
  if (!needle) return rows;
  return rows.filter((ticket) => [
    ticket?.public_id,
    ticket?.title,
    ticket?.description,
    ticket?.page,
    ticket?.ticket_type,
    ticket?.status,
  ].some((value) => text(value).toLowerCase().includes(needle)));
}

export function reconcileFeedbackSelection(visibleTickets, selectedId) {
  const rows = Array.isArray(visibleTickets) ? visibleTickets : [];
  if (selectedId && rows.some((ticket) => ticketKey(ticket) === selectedId)) {
    return selectedId;
  }
  return rows.length ? ticketKey(rows[0]) : null;
}
