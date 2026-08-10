import React, { useState, useMemo, useCallback } from 'react';

// ──────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────

function validateForm(values) {
  const errors = {};

  if (!values.sourceWarehouseId) {
    errors.sourceWarehouseId = 'Le dépôt source est obligatoire';
  }
  if (!values.destinationType) {
    errors.destinationType = 'Choisissez équipe ou technicien';
  }
  if (!values.destinationId) {
    errors.destinationId = 'La destination est obligatoire';
  }
  if (!values.itemId) {
    errors.itemId = "L'article est obligatoire";
  }
  if (!values.quantity || values.quantity < 1) {
    errors.quantity = 'La quantité doit être au moins 1';
  }
  if (values.quantity > 0 && values.sourceWarehouseId && values.itemId) {
    // Vérification stock disponible (non bloquante)
  }

  return errors;
}

function buildSummary(values, warehouses, stockItems, teams, technicians) {
  const source = warehouses.find(w => w.id === Number(values.sourceWarehouseId));
  const item = stockItems.find(i => i.id === Number(values.itemId));
  let destination = null;

  if (values.destinationType === 'team') {
    destination = teams.find(t => t.id === Number(values.destinationId));
  } else if (values.destinationType === 'technician') {
    destination = technicians.find(t => t.id === Number(values.destinationId));
  }

  return {
    sourceLabel: source?.name || '—',
    itemLabel: item ? `${item.reference} — ${item.label}` : '—',
    destinationLabel: destination?.name || '—',
    quantity: values.quantity,
    notes: values.notes || '(aucune)',
  };
}

// ──────────────────────────────────────────────────────────
// Composant : DestinationSelector
// ──────────────────────────────────────────────────────────

