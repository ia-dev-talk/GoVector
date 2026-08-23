export const STOCK_DISCARD_MESSAGE = 'Abandonner les modifications non enregistrées ?';

export function isStockDraftDirty(current, baseline) {
  return JSON.stringify(current ?? null) !== JSON.stringify(baseline ?? null);
}

export function canCloseStockDraft({
  dirty = false,
  saving = false,
  confirmDiscard,
} = {}) {
  if (saving) return false;
  if (!dirty) return true;
  if (typeof confirmDiscard !== 'function') return false;
  return Boolean(confirmDiscard(STOCK_DISCARD_MESSAGE));
}
