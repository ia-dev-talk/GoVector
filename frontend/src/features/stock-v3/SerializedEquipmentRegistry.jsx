import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { apiClient } from '../../api/client';
import {
  errorMessage,
  normalizeSearch,
  text,
} from './stockUtils';
import './serialized-equipment-registry.css';

const EMPTY_FORM = Object.freeze({
  serial_number: '',
  mac_address: '',
  operator: '',
  equipment_type: '',
  model: '',
  status: 'STOCK',
  warehouse: '',
  vehicle: '',
  assigned_job_id: '',
  min_stock_threshold: '5',
  alert_enabled: true,
});

const STATUSES = [
  ['STOCK', 'En stock'],
  ['ASSIGNED', 'Affecté'],
  ['IN_USE', 'En utilisation'],
  ['RETURNED', 'Retourné'],
  ['FAULTY', 'Défectueux'],
];

function asRows(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeForm(item) {
  if (!item) return { ...EMPTY_FORM };
  return {
    serial_number: text(item.serial_number),
    mac_address: text(item.mac_address),
    operator: text(item.operator),
    equipment_type: text(item.equipment_type),
    model: text(item.model),
    status: text(item.status, 'STOCK'),
    warehouse: text(item.warehouse),
    vehicle: text(item.vehicle),
    assigned_job_id: item.assigned_job_id == null ? '' : String(item.assigned_job_id),
    min_stock_threshold: String(item.min_stock_threshold ?? 5),
    alert_enabled: item.alert_enabled !== false,
  };
}

function buildDocument(form) {
  const serial = text(form.serial_number);
  const operator = text(form.operator);
  const equipmentType = text(form.equipment_type);
  if (!serial) throw new Error('Le numéro de série est obligatoire.');
  if (!operator) throw new Error('L’opérateur est obligatoire.');
  if (!equipmentType) throw new Error('Le type d’équipement est obligatoire.');

  const threshold = Number(form.min_stock_threshold);
  if (!Number.isInteger(threshold) || threshold < 0) {
    throw new Error('Le seuil doit être un entier positif ou nul.');
  }
  const assignedJob = text(form.assigned_job_id);
  const parsedJob = assignedJob ? Number(assignedJob) : null;
  if (assignedJob && (!Number.isInteger(parsedJob) || parsedJob <= 0)) {
    throw new Error('L’identifiant d’intervention est invalide.');
  }

  return {
    serial_number: serial,
    mac_address: text(form.mac_address) || null,
    operator,
    equipment_type: equipmentType,
    model: text(form.model) || null,
    status: text(form.status, 'STOCK'),
    warehouse: text(form.warehouse) || null,
    vehicle: text(form.vehicle) || null,
    assigned_job_id: parsedJob,
    min_stock_threshold: threshold,
    alert_enabled: form.alert_enabled !== false,
  };
}

function RegistryField({ label, children, wide = false }) {
  return (
    <label className={wide ? 'ser-reg-field ser-reg-field--wide' : 'ser-reg-field'}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function SerializedEquipmentRegistry({ onClose }) {
  const [rows, setRows] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [registryResult, warehouseResult, catalogResult] = await Promise.allSettled([
      apiClient.get('/stock'),
      apiClient.get('/stock-ftth/warehouses'),
      apiClient.get('/stock-ftth/items'),
    ]);
    if (registryResult.status === 'fulfilled') {
      setRows(asRows(registryResult.value?.data));
    } else {
      setError(errorMessage(registryResult.reason, 'Registre sérialisé indisponible.'));
    }
    if (warehouseResult.status === 'fulfilled') {
      setWarehouses(asRows(warehouseResult.value?.data));
    }
    if (catalogResult.status === 'fulfilled') {
      setCatalog(asRows(catalogResult.value?.data));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => rows.find((item) => Number(item?.id) === Number(selectedId)) ?? null,
    [rows, selectedId],
  );

  const visibleRows = useMemo(() => {
    const normalized = normalizeSearch(query);
    if (!normalized) return rows;
    return rows.filter((item) =>
      [
        item.serial_number,
        item.mac_address,
        item.operator,
        item.equipment_type,
        item.model,
        item.status,
        item.warehouse,
        item.vehicle,
        item.assigned_job_id,
      ].some((value) => normalizeSearch(value).includes(normalized)),
    );
  }, [query, rows]);

  const suggestions = useMemo(() => ({
    operators: [...new Set(catalog.map((item) => text(item?.operator)).filter(Boolean))].sort(),
    types: [...new Set(catalog.map((item) => text(item?.equipment_type)).filter(Boolean))].sort(),
    models: [...new Set(catalog.map((item) => text(item?.model)).filter(Boolean))].sort(),
  }), [catalog]);

  const selectItem = (item) => {
    setSelectedId(item.id);
    setForm(normalizeForm(item));
    setError('');
  };

  const newItem = () => {
    setSelectedId(null);
    setForm({ ...EMPTY_FORM });
    setError('');
  };

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const document = buildDocument(form);
      const response = selected
        ? await apiClient.put(`/stock/${selected.id}`, document)
        : await apiClient.post('/stock', document);
      const saved = response?.data;
      await load();
      if (saved?.id) {
        setSelectedId(saved.id);
        setForm(normalizeForm(saved));
      }
    } catch (saveError) {
      setError(errorMessage(saveError, 'Impossible d’enregistrer l’équipement.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected || saving) return;
    if (!window.confirm(`Supprimer le SN ${selected.serial_number} du registre ?`)) return;
    setSaving(true);
    setError('');
    try {
      await apiClient.delete(`/stock/${selected.id}`);
      setSelectedId(null);
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (removeError) {
      setError(errorMessage(removeError, 'Impossible de supprimer l’équipement.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ser-reg-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className="ser-reg-modal" role="dialog" aria-modal="true" aria-label="Registre SN et MAC">
        <header className="ser-reg-header">
          <div>
            <span>Source de vérité scanner</span>
            <h2>Registre SN / MAC</h2>
            <p>Équipements sérialisés reconnus par l’application technicien.</p>
          </div>
          <div className="ser-reg-header-actions">
            <button type="button" onClick={newItem}>+ Nouvel équipement</button>
            <button type="button" onClick={load} disabled={loading}>Actualiser</button>
            <button type="button" className="ser-reg-close" onClick={onClose} aria-label="Fermer">×</button>
          </div>
        </header>

        {error ? <div className="ser-reg-error" role="alert">{error}</div> : null}

        <div className="ser-reg-layout">
          <aside className="ser-reg-list-panel">
            <label className="ser-reg-search">
              <span>Rechercher</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="SN, MAC, opérateur, modèle…"
              />
            </label>
            <div className="ser-reg-count">
              <strong>{visibleRows.length}</strong>
              <span>sur {rows.length} équipements</span>
            </div>
            <div className="ser-reg-list">
              {loading && rows.length === 0 ? (
                <div className="ser-reg-empty">Chargement du registre…</div>
              ) : visibleRows.length === 0 ? (
                <div className="ser-reg-empty">Aucun équipement sérialisé.</div>
              ) : visibleRows.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={Number(selectedId) === Number(item.id) ? 'ser-reg-row is-active' : 'ser-reg-row'}
                  onClick={() => selectItem(item)}
                >
                  <span className="ser-reg-row-main">
                    <strong>{item.serial_number}</strong>
                    <small>{[item.equipment_type, item.model, item.operator].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className={`ser-reg-status ser-reg-status--${text(item.status, 'stock').toLowerCase()}`}>
                    {text(item.status, 'STOCK')}
                  </span>
                  <span className="ser-reg-row-location">
                    {text(item.warehouse) || text(item.vehicle) || 'Emplacement non défini'}
                  </span>
                </button>
              ))}
            </div>
          </aside>

          <main className="ser-reg-editor">
            <div className="ser-reg-editor-title">
              <div>
                <span>{selected ? `Équipement #${selected.id}` : 'Nouvel équipement'}</span>
                <strong>{text(form.serial_number, 'Numéro de série à renseigner')}</strong>
              </div>
              {selected?.assigned_job_id ? (
                <span className="ser-reg-job-link">Intervention #{selected.assigned_job_id}</span>
              ) : null}
            </div>

            <div className="ser-reg-form">
              <RegistryField label="Numéro de série" wide>
                <input value={form.serial_number} onChange={(event) => update('serial_number', event.target.value)} placeholder="SN imprimé / QR" />
              </RegistryField>
              <RegistryField label="MAC address">
                <input value={form.mac_address} onChange={(event) => update('mac_address', event.target.value)} placeholder="AA:BB:CC:DD:EE:FF" />
              </RegistryField>
              <RegistryField label="Opérateur">
                <input list="ser-reg-operators" value={form.operator} onChange={(event) => update('operator', event.target.value)} placeholder="ORANGE" />
              </RegistryField>
              <RegistryField label="Type">
                <input list="ser-reg-types" value={form.equipment_type} onChange={(event) => update('equipment_type', event.target.value)} placeholder="ROUTEUR / ONT…" />
              </RegistryField>
              <RegistryField label="Modèle">
                <input list="ser-reg-models" value={form.model} onChange={(event) => update('model', event.target.value)} placeholder="HG8245…" />
              </RegistryField>
              <RegistryField label="Statut">
                <select value={form.status} onChange={(event) => update('status', event.target.value)}>
                  {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </RegistryField>
              <RegistryField label="Emplacement GoVector" wide>
                <select value={form.warehouse} onChange={(event) => update('warehouse', event.target.value)}>
                  <option value="">Aucun emplacement</option>
                  {warehouses.map((warehouse) => {
                    const value = text(warehouse.code) || text(warehouse.name);
                    return (
                      <option key={warehouse.id} value={value}>
                        {text(warehouse.name, value)}{warehouse.code ? ` · ${warehouse.code}` : ''}
                      </option>
                    );
                  })}
                </select>
                <small>Les gardes techniciens utilisent le code TECH-x, reconnu automatiquement par le scanner.</small>
              </RegistryField>
              <RegistryField label="Véhicule">
                <input value={form.vehicle} onChange={(event) => update('vehicle', event.target.value)} placeholder="Immatriculation / code" />
              </RegistryField>
              <RegistryField label="Intervention liée">
                <input type="number" min="1" value={form.assigned_job_id} onChange={(event) => update('assigned_job_id', event.target.value)} placeholder="ID optionnel" />
              </RegistryField>
              <RegistryField label="Seuil d’alerte">
                <input type="number" min="0" value={form.min_stock_threshold} onChange={(event) => update('min_stock_threshold', event.target.value)} />
              </RegistryField>
              <RegistryField label="Alertes">
                <label className="ser-reg-checkbox">
                  <input type="checkbox" checked={form.alert_enabled} onChange={(event) => update('alert_enabled', event.target.checked)} />
                  <span>Actives</span>
                </label>
              </RegistryField>
            </div>

            <datalist id="ser-reg-operators">{suggestions.operators.map((value) => <option key={value} value={value} />)}</datalist>
            <datalist id="ser-reg-types">{suggestions.types.map((value) => <option key={value} value={value} />)}</datalist>
            <datalist id="ser-reg-models">{suggestions.models.map((value) => <option key={value} value={value} />)}</datalist>

            <footer className="ser-reg-footer">
              <div>
                {selected ? (
                  <button type="button" className="ser-reg-danger" onClick={remove} disabled={saving}>
                    Supprimer
                  </button>
                ) : null}
              </div>
              <div>
                <button type="button" onClick={onClose} disabled={saving}>Fermer</button>
                <button type="button" className="ser-reg-save" onClick={save} disabled={saving}>
                  {saving ? 'Enregistrement…' : selected ? 'Enregistrer les modifications' : 'Créer l’équipement'}
                </button>
              </div>
            </footer>
          </main>
        </div>
      </section>
    </div>
  );
}