const DestinationSelector = React.memo(function DestinationSelector({
  destinationType,
  onTypeChange,
  destinationId,
  onIdChange,
  teams,
  technicians,
  errors,
  selectedNode,
}) {
  const candidates = useMemo(() => {
    if (!selectedNode) return { teams: [], technicians: [] };

    // Si on est sur une équipe, proposer ses techniciens
    if (selectedNode.type === 'equipe') {
      return {
        teams: [],
        technicians: technicians.filter(t => t.teamId === selectedNode.orienteurId),
      };
    }

    // Si on est sur le dépôt, proposer toutes les équipes
    return { teams, technicians: [] };
  }, [selectedNode, teams, technicians]);

  return (
    <div className="af-section">
      <div className="af-section-title">2. Destination</div>
      <div className="af-radio-group">
        <label className="af-radio">
          <input
            type="radio"
            checked={destinationType === 'team'}
            onChange={() => { onTypeChange('team'); onIdChange(''); }}
          />
          <span>Équipe</span>
        </label>
        <label className="af-radio">
          <input
            type="radio"
            checked={destinationType === 'technician'}
            onChange={() => { onTypeChange('technician'); onIdChange(''); }}
          />
          <span>Technicien</span>
        </label>
      </div>
      {errors.destinationType && <span className="af-error">{errors.destinationType}</span>}

      {destinationType === 'team' && (
        <select
          className="af-select"
          value={destinationId}
          onChange={e => onIdChange(e.target.value)}
        >
          <option value="">Sélectionner une équipe</option>
          {(candidates.teams.length > 0 ? candidates.teams : teams).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}

      {destinationType === 'technician' && (
        <select
          className="af-select"
          value={destinationId}
          onChange={e => onIdChange(e.target.value)}
        >
          <option value="">Sélectionner un technicien</option>
          {(candidates.technicians.length > 0 ? candidates.technicians : technicians).map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      )}
      {errors.destinationId && <span className="af-error">{errors.destinationId}</span>}
    </div>
  );
});

// ──────────────────────────────────────────────────────────
// Composant principal
// ──────────────────────────────────────────────────────────

const StockAllocationPanel = React.memo(function StockAllocationPanel({
  warehouses = [],
  teams = [],
  technicians = [],
  stockItems = [],
  selectedNode,
  onSubmit,
  onCancel,
  loading = false,
}) {
  // ── État du formulaire ────────────────────────────
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationType, setDestinationType] = useState('team');
  const [destinationId, setDestinationId] = useState('');
  const [itemId, setItemId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});

  // ── Résumé ────────────────────────────────────────
  const summary = useMemo(
    () => buildSummary(
      { sourceWarehouseId, destinationType, destinationId, itemId, quantity: Number(quantity), notes },
      warehouses, stockItems, teams, technicians
    ),
    [sourceWarehouseId, destinationType, destinationId, itemId, quantity, notes, warehouses, stockItems, teams, technicians]
  );

  // ── Dépôts sources filtrés (ENTREPOT uniquement) ──
  const sourceWarehouses = useMemo(
    () => warehouses.filter(w => w.type === 'ENTREPOT'),
    [warehouses]
  );

  // ── Handler de soumission ─────────────────────────
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    const values = { sourceWarehouseId, destinationType, destinationId, itemId, quantity: Number(quantity), notes };
    const validationErrors = validateForm(values);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});

    const formData = {
      sourceWarehouseId: Number(sourceWarehouseId),
      destinationType,
      destinationId: Number(destinationId),
      itemId: Number(itemId),
      quantity: Number(quantity),
      notes: notes.trim() || null,
    };

    onSubmit(formData);
  }, [sourceWarehouseId, destinationType, destinationId, itemId, quantity, notes, onSubmit]);

  // ── Stock disponible pour l'article sélectionné ────
  const availableStock = useMemo(() => {
    if (!sourceWarehouseId || !itemId) return null;
    // Simulé — sera remplacé par un vrai calcul quand les données seront connectées
    return null;
  }, [sourceWarehouseId, itemId]);

  // ── Render ────────────────────────────────────────
  return (
    <div className="stock-action-panel">
      <div className="stock-action-panel-header">
        <strong>📤 Attribuer du stock</strong>
        <button className="stock-action-close" onClick={onCancel} disabled={loading}>✕</button>
      </div>

      <form className="stock-action-panel-body" onSubmit={handleSubmit} noValidate>
        {/* Origine */}
        <div className="af-section">
          <div className="af-section-title">1. Origine</div>
          <select
            className="af-select"
            value={sourceWarehouseId}
            onChange={e => setSourceWarehouseId(e.target.value)}
          >
            <option value="">Dépôt source</option>
            {sourceWarehouses.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          {errors.sourceWarehouseId && <span className="af-error">{errors.sourceWarehouseId}</span>}
        </div>

        {/* Destination */}
        <DestinationSelector
          destinationType={destinationType}
          onTypeChange={setDestinationType}
          destinationId={destinationId}
          onIdChange={setDestinationId}
          teams={teams}
          technicians={technicians}
          errors={errors}
          selectedNode={selectedNode}
        />

        {/* Article */}
        <div className="af-section">
          <div className="af-section-title">3. Article</div>
          <select
            className="af-select"
            value={itemId}
            onChange={e => setItemId(e.target.value)}
          >
            <option value="">Sélectionner un article</option>
            {stockItems.map(i => (
              <option key={i.id} value={i.id}>
                {i.reference} — {i.label}
              </option>
            ))}
          </select>
          {errors.itemId && <span className="af-error">{errors.itemId}</span>}
          {availableStock !== null && (
            <span className="af-hint">Disponible : {availableStock}</span>
          )}
        </div>

        {/* Quantité */}
        <div className="af-section">
          <div className="af-section-title">4. Quantité</div>
          <input
            className="af-input"
            type="number"
            min="1"
            value={quantity}
            onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
          />
          {errors.quantity && <span className="af-error">{errors.quantity}</span>}
        </div>

        {/* Notes */}
        <div className="af-section">
          <div className="af-section-title">5. Notes (optionnel)</div>
          <textarea
            className="af-textarea"
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Motif, référence, information complémentaire…"
          />
        </div>

        {/* Résumé */}
        <div className="af-summary">
          <div className="af-section-title">Résumé</div>
          <div className="af-summary-grid">
            <span className="af-summary-label">Origine</span>
            <span className="af-summary-value">{summary.sourceLabel}</span>
            <span className="af-summary-label">Destination</span>
            <span className="af-summary-value">{summary.destinationLabel}</span>
            <span className="af-summary-label">Article</span>
            <span className="af-summary-value">{summary.itemLabel}</span>
            <span className="af-summary-label">Quantité</span>
            <span className="af-summary-value">{summary.quantity}</span>
            <span className="af-summary-label">Notes</span>
            <span className="af-summary-value">{summary.notes}</span>
          </div>
        </div>

        {/* Boutons */}
        <div className="af-actions">
          <button type="button" className="af-btn-cancel" onClick={onCancel} disabled={loading}>
            Annuler
          </button>
          <button type="submit" className="af-btn-submit" disabled={loading}>
            {loading ? 'Attribution en cours…' : 'Attribuer le stock'}
          </button>
        </div>
      </form>
    </div>
  );
});

export default StockAllocationPanel;
