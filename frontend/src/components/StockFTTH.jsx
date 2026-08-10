import { useState, useCallback, useEffect, useMemo } from 'react';
import { apiClient } from '../api/client';
import StockHierarchy from './stock/StockHierarchy';
import StockKPIs from './stock/StockKPIs';
import StockTable from './stock/StockTable';
import StockAllocationPanel from './stock/StockAllocationPanel';
import '../styles/stock-ftth.css';

function normalizeIdentifier(value) {
  if (value == null) {
    return null;
  }

  const identifier = String(
    value
  ).trim();

  return identifier || null;
}

function normalizeWarehouseType(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function parseNonNegativeNumber(value) {
  if (
    typeof value !== 'number' &&
    typeof value !== 'string'
  ) {
    return null;
  }

  if (
    typeof value === 'string' &&
    value.trim() === ''
  ) {
    return null;
  }

  const number = Number(value);

  return (
    Number.isFinite(number) &&
    number >= 0
  )
    ? number
    : null;
}

function parsePositiveInteger(value) {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number'
  ) {
    return null;
  }

  const normalized =
    String(value).trim();

  if (
    !/^\d+$/.test(normalized)
  ) {
    return null;
  }

  const number = Number(normalized);

  return (
    Number.isSafeInteger(number) &&
    number > 0
  )
    ? number
    : null;
}

function normalizeRequiredStockItemText(
  value,
  fieldLabel,
  maxLength
) {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    throw new Error(
      `${fieldLabel} est obligatoire.`
    );
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(
      `${fieldLabel} ne doit pas dépasser ` +
      `${maxLength} caractères.`
    );
  }

  return normalized;
}

function normalizeOptionalStockItemText(
  value,
  fieldLabel,
  maxLength
) {
  if (value == null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error(
      `${fieldLabel} doit être un texte valide.`
    );
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length > maxLength) {
    throw new Error(
      `${fieldLabel} ne doit pas dépasser ` +
      `${maxLength} caractères.`
    );
  }

  return normalized;
}

function normalizeOptionalStockItemPrice(value) {
  if (
    value == null ||
    (
      typeof value === 'string' &&
      value.trim() === ''
    )
  ) {
    return null;
  }

  let number;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (
      !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(
        normalized
      )
    ) {
      throw new Error(
        'Le prix unitaire doit être un nombre ' +
        'fini supérieur ou égal à zéro.'
      );
    }
    number = Number(normalized);
  } else if (
    typeof value === 'number'
  ) {
    number = value;
  } else {
    throw new Error(
      'Le prix unitaire doit être un nombre ' +
      'fini supérieur ou égal à zéro.'
    );
  }

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    throw new Error(
      'Le prix unitaire doit être un nombre ' +
      'fini supérieur ou égal à zéro.'
    );
  }

  return number;
}

function normalizeStockItemThreshold(value) {
  let number;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) {
      throw new Error(
        'Le seuil minimum doit être un entier ' +
        'supérieur ou égal à zéro.'
      );
    }
    number = Number(normalized);
  } else if (
    typeof value === 'number'
  ) {
    number = value;
  } else {
    throw new Error(
      'Le seuil minimum doit être un entier ' +
      'supérieur ou égal à zéro.'
    );
  }

  if (
    !Number.isSafeInteger(number) ||
    number < 0
  ) {
    throw new Error(
      'Le seuil minimum doit être un entier ' +
      'supérieur ou égal à zéro.'
    );
  }

  return number;
}

function buildStockItemPayload(data) {
  const reference =
    normalizeRequiredStockItemText(
      data?.reference,
      'La référence',
      100
    );
  const label =
    normalizeRequiredStockItemText(
      data?.label,
      'Le libellé',
      200
    );
  const equipmentType =
    normalizeRequiredStockItemText(
      data?.equipment_type,
      'Le type d’équipement',
      50
    );
  const operator =
    normalizeRequiredStockItemText(
      data?.operator,
      'L’opérateur',
      20
    );
  const unit =
    normalizeRequiredStockItemText(
      data?.unit,
      'L’unité',
      20
    );
  const manufacturer =
    normalizeOptionalStockItemText(
      data?.manufacturer,
      'Le fabricant',
      100
    );
  const model =
    normalizeOptionalStockItemText(
      data?.model,
      'Le modèle',
      100
    );
  const category =
    normalizeOptionalStockItemText(
      data?.category,
      'La catégorie',
      50
    );
  const unitPrice =
    normalizeOptionalStockItemPrice(
      data?.unit_price
    );
  const minStockThreshold =
    normalizeStockItemThreshold(
      data?.min_stock_threshold
    );

  if (typeof data?.is_active !== 'boolean') {
    throw new Error(
      'L’état actif de l’article est invalide.'
    );
  }
  if (
    typeof data?.alert_enabled !== 'boolean'
  ) {
    throw new Error(
      'L’état des alertes est invalide.'
    );
  }

  return {
    reference,
    label,
    equipment_type: equipmentType,
    operator,
    manufacturer,
    model,
    unit,
    unit_price: unitPrice,
    category,
    is_active: data.is_active,
    min_stock_threshold:
      minStockThreshold,
    alert_enabled: data.alert_enabled,
  };
}

const STOCK_ITEM_EDITABLE_FIELDS = [
  'reference',
  'label',
  'equipment_type',
  'operator',
  'manufacturer',
  'model',
  'unit',
  'unit_price',
  'category',
  'is_active',
  'min_stock_threshold',
  'alert_enabled',
];

function createStockItemEditForm(item) {
  const normalized =
    buildStockItemPayload(item);

  return {
    reference: normalized.reference,
    label: normalized.label,
    equipment_type:
      normalized.equipment_type,
    operator: normalized.operator,
    manufacturer:
      normalized.manufacturer ?? '',
    model:
      normalized.model ?? '',
    unit: normalized.unit,
    unit_price:
      normalized.unit_price === null
        ? ''
        : String(normalized.unit_price),
    category:
      normalized.category ?? '',
    min_stock_threshold:
      String(
        normalized.min_stock_threshold
      ),
    is_active: normalized.is_active,
    alert_enabled:
      normalized.alert_enabled,
  };
}

function buildStockItemUpdatePayload(
  currentItem,
  formData
) {
  const current =
    buildStockItemPayload(currentItem);
  const next =
    buildStockItemPayload(formData);
  const updates = {};

  for (
    const fieldName of
    STOCK_ITEM_EDITABLE_FIELDS
  ) {
    if (
      current[fieldName] !==
      next[fieldName]
    ) {
      updates[fieldName] =
        next[fieldName];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error(
      'Aucune modification n’a été détectée.'
    );
  }

  return updates;
}

function getStockItemApiErrorMessage(
  error,
  fallbackMessage
) {
  const detail =
    error?.response?.data?.detail;

  if (
    typeof detail === 'string' &&
    detail.trim()
  ) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => {
        if (
          typeof entry === 'string' &&
          entry.trim()
        ) {
          return entry.trim();
        }
        if (
          entry &&
          typeof entry === 'object' &&
          typeof entry.msg === 'string' &&
          entry.msg.trim()
        ) {
          return entry.msg.trim();
        }
        return null;
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(' ');
    }
  }

  if (
    detail &&
    typeof detail === 'object'
  ) {
    if (
      typeof detail.message === 'string' &&
      detail.message.trim()
    ) {
      return detail.message.trim();
    }
    if (
      typeof detail.msg === 'string' &&
      detail.msg.trim()
    ) {
      return detail.msg.trim();
    }
  }

  if (
    typeof error?.message === 'string' &&
    error.message.trim()
  ) {
    return error.message.trim();
  }

  return fallbackMessage;
}

