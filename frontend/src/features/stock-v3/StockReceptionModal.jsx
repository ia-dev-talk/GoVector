import {
  memo,
  useEffect,
  useState,
} from 'react';
import {
  CloseIcon,
  ReceptionIcon,
} from './StockIcons';
import {
  normalizeIdentifier,
  positiveInteger,
  text,
} from './stockUtils';


const StockReceptionModal = memo(function StockReceptionModal({
  item,
  warehouses,
  selectedWarehouseId,
  saving,
  error,
  onClose,
  onSave,
}) {
  const [form, setForm] =
    useState({
      warehouse_id:
        selectedWarehouseId || '',
      quantity: '',
      operator:
        text(item?.operator),
      notes: '',
    });

  const [localError, setLocalError] =
    useState('');

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        setForm({
          warehouse_id:
            selectedWarehouseId || '',
          quantity: '',
          operator:
            text(item?.operator),
          notes: '',
        });
        setLocalError('');
      }, 0);

    return () =>
      window.clearTimeout(timer);
  }, [
    item,
    selectedWarehouseId,
  ]);

  const update =
    (key, value) => {
      setForm((current) => ({
        ...current,
        [key]: value,
      }));
    };

  const submit = () => {
    const itemId =
      normalizeIdentifier(
        item?.id,
      );

    const warehouseId =
      normalizeIdentifier(
        form.warehouse_id,
      );

    const quantity =
      positiveInteger(
        form.quantity,
      );

    if (!itemId) {
      setLocalError(
        'Article invalide.',
      );
      return;
    }

    if (!warehouseId) {
      setLocalError(
        'Sélectionnez un dépôt.',
      );
      return;
    }

    if (!quantity) {
      setLocalError(
        'La quantité doit être un entier strictement positif.',
      );
      return;
    }

    setLocalError('');

    onSave({
      item_id: itemId,
      warehouse_id: warehouseId,
      quantity,
      operator:
        text(form.operator) ||
        undefined,
      notes:
        text(form.notes) ||
        undefined,
    });
  };

  return (
    <div
      className="st3-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="st3-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="st3-reception-title"
      >
        <header>
          <span className="st3-modal-icon st3-modal-icon--success">
            <ReceptionIcon />
          </span>

          <div>
            <span>Mouvement réel</span>
            <strong id="st3-reception-title">
              Enregistrer une réception
            </strong>
            <small>
              {text(item?.reference)}
              {' · '}
              {text(item?.label)}
            </small>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="st3-modal-body">
          <label>
            <span>Dépôt</span>
            <select
              value={form.warehouse_id}
              onChange={(event) =>
                update(
                  'warehouse_id',
                  event.target.value,
                )
              }
            >
              <option value="">
                Sélectionner un dépôt
              </option>
              {warehouses.map(
                (warehouse) => (
                  <option
                    key={warehouse.id}
                    value={warehouse.id}
                  >
                    {warehouse.name}
                  </option>
                ),
              )}
            </select>
          </label>

          <label>
            <span>Quantité reçue</span>
            <input
              type="number"
              min="1"
              step="1"
              value={form.quantity}
              onChange={(event) =>
                update(
                  'quantity',
                  event.target.value,
                )
              }
              autoFocus
            />
          </label>

          <label>
            <span>Opérateur</span>
            <input
              value={form.operator}
              onChange={(event) =>
                update(
                  'operator',
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span>Notes</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) =>
                update(
                  'notes',
                  event.target.value,
                )
              }
            />
          </label>

          {(localError || error) && (
            <div className="st3-form-error">
              {localError || error}
            </div>
          )}
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
            disabled={saving}
          >
            {saving
              ? 'Enregistrement…'
              : 'Valider la réception'}
          </button>
        </footer>
      </section>
    </div>
  );
});


export default StockReceptionModal;
