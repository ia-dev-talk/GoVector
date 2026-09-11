const PILOT_STOCK_CODES = Object.freeze(['FO16', 'FO64', 'FO96']);

function canonicalStockText(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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

export function isPilotVisibleWarehouse(warehouse) {
  if (!warehouse || typeof warehouse !== 'object') return false;

  const type = canonicalStockText(warehouse.warehouse_type ?? warehouse.type);
  const code = canonicalStockText(warehouse.code);
  if (type === 'TECHNICIEN' || type === 'TECHNICIAN' || code.startsWith('TECH')) {
    return true;
  }

  const identity = canonicalStockText(
    `${warehouse.name ?? ''} ${warehouse.code ?? ''}`,
  );
  return !identity.includes('SYNTHETIQUE') && !identity.includes('SYNTHETIC');
}

export function filterPilotStockWarehouses(warehouses) {
  if (!Array.isArray(warehouses)) return [];
  return warehouses.filter(isPilotVisibleWarehouse);
}

export function getPilotStockCodes() {
  return [...PILOT_STOCK_CODES];
}
