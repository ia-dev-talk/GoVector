import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  BoxIcon,
  CloseIcon,
} from './StockIcons';
import {
  buildItemDocument,
  text,
} from './stockUtils';
import {
  canCloseStockDraft,
  isStockDraftDirty,
} from './stockUnsavedChanges';


const EMPTY_FORM = Object.freeze({
  reference: '',
  label: '',
  equipment_type: '',
  operator: '',
  manufacturer: '',
  model: '',
  unit: 'unité',
  unit_price: '',
  category: '',
  min_stock_threshold: '0',
  is_active: true,
  alert_enabled: true,
});


function initialForm(item) {
  if (!item) {
    return {
      ...EMPTY_FORM,
    };
  }

  return {
    reference:
      text(item?.reference),
    label:
      text(item?.label),
    equipment_type:
      text(item?.equipment_type),
    operator:
      text(item?.operator),
    manufacturer:
      text(item?.manufacturer),
    model:
      text(item?.model),
    unit:
      text(item?.unit, 'unité'),
    unit_price:
      item?.unit_price === null ||
      item?.unit_price === undefined
        ? ''
        : String(item.unit_price),
    category:
      text(item?.category),
    min_stock_threshold:
      String(
        item?.min_stock_threshold ?? 0,
      ),
    is_active:
      item?.is_active !== false,
    alert_enabled:
      item?.alert_enabled !== false,
  };
}


const StockEditorModal = memo(function StockEditorModal({
  item,
  saving,
  error,
  onClose,
  onSave,
}) {
  const baseline = useMemo(
    () => initialForm(item),
    [item],
  );
  const [form, setForm] =
    useState(() =>
      initialForm(item),
    );

  const [localError, setLocalError] =
    useState('');

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        setForm(
          initialForm(item),
        );
        setLocalError('');
      }, 0);

    return () =>
      window.clearTimeout(timer);
  }, [item]);

  const dirty = isStockDraftDirty(form, baseline);
  const requestClose = useCallback(() => {
    if (canCloseStockDraft({
      dirty,
      saving,
      confirmDiscard: window.confirm,
    })) {
      onClose();
    }
  }, [dirty, onClose, saving]);

  const update =
    (key, value) => {
      setForm((current) => ({
        ...current,
        [key]: value,
      }));
    };

  const submit = () => {
    try {
      setLocalError('');
      onSave(
        buildItemDocument(form),
      );
    } catch (validationError) {
      setLocalError(
        validationError.message,
      );
    }
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
          requestClose();
        }
      }}
    >
      <section
        className="st3-modal st3-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="st3-item-title"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          requestClose();
        }}
      >
        <header>
          <span className="st3-modal-icon">
            <BoxIcon />
          </span>

          <div>
            <span>Catalogue FTTH</span>
            <strong id="st3-item-title">
              {item
                ? 'Modifier l’article'
                : 'Créer un article'}
            </strong>
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
          <label>
            <span>Référence</span>
            <input
              value={form.reference}
              onChange={(event) =>
                update(
                  'reference',
                  event.target.value,
                )
              }
              autoFocus
            />
          </label>

          <label className="st3-field-wide">
            <span>Libellé</span>
            <input
              value={form.label}
              onChange={(event) =>
                update(
                  'label',
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span>Type d’équipement</span>
            <input
              value={form.equipment_type}
              onChange={(event) =>
                update(
                  'equipment_type',
                  event.target.value,
                )
              }
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
            <span>Fabricant</span>
            <input
              value={form.manufacturer}
              onChange={(event) =>
                update(
                  'manufacturer',
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span>Modèle</span>
            <input
              value={form.model}
              onChange={(event) =>
                update(
                  'model',
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span>Unité</span>
            <input
              value={form.unit}
              onChange={(event) =>
                update(
                  'unit',
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span>Prix unitaire (DH)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.unit_price}
              onChange={(event) =>
                update(
                  'unit_price',
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span>Catégorie</span>
            <input
              value={form.category}
              onChange={(event) =>
                update(
                  'category',
                  event.target.value,
                )
              }
            />
          </label>

          <label>
            <span>Seuil minimum</span>
            <input
              type="number"
              min="0"
              step="1"
              value={form.min_stock_threshold}
              onChange={(event) =>
                update(
                  'min_stock_threshold',
                  event.target.value,
                )
              }
            />
          </label>

          <label className="st3-switch-field">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) =>
                update(
                  'is_active',
                  event.target.checked,
                )
              }
            />
            <span>Article actif</span>
          </label>

          <label className="st3-switch-field">
            <input
              type="checkbox"
              checked={form.alert_enabled}
              onChange={(event) =>
                update(
                  'alert_enabled',
                  event.target.checked,
                )
              }
            />
            <span>Alertes de seuil actives</span>
          </label>

          {(localError || error) && (
            <div className="st3-form-error st3-field-wide">
              {localError || error}
            </div>
          )}
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
            disabled={saving}
          >
            {saving
              ? 'Enregistrement…'
              : item
                ? 'Enregistrer'
                : 'Créer l’article'}
          </button>
        </footer>
      </section>
    </div>
  );
});


export default StockEditorModal;