function computeFilteredWarehouseIds(node, teams, technicians) {
  if (!node) return null;
  if (
    !Array.isArray(teams) ||
    !Array.isArray(technicians)
  ) {
    return [];
  }
  if (
    node.type === 'technicien' ||
    node.type === 'equipe'
  ) {
    return [];
  }
  if (node.type === 'depot') {
    const warehouseId =
      normalizeIdentifier(
        node.warehouseId
      );

    return warehouseId !== null
      ? [warehouseId]
      : [];
  }
  return null;
}

function filterStockLines(lines, warehouseIds) {
  const safeLines =
    Array.isArray(lines)
      ? lines
      : [];

  if (warehouseIds === null) {
    return safeLines;
  }

  const normalizedWarehouseIds =
    new Set(
      (
        Array.isArray(warehouseIds)
          ? warehouseIds
          : []
      )
        .map(normalizeIdentifier)
        .filter(Boolean)
    );

  return safeLines.filter((line) =>
    normalizedWarehouseIds.has(
      normalizeIdentifier(
        line?.warehouseId ??
        line?.warehouse_id
      )
    )
  );
}

function computeAlerts(stockLines, stockItems, warehouses) {
  const safeLines =
    Array.isArray(stockLines)
      ? stockLines
      : [];
  const safeItems =
    Array.isArray(stockItems)
      ? stockItems
      : [];
  const safeWarehouses =
    Array.isArray(warehouses)
      ? warehouses
      : [];

  const depotIds = new Set(
    safeWarehouses
      .filter((warehouse) => {
        const type =
          normalizeWarehouseType(
            warehouse?.type
          );

        return (
          !type ||
          type === 'ENTREPOT'
        );
      })
      .map((warehouse) =>
        normalizeIdentifier(
          warehouse?.id
        )
      )
      .filter(Boolean)
  );

  const itemsById = new Map(
    safeItems
      .map((item) => [
        normalizeIdentifier(
          item?.id
        ),
        item,
      ])
      .filter(([id]) => id)
  );

  return safeLines.flatMap((line) => {
    const warehouseId =
      normalizeIdentifier(
        line?.warehouseId ??
        line?.warehouse_id
      );

    if (!depotIds.has(warehouseId)) {
      return [];
    }

    const item = itemsById.get(
      normalizeIdentifier(
        line?.itemId ??
        line?.item_id
      )
    );
    const threshold =
      parseNonNegativeNumber(
        item?.min_stock_threshold
      );
    const available =
      parseNonNegativeNumber(
        line?.available ??
        line?.available_quantity
      );

    if (
      !item ||
      threshold === null ||
      available === null ||
      available >= threshold
    ) {
      return [];
    }

    return [{
      equipment_type:
        item.equipment_type || '?',
      current_stock:
        available,
      min_stock_threshold:
        threshold,
      operator:
        item.operator || '?',
    }];
  });
}

