import {
  memo,
  useCallback,
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
import {
  canCloseStockDraft,
  isStockDraftDirty,
} from './stockUnsavedChanges';

function technicianLabel(technician) {
  const name = text(technician?.name, `Technicien #${technician?.id ?? '—'}`);
  const team = text(technician?.team ?? technician?.team_name);
  const sector = text(
    technician?.primary_sector_name ??
      technician?.sector_name ??
      technician?.route_criteria,
  );
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

function isTechnicianCustodyWarehouse(warehouse) {
  const type = text(warehouse?.type).toLocaleUpperCase('fr');
  const code = text(warehouse?.code).toLocaleUpperCase('fr');
  return (
    type === 'TECHNICIEN' ||
    type === 'TECHNICIAN' ||
    code.startsWith('TECH-')
  );
}

function money(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'MAD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function initialIssueDraft({
  item,
  warehouseOptions,
  initialWarehouseId,
  initialTechnicianId,
}) {
  const requested = warehouseOptions.find(
    (warehouse) => String(warehouse.id) === String(initialWarehouseId),
  );
  const firstWithStock = requested && availableForWarehouse(item, requested.id) > 0
    ? requested
    : warehouseOptions.find(
      (warehouse) => availableForWarehouse(item, warehouse?.id) > 0,
    );
  return {
    warehouseId: firstWithStock ? String(firstWithStock.id) : '',
    technicianId: initialTechnicianId ? String(initialTechnicianId) : '',
    quantity: '1',
    notes: '',
  };
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
      (warehouse) => (
        warehouse?.is_active !== false &&
        !isTechnicianCustodyWarehouse(warehouse)
      ),
    ),
    [warehouses],
  );
  const technicianOptions = useMemo(
    () => (Array.isArray(technicians) ? technicians : []).filter(
      (technician) => technician?.is_active !== false,
    ),
    [technicians],
  );
  const [baseline] = useState(() => initialIssueDraft({
    item,
    warehouseOptions,
    initialWarehouseId,
    initialTechnicianId,
  }));

  const [warehouseId, setWarehouseId] = useState(baseline.warehouseId);
  const [technicianId, setTechnicianId] = useState(baseline.technicianId);
  const [quantity, setQuantity] = useState(baseline.quantity);
  const [notes, setNotes] = useState(baseline.notes);
  const [localError, setLocalError] = useState('');

  const currentDraft = {
    warehouseId,
    technicianId,
    quantity,
    notes,
  };
  const dirty = isStockDraftDirty(currentDraft, baseline);
  const requestClose = useCallback(() => {
    if (canCloseStockDraft({
      dirty,
      saving,
      confirmDiscard: window.confirm,
    })) {
      onClose();
    }
  }, [dirty, onClose, saving]);

  const available = availableForWarehouse(item, warehouseId);
  const selectedWarehouse = warehouseOptions.find(
    (warehouse) => String(warehouse.id) === String(warehouseId),
  );
  const selectedTechnician = technicianOptions.find(
    (technician) => String(technician.id) === String(technicianId),
  );
  const parsedQuantity = Number(quantity);
  const estimatedValue = (
    Number.isFinite(parsedQuantity) && parsedQuantity > 0
      ? parsedQuantity * numeric(item?.unit_price)
      : 0
  );

  const submit = () => {
    const parsedWarehouse = Number(warehouseId);
    const parsedTechnician = Number(technicianId);
    const nextQuantity = Number(quantity);

    if (!Number.isInteger(parsedWarehouse) || parsedWarehouse <= 0) {
      setLocalError('Sélectionnez un dépôt source avec du stock disponible.');
      return;
    }
    if (!Number.isInteger(parsedTechnician) || parsedTechnician <= 0) {
      setLocalError('Sélectionnez le technicien qui prendra le matériel en garde.');
      return;
    }
    if (!Number.isInteger(nextQuantity) || nextQuantity <= 0) {
      setLocalError('La quantité doit être un entier supérieur à zéro.');
      return;
    }
    if (nextQuantity > available) {
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
          quantity: nextQuantity,
        },
      ],
    });
  };

  return (
    <div
      className="st3-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        className="st3-modal st3-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="st3-issue-title"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          requestClose();
        }}
      >
        <header>
          <span className="st3-modal-icon"><BoxIcon /></span>
          <div>
            <span>Dotation terrain</span>
            <strong id="st3-issue-title">Affecter du stock à un technicien</strong>
            <small>
              {text(item?.reference, 'Référence sans code')} · {text(item?.label, 'Article')}
            </small>
          </div>
          <button
            type="button"
            onClick={requestClose}
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
              Une dotation validée transfère physiquement le matériel du dépôt vers le stock de garde du technicien.
              Les deux côtés du mouvement restent tracés dans BlueVector.
            </span>
          </div>

          <label>
            <span>Dépôt source</span>
            <select
              value={warehouseId}
              onChange={(event) => {
                setWarehouseId(event.target.value);
                setLocalError('');
              }}
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
              onChange={(event) => {
                setTechnicianId(event.target.value);
                setLocalError('');
              }}
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
            <span>Quantité transférée</span>
            <input
              type="number"
              min="1"
              max={Math.max(1, available)}
              step="1"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value);
                setLocalError('');
              }}
            />
            <small>{available} unité{available > 1 ? 's' : ''} disponible{available > 1 ? 's' : ''}</small>
          </label>

          <div className="st3-form-note">
            <WarehouseIcon />
            <span>
              {selectedWarehouse && selectedTechnician
                ? `${text(selectedWarehouse.name)} → Stock de garde · ${text(selectedTechnician.name)}`
                : 'Choisissez le dépôt et le technicien pour prévisualiser le transfert.'}
              {estimatedValue > 0 ? ` · Valeur indicative ${money(estimatedValue)}` : ''}
            </span>
          </div>

          <label className="st3-field-wide">
            <span>Motif / note de dotation</span>
            <textarea
              rows="3"
              value={notes}
              placeholder="Ex. dotation véhicule, intervention prévue, remplacement, kit de garde…"
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
            onClick={requestClose}
            disabled={saving}
          >
            Annuler
          </button>
          <button
            type="button"
            className="st3-primary-button"
            onClick={submit}
            disabled={saving || available <= 0 || !technicianId}
          >
            {saving ? 'Transfert en cours…' : 'Valider la dotation'}
          </button>
        </footer>
      </section>
    </div>
  );
});

export default StockIssueModal;
