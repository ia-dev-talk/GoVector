import { memo } from 'react';
import {
  ChevronIcon,
  EditIcon,
  PlusIcon,
  WarehouseIcon,
} from './StockIcons';
import { stockV3Api } from './stockV3Api';
import {
  normalizeIdentifier,
  numeric,
  text,
} from './stockUtils';
import './stock-holder-v2.css';

function warehouseType(warehouse) {
  return text(warehouse?.warehouse_type ?? warehouse?.type).toUpperCase();
}

function WarehouseRow({
  warehouse,
  selected,
  lineCount,
  quantity,
  onSelect,
}) {
  const id = normalizeIdentifier(warehouse?.id);
  const type = warehouseType(warehouse);
  const isTechnician = type === 'TECHNICIEN';
  const displayName = text(warehouse?.name, `Dépôt #${id}`);
  const subtitle = isTechnician
    ? `Dotation terrain${warehouse?.code ? ` · ${warehouse.code}` : ''}`
    : [
        text(warehouse?.city),
        text(warehouse?.warehouse_type ?? warehouse?.type, 'Dépôt').replace(/_/g, ' '),
      ].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      className={[
        'st3-warehouse-row',
        selected ? 'st3-warehouse-row--selected' : '',
        isTechnician ? 'st3-warehouse-row--technician' : '',
        warehouse?.is_active === false ? 'st3-warehouse-row--inactive' : '',
      ].join(' ')}
      onClick={() => onSelect(id)}
    >
      <span className="st3-warehouse-icon"><WarehouseIcon /></span>
      <span>
        <strong title={displayName}>{displayName}</strong>
        <small>
          {subtitle}
          {warehouse?.is_active === false ? ' · inactif' : ''}
        </small>
      </span>
      <span className="st3-warehouse-stats">
        <strong>{quantity}</strong>
        <small>{lineCount} ligne{lineCount > 1 ? 's' : ''}</small>
      </span>
    </button>
  );
}

const WarehouseRail = memo(function WarehouseRail({
  collapsed,
  onToggle,
  warehouses,
  lines,
  selectedWarehouseId,
  onSelect,
  canCreateWarehouse,
  onCreateWarehouse,
  onEditWarehouse,
}) {
  const snapshotWritable = stockV3Api.isSnapshotWritable();
  const summaries = warehouses.map((warehouse) => {
    const id = normalizeIdentifier(warehouse?.id);
    const stockLines = lines.filter(
      (line) => normalizeIdentifier(line?.warehouse_id) === id,
    );

    return {
      warehouse,
      lineCount: stockLines.length,
      quantity: stockLines.reduce(
        (total, line) => total + numeric(line?.quantity),
        0,
      ),
    };
  });
  const depotSummaries = summaries.filter(
    ({ warehouse }) => warehouseType(warehouse) !== 'TECHNICIEN',
  );
  const technicianSummaries = summaries.filter(
    ({ warehouse }) => warehouseType(warehouse) === 'TECHNICIEN',
  );

  const selectedWarehouse = warehouses.find(
    (warehouse) => normalizeIdentifier(warehouse?.id) === selectedWarehouseId,
  ) || null;
  const selectedIsPhysical =
    selectedWarehouse && warehouseType(selectedWarehouse) !== 'TECHNICIEN';

  if (collapsed) {
    return (
      <aside className="st3-warehouse-rail st3-warehouse-rail--collapsed">
        <button type="button" onClick={onToggle} title="Déployer les emplacements" aria-label="Déployer les emplacements">
          <ChevronIcon direction="right" />
        </button>
        <button
          type="button"
          className={selectedWarehouseId === null ? 'active' : ''}
          onClick={() => onSelect(null)}
          title="Stock général"
        >
          <WarehouseIcon />
          <span>{warehouses.length}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="st3-warehouse-rail">
      <header>
        <div>
          <span>Implantations & garde</span>
          <strong>Emplacements</strong>
        </div>

        <span className="st3-rail-header-actions">
          {selectedIsPhysical && onEditWarehouse && (
            <button
              type="button"
              onClick={() => onEditWarehouse(selectedWarehouse)}
              disabled={!snapshotWritable}
              title={snapshotWritable ? 'Modifier le dépôt sélectionné' : 'Snapshot stock non frais — actualisez avant modification'}
              aria-label="Modifier le dépôt sélectionné"
            >
              <EditIcon />
            </button>
          )}
          {canCreateWarehouse && (
            <button
              type="button"
              onClick={onCreateWarehouse}
              disabled={!snapshotWritable}
              title={snapshotWritable ? 'Créer un dépôt physique' : 'Snapshot stock non frais — actualisez avant création'}
              aria-label="Créer un dépôt physique"
            >
              <PlusIcon />
            </button>
          )}
          <button type="button" onClick={onToggle} title="Replier" aria-label="Replier les emplacements">
            <ChevronIcon />
          </button>
        </span>
      </header>

      <button
        type="button"
        className={[
          'st3-warehouse-all',
          selectedWarehouseId === null ? 'active' : '',
        ].join(' ')}
        onClick={() => onSelect(null)}
      >
        <WarehouseIcon />
        <span>
          <strong>Stock général</strong>
          <small>Vue consolidée</small>
        </span>
        <b>{warehouses.length}</b>
      </button>

      <div className="st3-warehouse-list">
        {summaries.length === 0 ? (
          <div className="st3-rail-empty">Aucun emplacement configuré.</div>
        ) : (
          <>
            {depotSummaries.length ? (
              <>
                <div className="st3-warehouse-group-title">
                  Dépôts physiques · {depotSummaries.length}
                </div>
                {depotSummaries.map(({ warehouse, lineCount, quantity }) => (
                  <WarehouseRow
                    key={warehouse.id}
                    warehouse={warehouse}
                    selected={selectedWarehouseId === normalizeIdentifier(warehouse?.id)}
                    lineCount={lineCount}
                    quantity={quantity}
                    onSelect={onSelect}
                  />
                ))}
              </>
            ) : null}

            {technicianSummaries.length ? (
              <>
                <div className="st3-warehouse-group-title">
                  Dotations techniciens · {technicianSummaries.length}
                </div>
                {technicianSummaries.map(({ warehouse, lineCount, quantity }) => (
                  <WarehouseRow
                    key={warehouse.id}
                    warehouse={warehouse}
                    selected={selectedWarehouseId === normalizeIdentifier(warehouse?.id)}
                    lineCount={lineCount}
                    quantity={quantity}
                    onSelect={onSelect}
                  />
                ))}
              </>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
});

export default WarehouseRail;