async function exportFilteredCSV(lines, stockItems, warehouses) {
  const safeLines =
    Array.isArray(lines)
      ? lines
      : [];
  const safeItems =
    Array.isArray(stockItems)
      ? stockItems
      : [];
  const safeWarehouses =
    Array.isArray(warehouses)
      ? warehouses
      : [];

  const itemsById = new Map(
    safeItems
      .map((item) => [
        normalizeIdentifier(
          item?.id
        ),
        item,
      ])
      .filter(([id]) => id)
  );
  const warehousesById = new Map(
    safeWarehouses
      .map((warehouse) => [
        normalizeIdentifier(
          warehouse?.id
        ),
        warehouse,
      ])
      .filter(([id]) => id)
  );

  const enriched = safeLines.map((line) => {
    const item = itemsById.get(
      normalizeIdentifier(
        line?.itemId ??
        line?.item_id
      )
    );
    const warehouse = warehousesById.get(
      normalizeIdentifier(
        line?.warehouseId ??
        line?.warehouse_id
      )
    );
    const quantity =
      parseNonNegativeNumber(
        line?.quantity
      );
    const available =
      parseNonNegativeNumber(
        line?.available ??
        line?.available_quantity
      );
    const reserved =
      parseNonNegativeNumber(
        line?.reserved ??
        line?.reserved_quantity
      );
    const price =
      parseNonNegativeNumber(
        line?.unit_price ??
        item?.unit_price
      );
    const value =
      quantity !== null &&
      price !== null
        ? quantity * price
        : null;

    return {
      reference:
        line?.reference ||
        item?.reference ||
        '—',
      label:
        line?.label ||
        item?.label ||
        '—',
      type:
        line?.equipment_type ||
        item?.equipment_type ||
        '—',
      warehouse:
        line?.warehouse_name ||
        warehouse?.name ||
        '—',
      quantity:
        quantity ?? '—',
      available:
        available ?? '—',
      reserved:
        reserved ?? '—',
      price:
        price ?? '—',
      value:
        value ?? '—',
    };
  });
  const h = ['Réf.','Article','Type','Dépôt','Qté','Dispo','Réservé','Prix','Valeur'];
  const csv = [h,...enriched.map(r => h.map(k => `"${r[{0:'reference',1:'label',2:'type',3:'warehouse',4:'quantity',5:'available',6:'reserved',7:'price',8:'value'}[h.indexOf(k)]] ?? ''}"`).join(','))].join('\n');
  const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `stock_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ── AddMaterialPanel ────────────────────────────
function AddMaterialPanel({
  onClose,
  onAddSubmit,
  loading,
}) {
  const [form, setForm] = useState({
    reference: '',
    label: '',
    equipment_type: '',
    operator: '',
    manufacturer: '',
    model: '',
    unit: 'unité',
    unit_price: '',
    category: '',
    min_stock_threshold: '5',
    is_active: true,
    alert_enabled: true,
  });
  const [error, setError] = useState('');
  const handleChange = useCallback((f, v) => setForm(p => ({ ...p, [f]: v })), []);
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (loading) {
      return;
    }

    let payload;
    try {
      payload = buildStockItemPayload(form);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : 'Les données de l’article sont invalides.'
      );
      return;
    }

    setError('');
    try {
      await onAddSubmit(payload);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'L’article n’a pas pu être créé.'
      );
    }
  }, [
    form,
    loading,
    onAddSubmit,
  ]);

  return (
    <div className="stock-action-panel">
      <div className="stock-action-panel-header"><strong>➕ Ajouter un article</strong><button type="button" className="stock-action-close" onClick={onClose} disabled={loading}>✕</button></div>
      <form className="stock-action-panel-body" onSubmit={handleSubmit}>
        {error && <div className="stock-error">{error}</div>}
        <div className="action-form-grid">
          <input type="text" placeholder="Référence *" value={form.reference} onChange={e => handleChange('reference', e.target.value)} />
          <input type="text" placeholder="Libellé *" value={form.label} onChange={e => handleChange('label', e.target.value)} />
          <input type="text" placeholder="Type d’équipement *" value={form.equipment_type} onChange={e => handleChange('equipment_type', e.target.value)} />
          <input type="text" placeholder="Opérateur *" value={form.operator} onChange={e => handleChange('operator', e.target.value)} />
          <input type="text" placeholder="Fabricant" value={form.manufacturer} onChange={e => handleChange('manufacturer', e.target.value)} />
          <input type="text" placeholder="Modèle" value={form.model} onChange={e => handleChange('model', e.target.value)} />
          <input type="text" placeholder="Unité *" value={form.unit} onChange={e => handleChange('unit', e.target.value)} />
          <input type="number" min="0" step="any" placeholder="Prix unitaire (DH)" value={form.unit_price} onChange={e => handleChange('unit_price', e.target.value)} />
          <input type="text" placeholder="Catégorie" value={form.category} onChange={e => handleChange('category', e.target.value)} />
          <input type="number" min="0" step="1" placeholder="Seuil minimum" value={form.min_stock_threshold} onChange={e => handleChange('min_stock_threshold', e.target.value)} />
          <label>
            <input type="checkbox" checked={form.is_active} onChange={e => handleChange('is_active', e.target.checked)} />
            Article actif
          </label>
          <label>
            <input type="checkbox" checked={form.alert_enabled} onChange={e => handleChange('alert_enabled', e.target.checked)} />
            Alertes activées
          </label>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button type="button" className="af-btn-cancel" onClick={onClose} disabled={loading}>Annuler</button>
          <button type="submit" className="btn-allocate" disabled={loading}>{loading ? 'Création…' : 'Créer l’article'}</button>
        </div>
      </form>
    </div>
  );
}

// ── ActionBar ───────────────────────────────────
function CatalogPanel({
  onClose,
  stockItems,
  onUpdateSubmit,
  onStatusSubmit,
  loading,
}) {
  const [selectedItemId, setSelectedItemId] =
    useState('');
  const [editForm, setEditForm] =
    useState(null);
  const [error, setError] =
    useState('');

  const safeItems = useMemo(
    () => (
      Array.isArray(stockItems)
        ? stockItems
        : []
    ).filter(
      (item) =>
        parsePositiveInteger(
          item?.id
        ) !== null
    ),
    [stockItems]
  );

  const selectedItem = useMemo(
    () => {
      const selectedIdentifier =
        normalizeIdentifier(
          selectedItemId
        );

      if (selectedIdentifier === null) {
        return null;
      }

      return safeItems.find(
        (item) =>
          normalizeIdentifier(
            item?.id
          ) === selectedIdentifier
      ) ?? null;
    },
    [
      safeItems,
      selectedItemId,
    ]
  );

  const handleSelectionChange =
    useCallback((event) => {
      setSelectedItemId(
        event.target.value
      );
      setEditForm(null);
      setError('');
    }, []);

  const handleEditChange =
    useCallback((fieldName, value) => {
      setEditForm((currentForm) => (
        currentForm
          ? {
              ...currentForm,
              [fieldName]: value,
            }
          : currentForm
      ));
    }, []);

  const handleStartEdit =
    useCallback(() => {
      if (!selectedItem) {
        setError(
          'Sélectionnez un article à modifier.'
        );
        return;
      }

      try {
        setEditForm(
          createStockItemEditForm(
            selectedItem
          )
        );
        setError('');
      } catch (contractError) {
        setError(
          contractError instanceof Error
            ? contractError.message
            : 'Les données de l’article sont invalides.'
        );
      }
    }, [selectedItem]);

  const handleCancelEdit =
    useCallback(() => {
      if (loading) {
        return;
      }
      setEditForm(null);
      setError('');
    }, [loading]);

  const handleEditSubmit =
    useCallback(async (event) => {
      event.preventDefault();
      if (loading) {
        return;
      }
      if (!selectedItem || !editForm) {
        setError(
          'Sélectionnez un article à modifier.'
        );
        return;
      }

      setError('');
      try {
        await onUpdateSubmit(
          selectedItem.id,
          editForm
        );
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : 'L’article n’a pas pu être modifié.'
        );
      }
    }, [
      editForm,
      loading,
      onUpdateSubmit,
      selectedItem,
    ]);

  const handleStatusSubmit =
    useCallback(async () => {
      if (loading) {
        return;
      }
      if (!selectedItem) {
        setError(
          'Sélectionnez un article.'
        );
        return;
      }
      if (
        typeof selectedItem.is_active !==
        'boolean'
      ) {
        setError(
          'L’état de cet article est inconnu.'
        );
        return;
      }

      setError('');
      try {
        await onStatusSubmit(
          selectedItem.id,
          !selectedItem.is_active
        );
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : 'Le statut de l’article n’a pas pu être modifié.'
        );
      }
    }, [
      loading,
      onStatusSubmit,
      selectedItem,
    ]);

  const statusLabel =
    selectedItem?.is_active === true
      ? 'Actif'
      : selectedItem?.is_active === false
        ? 'Inactif'
        : 'État inconnu';
  const alertLabel =
    selectedItem?.alert_enabled === true
      ? 'Activées'
      : selectedItem?.alert_enabled === false
        ? 'Désactivées'
        : 'État inconnu';

  return (
    <div className="stock-action-panel">
      <div className="stock-action-panel-header">
        <strong>📚 Catalogue</strong>
        <button
          type="button"
          className="stock-action-close"
          onClick={onClose}
          disabled={loading}
        >
          ✕
        </button>
      </div>
      <div className="stock-action-panel-body">
        {error && (
          <div className="stock-error">
            {error}
          </div>
        )}

        {safeItems.length === 0 ? (
          <div>Aucun article disponible</div>
        ) : (
          <select
            value={selectedItemId}
            onChange={handleSelectionChange}
            disabled={
              loading ||
              editForm !== null
            }
          >
            <option value="">
              Sélectionnez un article
            </option>
            {safeItems.map((item) => {
              const itemStatus =
                item?.is_active === true
                  ? 'Actif'
                  : item?.is_active === false
                    ? 'Inactif'
                    : 'État inconnu';

              return (
                <option
                  key={item.id}
                  value={item.id}
                >
                  [{itemStatus}]{' '}
                  {item?.reference ?? '—'}
                  {' — '}
                  {item?.label ?? '—'}
                </option>
              );
            })}
          </select>
        )}

        {selectedItem && !editForm && (
          <>
            <div className="action-form-grid">
              <div><strong>Référence</strong><div>{selectedItem.reference ?? '—'}</div></div>
              <div><strong>Libellé</strong><div>{selectedItem.label ?? '—'}</div></div>
              <div><strong>Type</strong><div>{selectedItem.equipment_type ?? '—'}</div></div>
              <div><strong>Opérateur</strong><div>{selectedItem.operator ?? '—'}</div></div>
              <div><strong>Unité</strong><div>{selectedItem.unit ?? '—'}</div></div>
              <div><strong>Statut</strong><div>{statusLabel}</div></div>
              {selectedItem.manufacturer && <div><strong>Fabricant</strong><div>{selectedItem.manufacturer}</div></div>}
              {selectedItem.model && <div><strong>Modèle</strong><div>{selectedItem.model}</div></div>}
              {selectedItem.category && <div><strong>Catégorie</strong><div>{selectedItem.category}</div></div>}
              <div><strong>Prix unitaire</strong><div>{selectedItem.unit_price == null ? '—' : `${selectedItem.unit_price} DH`}</div></div>
              <div><strong>Seuil minimum</strong><div>{selectedItem.min_stock_threshold == null ? '—' : selectedItem.min_stock_threshold}</div></div>
              <div><strong>Alertes</strong><div>{alertLabel}</div></div>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button type="button" className="stock-action-btn" onClick={handleStartEdit} disabled={loading}>Modifier</button>
              {typeof selectedItem.is_active === 'boolean' && (
                <button type="button" className="stock-action-btn" onClick={handleStatusSubmit} disabled={loading}>
                  {selectedItem.is_active ? 'Désactiver' : 'Réactiver'}
                </button>
              )}
              <button type="button" className="af-btn-cancel" onClick={onClose} disabled={loading}>Fermer</button>
            </div>
          </>
        )}

        {selectedItem && editForm && (
          <form onSubmit={handleEditSubmit}>
            <div className="action-form-grid">
              <input type="text" placeholder="Référence *" value={editForm.reference} onChange={event => handleEditChange('reference', event.target.value)} />
              <input type="text" placeholder="Libellé *" value={editForm.label} onChange={event => handleEditChange('label', event.target.value)} />
              <input type="text" placeholder="Type d’équipement *" value={editForm.equipment_type} onChange={event => handleEditChange('equipment_type', event.target.value)} />
              <input type="text" placeholder="Opérateur *" value={editForm.operator} onChange={event => handleEditChange('operator', event.target.value)} />
              <input type="text" placeholder="Fabricant" value={editForm.manufacturer} onChange={event => handleEditChange('manufacturer', event.target.value)} />
              <input type="text" placeholder="Modèle" value={editForm.model} onChange={event => handleEditChange('model', event.target.value)} />
              <input type="text" placeholder="Unité *" value={editForm.unit} onChange={event => handleEditChange('unit', event.target.value)} />
              <input type="number" min="0" step="any" placeholder="Prix unitaire (DH)" value={editForm.unit_price} onChange={event => handleEditChange('unit_price', event.target.value)} />
              <input type="text" placeholder="Catégorie" value={editForm.category} onChange={event => handleEditChange('category', event.target.value)} />
              <input type="number" min="0" step="1" placeholder="Seuil minimum" value={editForm.min_stock_threshold} onChange={event => handleEditChange('min_stock_threshold', event.target.value)} />
              <label>
                <input type="checkbox" checked={editForm.is_active} onChange={event => handleEditChange('is_active', event.target.checked)} />
                Article actif
              </label>
              <label>
                <input type="checkbox" checked={editForm.alert_enabled} onChange={event => handleEditChange('alert_enabled', event.target.checked)} />
                Alertes activées
              </label>
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button type="button" className="af-btn-cancel" onClick={handleCancelEdit} disabled={loading}>Annuler l’édition</button>
              <button type="submit" className="btn-allocate" disabled={loading}>{loading ? 'Enregistrement…' : 'Enregistrer les modifications'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ActionBar({
  onAction,
  canReceive,
  canAdd,
  canCatalog,
  canManageCatalog,
}) {
  const actions = [
    ...(
      canManageCatalog
        ? [{
            key: 'add',
            label: '➕ Ajouter',
            disabled: !canAdd,
          }, {
            key: 'catalog',
            label: '📚 Catalogue',
            disabled: !canCatalog,
          }]
        : []
    ),
    {
      key: 'reception',
      label: '📥 Réception',
      disabled: !canReceive,
    },
    { key: 'export', label: '📎 Export' },
    { key: 'history', label: '📜 Historique' },
  ];
  return (
    <div className="stock-actions">
      {actions.map(a => (
        <button
          key={a.key}
          type="button"
          className="stock-action-btn"
          disabled={a.disabled}
          onClick={() =>
            onAction(a.key)
          }
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ── InventoryPanel ──────────────────────────────
function InventoryPanel({ onClose, warehouses, stockItems, onInventorySubmit, loading }) {
  const [form, setForm] = useState({ warehouseId: '', date: new Date().toISOString().slice(0, 10), items: [] });
  const [error, setError] = useState('');
  const handleAddItem = useCallback(() => setForm(p => ({ ...p, items: [...p.items, { itemId: '', actualQuantity: 0 }] })), []);
  const handleItemChange = useCallback((idx, f, v) => setForm(p => { const items = [...p.items]; items[idx] = { ...items[idx], [f]: v }; return { ...p, items }; }), []);
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!form.warehouseId) { setError('Le dépôt est obligatoire'); return; }
    if (form.items.length === 0) { setError('Ajoutez au moins un article'); return; }
    setError('');
    onInventorySubmit({ warehouse_id: parseInt(form.warehouseId), date: form.date || null, items: form.items.map(it => ({ item_id: parseInt(it.itemId), actual_quantity: parseInt(it.actualQuantity) || 0 })) });
  }, [form, onInventorySubmit]);
  return (
    <div className="stock-action-panel">
      <div className="stock-action-panel-header"><strong>📋 Inventaire</strong><button className="stock-action-close" onClick={onClose} disabled={loading}>✕</button></div>
      <form className="stock-action-panel-body" onSubmit={handleSubmit}>
        {error && <div className="stock-error">{error}</div>}
        <div className="action-form-grid">
          <select value={form.warehouseId} onChange={e => setForm(p => ({ ...p, warehouseId: e.target.value }))}><option value="">Dépôt</option>{warehouses.filter(w => w.type === 'ENTREPOT').map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}</select>
          <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
        </div>
        <div style={{ margin:'8px 0', fontWeight:600, fontSize:12, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.04em' }}>Articles</div>
        {form.items.map((item, idx) => (
          <div key={idx} className="action-form-grid" style={{ marginBottom:4 }}>
            <select value={item.itemId} onChange={e => handleItemChange(idx, 'itemId', e.target.value)}><option value="">Article</option>{stockItems.map(i => (<option key={i.id} value={i.id}>{i.reference} — {i.label}</option>))}</select>
            <input type="number" min="0" placeholder="Qté réelle" value={item.actualQuantity} onChange={e => handleItemChange(idx, 'actualQuantity', e.target.value)} />
          </div>
        ))}
        <button type="button" className="stock-action-btn" onClick={handleAddItem} style={{ marginBottom:8 }}>+ Ajouter un article</button>
        <button type="submit" className="btn-allocate" disabled={loading || form.items.length === 0}>{loading ? 'Inventaire…' : 'Enregistrer'}</button>
      </form>
    </div>
  );
}

// ── ReceptionPanel ──────────────────────────────
function ReceptionPanel({ onClose, warehouses, stockItems, onReceptionSubmit, loading }) {
  const safeWarehouses = useMemo(
    () => (Array.isArray(warehouses) ? warehouses : []),
    [warehouses],
  );
  const safeStockItems = useMemo(
    () => (Array.isArray(stockItems) ? stockItems : []),
    [stockItems],
  );
  const [form, setForm] = useState({
    warehouseId: '',
    itemId: '',
    quantity: 1,
    operator: '',
    notes: '',
  });
  const [error, setError] = useState('');
  const handleChange = useCallback((f, v) => setForm(p => ({ ...p, [f]: v })), []);
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (loading) {
      return;
    }

    const warehouseId =
      parsePositiveInteger(
        form.warehouseId
      );
    const itemId =
      parsePositiveInteger(
        form.itemId
      );
    const quantity =
      parsePositiveInteger(
        form.quantity
      );

    if (
      warehouseId === null ||
      !safeWarehouses.some(
        (warehouse) =>
          normalizeIdentifier(
            warehouse?.id
          ) ===
          normalizeIdentifier(
            warehouseId
          )
      )
    ) {
      setError(
        'Sélectionnez un dépôt réel valide.'
      );
      return;
    }

    if (
      itemId === null ||
      !safeStockItems.some(
        (item) =>
          normalizeIdentifier(
            item?.id
          ) ===
          normalizeIdentifier(
            itemId
          )
      )
    ) {
      setError(
        'Sélectionnez un article réel valide.'
      );
      return;
    }

    if (quantity === null) {
      setError(
        'La quantité doit être un entier strictement positif.'
      );
      return;
    }

    const normalizedOperator =
      String(form.operator ?? '')
        .trim();
    const normalizedNotes =
      String(form.notes ?? '')
        .trim();

    setError('');
    try {
      await onReceptionSubmit({
        warehouse_id:
          warehouseId,
        item_id:
          itemId,
        quantity,
        operator:
          normalizedOperator ||
          undefined,
        notes:
          normalizedNotes ||
          undefined,
      });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'La réception n’a pas pu être enregistrée.'
      );
    }
  }, [
    form,
    loading,
    onReceptionSubmit,
    safeStockItems,
    safeWarehouses,
  ]);
  return (
    <div className="stock-action-panel">
      <div className="stock-action-panel-header"><strong>📥 Réception article existant</strong><button className="stock-action-close" onClick={onClose} disabled={loading}>✕</button></div>
      <form className="stock-action-panel-body" onSubmit={handleSubmit}>
        {error && <div className="stock-error">{error}</div>}
        <div className="action-form-grid">
          <select value={form.warehouseId} onChange={e => handleChange('warehouseId', e.target.value)}><option value="">Dépôt</option>{safeWarehouses.map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}</select>
          <select value={form.itemId} onChange={e => handleChange('itemId', e.target.value)}><option value="">Article</option>{safeStockItems.map(i => (<option key={i.id} value={i.id}>{i.reference} — {i.label}</option>))}</select>
          <input type="number" min="1" step="1" placeholder="Quantité" value={form.quantity} onChange={e => handleChange('quantity', e.target.value)} />
          <input type="text" placeholder="Opérateur" value={form.operator} onChange={e => handleChange('operator', e.target.value)} />
          <input type="text" placeholder="Observations" value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
        </div>
        <button type="submit" className="btn-allocate" disabled={loading}>{loading ? 'Réception…' : 'Valider'}</button>
      </form>
    </div>
  );
}

// ── ReturnPanel ─────────────────────────────────
function ReturnPanel({ onClose, warehouses, stockItems, onReturnSubmit, loading }) {
  const [form, setForm] = useState({ sourceWarehouseId: '', destWarehouseId: '', itemId: '', quantity: 1, condition: 'BON_ETAT', serialNumber: '', notes: '' });
  const [error, setError] = useState('');
  const handleChange = useCallback((f, v) => setForm(p => ({ ...p, [f]: v })), []);
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!form.sourceWarehouseId || !form.destWarehouseId || !form.itemId || form.quantity < 1) { setError('Tous les champs sont obligatoires'); return; }
    setError('');
    onReturnSubmit({ warehouse_id: parseInt(form.destWarehouseId), items: [{ item_id: parseInt(form.itemId), quantity: parseInt(form.quantity), condition: form.condition, serial_number: form.serialNumber || null }], notes: [form.notes, `État: ${form.condition}`].filter(Boolean).join(' | ') });
  }, [form, onReturnSubmit]);
  return (
    <div className="stock-action-panel">
      <div className="stock-action-panel-header"><strong>↩️ Retour</strong><button className="stock-action-close" onClick={onClose} disabled={loading}>✕</button></div>
      <form className="stock-action-panel-body" onSubmit={handleSubmit}>
        {error && <div className="stock-error">{error}</div>}
        <div className="action-form-grid">
          <select value={form.sourceWarehouseId} onChange={e => handleChange('sourceWarehouseId', e.target.value)}><option value="">Provenance</option>{warehouses.filter(w => w.type !== 'ENTREPOT').map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}</select>
          <select value={form.destWarehouseId} onChange={e => handleChange('destWarehouseId', e.target.value)}><option value="">Dépôt</option>{warehouses.filter(w => w.type === 'ENTREPOT').map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}</select>
          <select value={form.itemId} onChange={e => handleChange('itemId', e.target.value)}><option value="">Article</option>{stockItems.map(i => (<option key={i.id} value={i.id}>{i.reference} — {i.label}</option>))}</select>
          <input type="number" min="1" placeholder="Quantité" value={form.quantity} onChange={e => handleChange('quantity', parseInt(e.target.value) || 1)} />
          <select value={form.condition} onChange={e => handleChange('condition', e.target.value)}><option value="BON_ETAT">Bon état</option><option value="DEFECTUEUX">Défectueux</option><option value="A_REPARER">À réparer</option></select>
          <input type="text" placeholder="N° série" value={form.serialNumber} onChange={e => handleChange('serialNumber', e.target.value)} />
          <input type="text" placeholder="Motif" value={form.notes} onChange={e => handleChange('notes', e.target.value)} />
        </div>
        <button type="submit" className="btn-allocate" disabled={loading}>{loading ? 'Retour…' : 'Valider'}</button>
      </form>
    </div>
  );
}

// ── HistoryPanel enrichi ────────────────────────
function HistoryPanel({ movements, onClose }) {
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const filtered = useMemo(() => {
    let r = movements || [];
    if (filter) { const q = filter.toLowerCase(); r = r.filter(m => (m.reference||'').toLowerCase().includes(q) || (m.label||'').toLowerCase().includes(q) || (m.warehouse_name||'').toLowerCase().includes(q) || (m.notes||'').toLowerCase().includes(q)); }
    if (typeFilter) r = r.filter(m => m.movement_type === typeFilter);
    return r;
  }, [movements, filter, typeFilter]);
  const types = useMemo(() => { const s = new Set((movements||[]).map(m => m.movement_type).filter(Boolean)); return ['TOUS', ...Array.from(s)]; }, [movements]);
  return (
    <div className="stock-action-panel">
      <div className="stock-action-panel-header"><strong>📜 Traçabilité complète</strong><button className="stock-action-close" onClick={onClose}>✕</button></div>
      <div className="stock-action-panel-body">
        <div className="stock-filters" style={{ marginBottom:8 }}>
          <input className="stock-search" placeholder="🔍 Rechercher…" value={filter} onChange={e => setFilter(e.target.value)} />
          <div className="stock-type-chips">{types.map(t => (<button key={t} className={`chip ${(typeFilter === '' && t === 'TOUS') || typeFilter === t ? 'chip--active' : ''}`} onClick={() => setTypeFilter(t === 'TOUS' ? '' : t)}>{t}</button>))}</div>
        </div>
        {filtered.length === 0 ? (<div className="st-empty"><span className="st-empty-icon">📜</span><span className="st-empty-title">Aucun mouvement</span></div>) : (
          <div className="st-wrapper" style={{ maxHeight:400 }}>
            <table className="st-table">
              <thead><tr>
                <th className="st-th">Date</th><th className="st-th">Heure</th><th className="st-th">Action</th>
                <th className="st-th">Article</th><th className="st-th">Qté</th><th className="st-th">Avant</th><th className="st-th">Après</th>
                <th className="st-th">Dépôt</th><th className="st-th">Tech</th><th className="st-th">Interv.</th><th className="st-th">Notes</th>
              </tr></thead>
              <tbody>{filtered.map(m => (<tr key={m.id} className="st-tr">
                <td className="st-td st-td--mono">{m.created_at ? new Date(m.created_at).toLocaleDateString('fr-FR') : '—'}</td>
                <td className="st-td st-td--mono">{m.created_at ? new Date(m.created_at).toLocaleTimeString('fr-FR', {hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                <td className="st-td"><span className={`status-tag ${(m.movement_type||'').toLowerCase()}`}>{m.movement_type||'—'}</span></td>
                <td className="st-td st-td--label">{m.reference} — {m.label}</td>
                <td className="st-td st-td--num"><span className={`st-qty ${(m.quantity||0) > 0 ? 'st-qty--ok' : 'st-qty--empty'}`}>{m.quantity}</span></td>
                <td className="st-td st-td--num st-td--mono">{m.quantity_before ?? '—'}</td>
                <td className="st-td st-td--num st-td--mono">{m.quantity_after ?? '—'}</td>
                <td className="st-td">{m.warehouse_name||'—'}</td>
                <td className="st-td st-td--mono">{m.technician_id ? `#${m.technician_id}` : '—'}</td>
                <td className="st-td st-td--mono">{m.job_id ? `#${m.job_id}` : '—'}</td>
                <td className="st-td">{m.notes||'—'}</td>
              </tr>))}</tbody>
            </table>
          </div>
        )}
        <div className="st-footer"><span className="st-count">{filtered.length} mouvement(s)</span></div>
      </div>
    </div>
  );
}

