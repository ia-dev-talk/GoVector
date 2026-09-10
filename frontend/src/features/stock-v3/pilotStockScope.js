const PILOT_STOCK_CODES = Object.freeze(['FO16', 'FO64', 'FO96']);

function canonicalStockText(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function isPilotStockItem(item) {
  if (!item || typeof item !== 'object') return false;

  const candidates = [
    item.reference,
    item.label,
    item.model,
    item.equipment_type,
  ]
    .map(canonicalStockText)
    .filter(Boolean);

  return PILOT_STOCK_CODES.some((code) =>
    candidates.some((candidate) =>
      candidate === code || candidate.includes(code),
    ),
  );
}

export function filterPilotStockItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(isPilotStockItem);
}

export function getPilotStockCodes() {
  return [...PILOT_STOCK_CODES];
}
