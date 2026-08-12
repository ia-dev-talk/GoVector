import {
  memo,
  useMemo,
  useState,
} from 'react';

import {
  BoxIcon,
  CloseIcon,
  WarehouseIcon,
} from './StockIcons';
import {
  numeric,
  text,
} from './stockUtils';

function technicianLabel(technician) {
  const name = text(technician?.name, `Technicien #${technician?.id ?? '—'}`);
  const team = text(technician?.team);
  const sector = text(technician?.route_criteria ?? technician?.primary_sector_name);
  return [name, team, sector].filter(Boolean).join(' · ');
}

function availableForWarehouse(item, warehouseId) {
  const expected = String(warehouseId ?? '');
  return (Array.isArray(item?.lines) ? item.lines : [])
    .filter((line) => String(line?.warehouse_id ?? '') === expected)
    .reduce(
      (total, line) => total + numeric(line?.available_quantity),
      0,
    );
}

const StockIssueModal = memo(function StockIssueModal({
  item,
  warehouses,
  technicians,
  initialWarehouseId = null,
  initialTechnicianId = null,
  saving = false,
  error = '',
  onClose,
  onSave,
}) {
  const warehouseOptions = useMemo(
    () => (Array.isArray(warehouses) ? warehouses : []).filter(
      (warehouse) => warehouse?.is_active !== false,
    ),
    [warehouses],
  );
  const technicianOptions = useMemo(
    () => (Array.isArray(technicians) ? technicians : []).filter(
      (technician) => technician?.is_active !== false,
    ),
    [technicians],
  );

  const [warehouseId, setWarehouseId] = useState(() => {
    if (initialWarehouseId) return String(initialWarehouseId);
    const firstWithStock = warehouseOptions.find(
      (warehouse) => availableForWarehouse(item, warehouse?.id) > 0,
    );
    return firstWithStock ? String(firstWithStock.id) : '';
  });
  const [technicianId, setTechnicianId] = useState(
    initialTechnicianId ? String(initialTechnicianId) : '',
  );
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState('');

  const available = availableForWarehouse(item, warehouseId);

  const submit = () => {
    const parsedWarehouse = Number(warehouseId);
    const parsedTechnician = Number(technicianId);
    const parsedQuantity = Number(quantity);

    if (!Number.isInteger(parsedWarehouse) || parsedWarehouse <= 0) {
      setLocalError('Sélectionnez le dépôt source.');
      return;
    }
    if (!Number.isInteger(parsedTechnician) || parsedTechnician <= 0) {
      setLocalError('Sélectionnez le technicien destinataire.');
      return;
    }
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setLocalError('La quantité doit être un entier supérieur à zéro.');
      return;
    }
    if (parsedQuantity > available) {
      setLocalError(`Stock disponible insuffisant dans ce dépôt (${available}).`);
      return;
    }

    setLocalError('');
    onSave({
      warehouse_id: parsedWarehouse,
      technician_id: parsedTechnician,
      notes: text(notes) || null,
      items: [
        {
          item_id: Number(item.id),
          quantity: parsedQuantity,
        },
      ],
    });
  };

  return (
    <div
      className="st3-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <section
        className="st3-modal st3-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="st3-issue-title"
      >
        <header>
          <span className="st3-modal-icon"><BoxIcon /></span>
          <div>
            <span>Dotation terrain</span>
            <strong id="st3-issue-title">Affecter du stock à un technicien</strong>
            <small>
              {text(item?.reference)} · {text(item?.label, 'Article')}
            </small>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Fermer"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="st3-modal-body st3-form-grid">
          <div className="st3-field-wide st3-form-note">
            <WarehouseIcon />
            <span>
              La sortie crée un bon de dotation puis le valide. Le mouvement reste lié au technicien
              dans le journal de stock BlueVector.
            </span>
          </div>

          <label>
            <span>Dépôt source</span>
            <select
              value={warehouseId}
              onChange={(event) => setWarehouseId(event.target.value)}
            >
              <option value="">Choisir un dépôt</option>
              {warehouseOptions.map((warehouse) => {
                const quantityAvailable = availableForWarehouse(item, warehouse.id);
                return (
                  <option
                    key={warehouse.id}
                    value={warehouse.id}
                    disabled={quantityAvailable <= 0}
                  >
                    {text(warehouse.name, `Dépôt #${warehouse.id}`)} · {quantityAvailable} disponible
                  </option>
                );
              })}
            </select>
          </label>

          <label>
            <span>Technicien destinataire</span>
            <select
              value={technicianId}
              onChange={(event) => setTechnicianId(event.target.value)}
            >
              <option value="">Choisir un technicien</option>
              {technicianOptions.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technicianLabel(technician)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Quantité</span>
            <input
              type="number"
              min="1"
              max={Math.max(1, available)}
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <small>{available} unité{available > 1 ? 's' : ''} disponible{available > 1 ? 's' : ''}</small>
          </label>

          <label className="st3-field-wide">
            <span>Note de dotation</span>
            <textarea
              rows="3"
              value={notes}
              placeholder="Ex. dotation véhicule, intervention prévue, remplacement…"
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          {(localError || error) ? (
            <div className="st3-form-error st3-field-wide" role="alert">
              {localError || error}
            </div>
          ) : null}
        </div>

        <footer>
          <button
            type="button"
            className="st3-secondary-button"
            onClick={onClose}
            disabled={saving}
          >
            Annuler
          </button>
          <button
            type="button"
            className="st3-primary-button"
            onClick={submit}
            disabled={saving || available <= 0}
          >
            {saving ? 'Validation…' : 'Valider la dotation'}
          </button>
        </footer>
      </section>
    </div>
  );
});

export default StockIssueModal;