// ── COMPOSANT PRINCIPAL ──────────────────────────
export default function StockFTTH({
  userRole,
}) {
  const normalizedUserRole =
    String(userRole ?? '')
      .trim()
      .toUpperCase();
  const canManageCatalog =
    normalizedUserRole === 'ADMIN' ||
    normalizedUserRole ===
      'CHEF_ORIENTEUR';

  const [warehouses, setWarehouses] = useState([]);
  const [teams] = useState([]);
  const [technicians] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [stockLines, setStockLines] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedRowId, setSelectedRowId] = useState(null);
  const [activeAction, setActiveAction] = useState(null);
  const canCatalog =
    canManageCatalog &&
    !loading &&
    !loadError;

  const handleNodeSelect = useCallback((node) => { setSelectedNode(node); setSelectedRowId(null); }, []);
  const handleAction = useCallback((action) => {
    if (
      (
        action === 'add' ||
        action === 'catalog'
      ) &&
      (
        !canManageCatalog ||
        loading ||
        loadError
      )
    ) {
      return;
    }

    setActiveAction(
      (previousAction) =>
        previousAction === action
          ? null
          : action
    );
  }, [
    canManageCatalog,
    loadError,
    loading,
  ]);
  const handleCloseAction = useCallback(() => { setActiveAction(null); }, []);

  const refreshStockResources = useCallback(async (
    isCancelled = () => false,
    preserveExisting = true,
    manageLoading = false
  ) => {
    if (manageLoading) {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const [
        itemsResponse,
        warehousesResponse,
        linesResponse,
      ] = await Promise.all([
        apiClient.get(
          '/api/v1/stock-ftth/items'
        ),
        apiClient.get(
          '/api/v1/stock-ftth/warehouses'
        ),
        apiClient.get(
          '/api/v1/stock-ftth/lines'
        ),
      ]);

      const nextItems =
        Array.isArray(
          itemsResponse?.data
        )
          ? itemsResponse.data
          : [];
      const nextWarehouses =
        Array.isArray(
          warehousesResponse?.data
        )
          ? warehousesResponse.data
          : [];
      const rawLines =
        Array.isArray(
          linesResponse?.data
        )
          ? linesResponse.data
          : [];
      const nextLines = rawLines.map(
        (line) => ({
          ...line,
          itemId:
            line?.itemId ??
            line?.item_id ??
            null,
          warehouseId:
            line?.warehouseId ??
            line?.warehouse_id ??
            null,
          reserved:
            line?.reserved ??
            line?.reserved_quantity ??
            null,
          available:
            line?.available ??
            line?.available_quantity ??
            null,
        })
      );

      if (!isCancelled()) {
        setStockItems(nextItems);
        setWarehouses(nextWarehouses);
        setStockLines(nextLines);
      }
    } catch (error) {
      console.error(
        'Erreur de chargement du stock FTTH',
        error
      );

      if (!isCancelled()) {
        if (!preserveExisting) {
          setWarehouses([]);
          setStockItems([]);
          setStockLines([]);
        }

        setLoadError(
          'Les données stock réelles n’ont pas pu être chargées.'
        );
      }
      throw error;
    } finally {
      if (
        !isCancelled() &&
        manageLoading
      ) {
        setLoading(false);
      }
    }
  }, []);

  const refreshHistory = useCallback(async (
    isCancelled = () => false,
    preserveExisting = true
  ) => {
    try {
      const response = await apiClient.get(
        '/api/v1/stock/history',
        {
          params: {
            page: 1,
            size: 50,
          },
        }
      );
      const nextMovements =
        Array.isArray(
          response?.data?.data
        )
          ? response.data.data
          : [];

      if (!isCancelled()) {
        setMovements(
          nextMovements
        );
      }
    } catch (error) {
      console.error(
        'Erreur de chargement de l’historique stock',
        error
      );

      if (
        !isCancelled() &&
        !preserveExisting
      ) {
        setMovements([]);
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = () =>
      cancelled;

    Promise.all([
      refreshStockResources(
        isCancelled,
        false,
        true
      ),
      refreshHistory(
        isCancelled,
        false
      ),
    ]).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [
    refreshHistory,
    refreshStockResources,
  ]);

  const filteredWarehouseIds = useMemo(() => computeFilteredWarehouseIds(selectedNode, teams, technicians), [selectedNode, teams, technicians]);
  const filteredStockLines = useMemo(() => filterStockLines(stockLines, filteredWarehouseIds), [stockLines, filteredWarehouseIds]);
  const alerts = useMemo(() => computeAlerts(stockLines, stockItems, warehouses), [stockLines, stockItems, warehouses]);
  const receivableWarehouses = useMemo(
    () => (
      Array.isArray(warehouses)
        ? warehouses
        : []
    ).filter((warehouse) => {
      const type =
        normalizeWarehouseType(
          warehouse?.type
        );

      return (
        (
          !type ||
          type === 'ENTREPOT'
        ) &&
        parsePositiveInteger(
          warehouse?.id
        ) !== null
      );
    }),
    [warehouses]
  );
  const receivableItems = useMemo(
    () => (
      Array.isArray(stockItems)
        ? stockItems
        : []
    ).filter(
      (item) =>
        normalizeIdentifier(
          item?.id
        ) !== null &&
        item?.is_active !== false
    ),
    [stockItems]
  );

  const handleReceptionSubmit = useCallback(async (data) => {
    const warehouseId =
      parsePositiveInteger(
        data?.warehouse_id
      );
    const itemId =
      parsePositiveInteger(
        data?.item_id
      );
    const quantity =
      parsePositiveInteger(
        data?.quantity
      );

    if (
      warehouseId === null ||
      !receivableWarehouses.some(
        (warehouse) =>
          normalizeIdentifier(
            warehouse?.id
          ) ===
          normalizeIdentifier(
            warehouseId
          )
      )
    ) {
      throw new Error(
        'Le dépôt sélectionné n’est pas disponible pour une réception.'
      );
    }

    if (
      itemId === null ||
      !receivableItems.some(
        (item) =>
          normalizeIdentifier(
            item?.id
          ) ===
          normalizeIdentifier(
            itemId
          )
      )
    ) {
      throw new Error(
        'L’article sélectionné n’est pas disponible.'
      );
    }

    if (quantity === null) {
      throw new Error(
        'La quantité doit être un entier strictement positif.'
      );
    }

    const normalizedOperator =
      String(data?.operator ?? '')
        .trim();
    const normalizedNotes =
      String(data?.notes ?? '')
        .trim();

    setLoading(true);
    try {
      await apiClient.post(
        '/api/v1/stock-ftth/receptions',
        null,
        {
          params: {
            warehouse_id:
              warehouseId,
            item_id:
              itemId,
            quantity,
            operator:
              normalizedOperator ||
              undefined,
            notes:
              normalizedNotes ||
              undefined,
          },
        }
      );
      await Promise.allSettled([
        refreshStockResources(),
        refreshHistory(),
      ]);
      setActiveAction(null);
    } catch (error) {
      console.error(
        'Erreur lors de la réception de stock',
        error
      );
      const detail =
        error?.response?.data?.detail;
      throw new Error(
        typeof detail === 'string'
          ? detail
          : error instanceof Error
            ? error.message
            : 'La réception n’a pas pu être enregistrée.'
      );
    } finally {
      setLoading(false);
    }
  }, [
    receivableItems,
    receivableWarehouses,
    refreshHistory,
    refreshStockResources,
  ]);

  const handleReturnSubmit = useCallback(async (data) => {
    setLoading(true);
    try { const r = await apiClient.post('/api/v1/stock-ftth/returns', data); if (r.data?.id) await apiClient.post(`/api/v1/stock-ftth/returns/${r.data.id}/validate`); await refreshHistory(); setActiveAction(null); }
    catch (e) { alert('Erreur : ' + (e.response?.data?.detail || e.message)); }
    finally { setLoading(false); }
  }, [refreshHistory]);

  const handleInventorySubmit = useCallback(async (data) => {
    setLoading(true);
    try { await apiClient.post('/api/v1/stock-ftth/inventories', data); await refreshHistory(); setActiveAction(null); }
    catch (e) { alert('Erreur : ' + (e.response?.data?.detail || e.message)); }
    finally { setLoading(false); }
  }, [refreshHistory]);

  const handleAddMaterialSubmit = useCallback(async (data) => {
    if (!canManageCatalog) {
      throw new Error(
        'Vous n’êtes pas autorisé à administrer le catalogue.'
      );
    }

    const payload =
      buildStockItemPayload(data);

    setLoading(true);
    try {
      try {
        await apiClient.post(
          '/api/v1/stock-ftth/items',
          payload
        );
      } catch (error) {
        console.error(
          'Erreur lors de la création de l’article stock',
          error
        );

        const detail =
          error?.response?.data?.detail;
        throw new Error(
          typeof detail === 'string'
            ? detail
            : error instanceof Error
              ? error.message
              : 'L’article n’a pas pu être créé.'
        );
      }

      await Promise.allSettled([
        refreshStockResources(),
      ]);
      setActiveAction(null);
    } finally {
      setLoading(false);
    }
  }, [
    canManageCatalog,
    refreshStockResources,
  ]);

  const performStockItemUpdate =
    useCallback(async (
      itemId,
      payload
    ) => {
      if (!canManageCatalog) {
        throw new Error(
          'Vous n’êtes pas autorisé à administrer le catalogue.'
        );
      }
      if (loading) {
        throw new Error(
          'Une opération est déjà en cours.'
        );
      }
      if (loadError) {
        throw new Error(
          'Le catalogue ne peut pas être modifié tant que les données ne sont pas synchronisées.'
        );
      }

      const normalizedItemId =
        parsePositiveInteger(itemId);
      if (normalizedItemId === null) {
        throw new Error(
          'L’identifiant de l’article est invalide.'
        );
      }

      const itemExists = (
        Array.isArray(stockItems)
          ? stockItems
          : []
      ).some(
        (item) =>
          normalizeIdentifier(
            item?.id
          ) ===
          normalizeIdentifier(
            normalizedItemId
          )
      );
      if (!itemExists) {
        throw new Error(
          'L’article sélectionné n’existe pas dans le catalogue chargé.'
        );
      }

      if (
        !payload ||
        typeof payload !== 'object' ||
        Array.isArray(payload) ||
        Object.keys(payload).length === 0
      ) {
        throw new Error(
          'Aucune modification valide n’a été fournie.'
        );
      }

      setLoading(true);
      try {
        try {
          await apiClient.put(
            `/api/v1/stock-ftth/items/${normalizedItemId}`,
            payload
          );
        } catch (error) {
          console.error(
            'Erreur lors de la modification de l’article stock',
            error
          );

          throw new Error(
            getStockItemApiErrorMessage(
              error,
              'L’article n’a pas pu être modifié.'
            )
          );
        }

        await Promise.allSettled([
          refreshStockResources(),
        ]);
        setActiveAction(null);
      } finally {
        setLoading(false);
      }
    }, [
      canManageCatalog,
      loadError,
      loading,
      refreshStockResources,
      stockItems,
    ]);

  const handleCatalogUpdateSubmit =
    useCallback(async (
      itemId,
      formData
    ) => {
      if (!canManageCatalog) {
        throw new Error(
          'Vous n’êtes pas autorisé à administrer le catalogue.'
        );
      }

      const normalizedItemId =
        parsePositiveInteger(itemId);
      if (normalizedItemId === null) {
        throw new Error(
          'L’identifiant de l’article est invalide.'
        );
      }

      const currentItem = (
        Array.isArray(stockItems)
          ? stockItems
          : []
      ).find(
        (item) =>
          normalizeIdentifier(
            item?.id
          ) ===
          normalizeIdentifier(
            normalizedItemId
          )
      );
      if (!currentItem) {
        throw new Error(
          'L’article sélectionné n’existe pas dans le catalogue chargé.'
        );
      }

      const payload =
        buildStockItemUpdatePayload(
          currentItem,
          formData
        );

      await performStockItemUpdate(
        normalizedItemId,
        payload
      );
    }, [
      canManageCatalog,
      performStockItemUpdate,
      stockItems,
    ]);

  const handleCatalogStatusSubmit =
    useCallback(async (
      itemId,
      nextIsActive
    ) => {
      if (!canManageCatalog) {
        throw new Error(
          'Vous n’êtes pas autorisé à administrer le catalogue.'
        );
      }
      if (
        typeof nextIsActive !== 'boolean'
      ) {
        throw new Error(
          'Le nouveau statut de l’article est invalide.'
        );
      }

      const normalizedItemId =
        parsePositiveInteger(itemId);
      if (normalizedItemId === null) {
        throw new Error(
          'L’identifiant de l’article est invalide.'
        );
      }

      const currentItem = (
        Array.isArray(stockItems)
          ? stockItems
          : []
      ).find(
        (item) =>
          normalizeIdentifier(
            item?.id
          ) ===
          normalizeIdentifier(
            normalizedItemId
          )
      );
      if (!currentItem) {
        throw new Error(
          'L’article sélectionné n’existe pas dans le catalogue chargé.'
        );
      }
      if (
        typeof currentItem.is_active !==
        'boolean'
      ) {
        throw new Error(
          'L’état actuel de l’article est inconnu.'
        );
      }
      if (
        currentItem.is_active ===
        nextIsActive
      ) {
        throw new Error(
          'L’article possède déjà ce statut.'
        );
      }

      await performStockItemUpdate(
        normalizedItemId,
        {
          is_active: nextIsActive,
        }
      );
    }, [
      canManageCatalog,
      performStockItemUpdate,
      stockItems,
    ]);

  const handleExport = useCallback(() => {
    exportFilteredCSV(filteredStockLines, stockItems, warehouses);
  }, [filteredStockLines, stockItems, warehouses]);

  useEffect(() => {
    if (activeAction !== 'export') {
      return;
    }

    handleExport();
    setActiveAction(null);
  }, [
    activeAction,
    handleExport,
  ]);

  return (
    <div className="stock-layout">
      {loadError && (
        <div
          className="stock-error"
          role="alert"
        >
          {loadError}
        </div>
      )}
      {!loadError && <StockKPIs stockLines={stockLines} stockItems={stockItems} warehouses={warehouses} teams={teams} technicians={technicians} />}
      {!loadError && alerts.length > 0 && (
        <div className="stock-alerts-bar">
          <span>🔔</span>
          {alerts.map((a, i) => (<span key={i} className="stock-alert-chip">{a.equipment_type} : {a.current_stock}/{a.min_stock_threshold}</span>))}
        </div>
      )}
      <ActionBar
        onAction={handleAction}
        canManageCatalog={
          canManageCatalog
        }
        canAdd={
          canManageCatalog &&
          !loading &&
          !loadError
        }
        canCatalog={
          canCatalog
        }
        canReceive={
          !loading &&
          !loadError &&
          receivableItems.length > 0 &&
          receivableWarehouses.length > 0
        }
      />
      {!loadError && <div className="stock-body">
        <StockHierarchy warehouses={warehouses} teams={teams} technicians={technicians} stockLines={stockLines} selectedNode={selectedNode} onSelectNode={handleNodeSelect} />
        <div className="stock-content">
          <StockTable
            stockLines={filteredStockLines}
            stockItems={stockItems}
            warehouses={warehouses}
            selectedNode={selectedNode}
            loading={loading}
            selectedRowId={selectedRowId}
            onSelectionChange={
              setSelectedRowId
            }
            onRowClick={(line) => {
              setSelectedRowId(
                line?.id ?? null
              );
            }}
          />
          {activeAction === 'add' && canManageCatalog && <AddMaterialPanel onClose={handleCloseAction} onAddSubmit={handleAddMaterialSubmit} loading={loading} />}
          {activeAction === 'catalog' && canManageCatalog && <CatalogPanel onClose={handleCloseAction} stockItems={stockItems} onUpdateSubmit={handleCatalogUpdateSubmit} onStatusSubmit={handleCatalogStatusSubmit} loading={loading} />}
          {activeAction === 'reception' && <ReceptionPanel onClose={handleCloseAction} warehouses={receivableWarehouses} stockItems={receivableItems} onReceptionSubmit={handleReceptionSubmit} loading={loading} />}
          {activeAction === 'return' && <ReturnPanel onClose={handleCloseAction} warehouses={warehouses} stockItems={stockItems} onReturnSubmit={handleReturnSubmit} loading={loading} />}
          {activeAction === 'inventory' && <InventoryPanel onClose={handleCloseAction} warehouses={warehouses} stockItems={stockItems} onInventorySubmit={handleInventorySubmit} loading={loading} />}
        </div>
      </div>}
      {activeAction === 'history' && <HistoryPanel movements={movements} onClose={handleCloseAction} />}
    </div>
  );
}
