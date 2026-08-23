import { normalizeIdentifier, text } from './stockUtils.js';

export function warehouseType(warehouse) {
  return text(warehouse?.warehouse_type ?? warehouse?.type).toUpperCase();
}

export function technicianWarehouse(technician, warehouses = []) {
  const technicianId = normalizeIdentifier(technician?.id);
  if (!technicianId) return null;
  const expectedCode = `TECH-${technicianId}`;
  return warehouses.find(
    (warehouse) => text(warehouse?.code).toUpperCase() === expectedCode,
  ) || null;
}

export function technicianForWarehouse(warehouseId, warehouses = [], technicians = []) {
  const normalizedWarehouseId = normalizeIdentifier(warehouseId);
  if (!normalizedWarehouseId) return null;

  const warehouse = warehouses.find(
    (candidate) => normalizeIdentifier(candidate?.id) === normalizedWarehouseId,
  );
  if (!warehouse || warehouseType(warehouse) !== 'TECHNICIEN') return null;

  return technicians.find(
    (technician) => normalizeIdentifier(technicianWarehouse(technician, warehouses)?.id) === normalizedWarehouseId,
  ) || null;
}

export function scopeForWarehouseSelection(warehouseId, warehouses = [], technicians = []) {
  const normalizedWarehouseId = normalizeIdentifier(warehouseId);
  if (!normalizedWarehouseId) {
    return { kind: 'all', warehouseId: null, technicianId: null };
  }

  const technician = technicianForWarehouse(
    normalizedWarehouseId,
    warehouses,
    technicians,
  );

  if (technician) {
    return {
      kind: 'technician',
      warehouseId: normalizedWarehouseId,
      technicianId: normalizeIdentifier(technician.id),
    };
  }

  return {
    kind: 'warehouse',
    warehouseId: normalizedWarehouseId,
    technicianId: null,
  };
}

export function buildHolderOptions(warehouses = [], technicians = []) {
  const physical = warehouses
    .filter((warehouse) => warehouseType(warehouse) !== 'TECHNICIEN')
    .map((warehouse) => ({
      key: `warehouse:${normalizeIdentifier(warehouse?.id)}`,
      kind: 'warehouse',
      warehouseId: normalizeIdentifier(warehouse?.id),
      technicianId: null,
      label: text(warehouse?.name, `Dépôt #${warehouse?.id ?? '—'}`),
      meta: [text(warehouse?.code), text(warehouse?.city)].filter(Boolean).join(' · '),
      empty: false,
    }))
    .filter((option) => option.warehouseId)
    .sort((first, second) => first.label.localeCompare(second.label, 'fr', { sensitivity: 'base' }));

  const technicianOptions = technicians
    .map((technician) => {
      const technicianId = normalizeIdentifier(technician?.id);
      if (!technicianId) return null;
      const warehouse = technicianWarehouse(technician, warehouses);
      return {
        key: `technician:${technicianId}`,
        kind: 'technician',
        warehouseId: normalizeIdentifier(warehouse?.id),
        technicianId,
        label: text(technician?.name, `Technicien #${technicianId}`),
        meta: [
          text(technician?.employee_id),
          text(technician?.team),
          warehouse ? '' : 'aucun stock',
        ].filter(Boolean).join(' · '),
        empty: !warehouse,
      };
    })
    .filter(Boolean)
    .sort((first, second) => first.label.localeCompare(second.label, 'fr', { sensitivity: 'base' }));

  return {
    all: {
      key: 'all',
      kind: 'all',
      warehouseId: null,
      technicianId: null,
      label: 'Stock général',
      meta: 'Vue consolidée',
      empty: false,
    },
    physical,
    technicians: technicianOptions,
  };
}

export function filterHolderOptions(groups, query) {
  const needle = text(query).trim().toLocaleLowerCase('fr');
  if (!needle) return groups;

  const matches = (option) => [option.label, option.meta, option.key]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('fr')
    .includes(needle);

  return {
    all: matches(groups.all) ? groups.all : null,
    physical: groups.physical.filter(matches),
    technicians: groups.technicians.filter(matches),
  };
}
