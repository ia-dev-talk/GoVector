import {
  memo,
  useState,
} from 'react';
import {
  CloseIcon,
  WarehouseIcon,
} from './StockIcons';
import { text } from './stockUtils';


const INITIAL_FORM = Object.freeze({
  name: '',
  code: '',
  type_: 'ENTREPOT',
  address: '',
  city: 'Casablanca',
  description: '',
  is_active: true,
});


function normalizeCode(value) {
  return text(value)
    .toLocaleUpperCase('fr')
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}


function initialForm(warehouse) {
  if (!warehouse) return { ...INITIAL_FORM };
  return {
    name: text(warehouse?.name),
    code: normalizeCode(warehouse?.code),
    type_: text(warehouse?.type ?? warehouse?.type_, 'ENTREPOT'),
    address: text(warehouse?.address),
    city: text(warehouse?.city, 'Casablanca'),
    description: text(warehouse?.description),
    is_active: warehouse?.is_active !== false,
  };
}


const WarehouseEditorModal = memo(function WarehouseEditorModal({
  warehouse = null,
  saving,
  error,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState(() => initialForm(warehouse));
  const [localError, setLocalError] = useState('');
  const editing = Boolean(warehouse?.id);

  const update = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const submit = () => {
    const name = text(form.name);
    const code = normalizeCode(form.code);
    const type = text(form.type_);

    if (!name) {
      setLocalError('Le nom du dépôt est obligatoire.');
      return;
    }

    if (!code) {
      setLocalError('Le code du dépôt est obligatoire.');
      return;
    }

    if (!type) {
      setLocalError('Le type de dépôt est obligatoire.');
      return;
    }

    setLocalError('');
    onSave({
      name,
      code,
      type_: type,
      address: text(form.address) || null,
      city: text(form.city) || null,
      description: text(form.description) || null,
      is_active: form.is_active !== false,
    });
  };

  return (
    <div
      className="st3-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="st3-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="st3-warehouse-title"
      >
        <header>
          <span className="st3-modal-icon"><WarehouseIcon /></span>
          <div>
            <span>Implantations logistiques</span>
            <strong id="st3-warehouse-title">
              {editing ? 'Modifier le dépôt' : 'Créer un dépôt'}
            </strong>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer">
            <CloseIcon />
          </button>
        </header>

        <div className="st3-modal-body st3-form-grid">
          <label className="st3-field-wide">
            <span>Nom du dépôt</span>
            <input
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="Ex. Dépôt Sidi Maarouf"
              autoFocus
            />
          </label>

          <label>
            <span>Code</span>
            <input
              value={form.code}
              onChange={(event) => update('code', normalizeCode(event.target.value))}
              placeholder="CAS-SM-01"
            />
          </label>

          <label>
            <span>Type</span>
            <select value={form.type_} onChange={(event) => update('type_', event.target.value)}>
              <option value="ENTREPOT">Entrepôt</option>
              <option value="DEPOT">Dépôt</option>
              <option value="VEHICULE">Véhicule</option>
              <option value="TECHNICIEN">Stock technicien</option>
            </select>
          </label>

          <label>
            <span>Ville</span>
            <input value={form.city} onChange={(event) => update('city', event.target.value)} />
          </label>

          <label>
            <span>Adresse</span>
            <input value={form.address} onChange={(event) => update('address', event.target.value)} />
          </label>

          <label className="st3-field-wide">
            <span>Description</span>
            <textarea rows={3} value={form.description} onChange={(event) => update('description', event.target.value)} />
          </label>

          <label className="st3-switch-field st3-field-wide">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => update('is_active', event.target.checked)}
            />
            <span>Dépôt actif</span>
          </label>

          {(localError || error) && (
            <div className="st3-form-error st3-field-wide">{localError || error}</div>
          )}
        </div>

        <footer>
          <button type="button" className="st3-secondary-button" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button type="button" className="st3-primary-button" onClick={submit} disabled={saving}>
            {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer le dépôt'}
          </button>
        </footer>
      </section>
    </div>
  );
});


export default WarehouseEditorModal;
