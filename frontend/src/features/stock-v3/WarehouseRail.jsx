import { memo } from 'react';
import {
  ChevronIcon,
  EditIcon,
  PlusIcon,
  WarehouseIcon,
} from './StockIcons';
import {
  normalizeIdentifier,
  numeric,
  text,
} from './stockUtils';


function WarehouseRow({
  warehouse,
  selected,
  lineCount,
  quantity,
  onSelect,
}) {
  const id = normalizeIdentifier(warehouse?.id);

  return (
    <button
      type="button"
      className={[
        'st3-warehouse-row',
        selected ? 'st3-warehouse-row--selected' : '',
        warehouse?.is_active === false ? 'st3-warehouse-row--inactive' : '',
      ].join(' ')}
      onClick={() => onSelect(id)}
    >
      <span className="st3-warehouse-icon"><WarehouseIcon /></span>
      <span>
        <strong>{text(warehouse?.name, `Dépôt #${id}`)}</strong>
        <small>
          {text(warehouse?.city) ? `${text(warehouse?.city)} · ` : ''}
          {text(warehouse?.warehouse_type ?? warehouse?.type, 'Type non renseigné').replace(/_/g, ' ')}
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

  const selectedWarehouse = warehouses.find(
    (warehouse) => normalizeIdentifier(warehouse?.id) === selectedWarehouseId,
  ) || null;

  if (collapsed) {
    return (
      <aside className="st3-warehouse-rail st3-warehouse-rail--collapsed">
        <button type="button" onClick={onToggle} title="Déployer les dépôts" aria-label="Déployer les dépôts">
          <ChevronIcon direction="right" />
        </button>
        <button
          type="button"
          className={selectedWarehouseId === null ? 'active' : ''}
          onClick={() => onSelect(null)}
          title="Tous les dépôts"
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
          <span>Implantations</span>
          <strong>Dépôts</strong>
        </div>

        <span className="st3-rail-header-actions">
          {selectedWarehouse && onEditWarehouse && (
            <button
              type="button"
              onClick={() => onEditWarehouse(selectedWarehouse)}
              title="Modifier le dépôt sélectionné"
              aria-label="Modifier le dépôt sélectionné"
            >
              <EditIcon />
            </button>
          )}
          {canCreateWarehouse && (
            <button type="button" onClick={onCreateWarehouse} title="Créer un dépôt" aria-label="Créer un dépôt">
              <PlusIcon />
            </button>
          )}
          <button type="button" onClick={onToggle} title="Replier" aria-label="Replier les dépôts">
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
          <strong>Tous les dépôts</strong>
          <small>Vue consolidée</small>
        </span>
        <b>{warehouses.length}</b>
      </button>

      <div className="st3-warehouse-list">
        {summaries.length === 0 ? (
          <div className="st3-rail-empty">Aucun dépôt configuré.</div>
        ) : (
          summaries.map(({ warehouse, lineCount, quantity }) => (
            <WarehouseRow
              key={warehouse.id}
              warehouse={warehouse}
              selected={selectedWarehouseId === normalizeIdentifier(warehouse?.id)}
              lineCount={lineCount}
              quantity={quantity}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
});


export default WarehouseRail;
