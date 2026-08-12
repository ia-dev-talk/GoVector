import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { stockV3Api } from './stockV3Api';
import {
  errorMessage,
  formatDateTime,
  movementLabel,
  normalizeIdentifier,
  numeric,
  text,
} from './stockUtils';
import './stock-history-panel.css';

const MOVEMENT_TYPES = [
  'RECEPTION',
  'SORTIE',
  'RETOUR',
  'CONSOMMATION',
  'TRANSFERT',
  'INVENTAIRE',
  'MISE_AU_REBUT',
];

function MovementRow({ row, onNavigate }) {
  const jobId = normalizeIdentifier(row?.job_id);
  const technicianId = normalizeIdentifier(row?.technician_id);
  const movementType = text(row?.movement_type).toUpperCase();
  const canNavigate = typeof onNavigate === 'function';

  return (
    <article className="st3-history-row">
      <div className="st3-history-time">
        <strong>{formatDateTime(row?.created_at)}</strong>
        <span>{text(row?.warehouse_name, row?.warehouse_code || 'Dépôt inconnu')}</span>
      </div>

      <div className="st3-history-event">
        <span className={`st3-history-badge st3-history-badge--${movementType.toLowerCase()}`}>
          {movementLabel(movementType)}
        </span>
        <strong>{text(row?.item_label, 'Article')}</strong>
        <small>{text(row?.item_reference, `Article #${row?.item_id ?? '—'}`)}</small>
      </div>

      <div className="st3-history-quantity">
        <strong>{numeric(row?.quantity)}</strong>
        <span>
          {numeric(row?.quantity_before)} → {numeric(row?.quantity_after)}
        </span>
      </div>

      <div className="st3-history-context">
        {technicianId ? (
          canNavigate ? (
            <button
              type="button"
              onClick={() => onNavigate('personnel', { technicianId, from: 'stocks-history' })}
            >
              {text(row?.technician_name, `Technicien #${technicianId}`)}
              {row?.technician_employee_id ? <small>{row.technician_employee_id}</small> : null}
            </button>
          ) : (
            <span>
              {text(row?.technician_name, `Technicien #${technicianId}`)}
              {row?.technician_employee_id ? <small>{row.technician_employee_id}</small> : null}
            </span>
          )
        ) : <span className="st3-history-muted">Aucun technicien</span>}

        {jobId ? (
          canNavigate ? (
            <button
              type="button"
              onClick={() => onNavigate('interventions', { id: Number(jobId) })}
            >
              Intervention {text(row?.job_number, `#${jobId}`)}
              <small>{text(row?.customer_name, row?.service_address || 'Ouvrir la fiche')}</small>
            </button>
          ) : (
            <span>
              Intervention {text(row?.job_number, `#${jobId}`)}
              <small>{text(row?.customer_name, row?.service_address || 'Intervention liée')}</small>
            </span>
          )
        ) : <span className="st3-history-muted">Hors intervention</span>}
      </div>

      <div className="st3-history-note">
        {text(row?.notes, 'Aucune note')}
      </div>
    </article>
  );
}

const StockHistoryPanel = memo(function StockHistoryPanel({
  warehouses: providedWarehouses,
  technicians: providedTechnicians,
  onNavigate,
  onClose,
}) {
  const [rows, setRows] = useState([]);
  const [referenceWarehouses, setReferenceWarehouses] = useState([]);
  const [referenceTechnicians, setReferenceTechnicians] = useState([]);
  const [search, setSearch] = useState('');
  const [movementType, setMovementType] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  const warehouses = Array.isArray(providedWarehouses) && providedWarehouses.length
    ? providedWarehouses
    : referenceWarehouses;
  const technicians = Array.isArray(providedTechnicians) && providedTechnicians.length
    ? providedTechnicians
    : referenceTechnicians;

  const params = useMemo(() => ({
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(movementType ? { movement_type: movementType } : {}),
    ...(warehouseId ? { warehouse_id: Number(warehouseId) } : {}),
    ...(technicianId ? { technician_id: Number(technicianId) } : {}),
    limit: 500,
  }), [movementType, search, technicianId, warehouseId]);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError('');
    try {
      const response = await stockV3Api.getHistory(params);
      if (requestId !== requestRef.current) return;
      setRows(Array.isArray(response?.data) ? response.data : []);
    } catch (loadError) {
      if (requestId !== requestRef.current) return;
      setError(errorMessage(loadError, 'Impossible de charger l’historique du stock.'));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    if (
      Array.isArray(providedWarehouses) && providedWarehouses.length &&
      Array.isArray(providedTechnicians) && providedTechnicians.length
    ) return undefined;

    let cancelled = false;
    Promise.allSettled([
      stockV3Api.getWarehouses(),
      stockV3Api.getTechnicians(),
    ]).then(([warehousesResult, techniciansResult]) => {
      if (cancelled) return;
      if (warehousesResult.status === 'fulfilled') {
        setReferenceWarehouses(Array.isArray(warehousesResult.value?.data) ? warehousesResult.value.data : []);
      }
      if (techniciansResult.status === 'fulfilled') {
        setReferenceTechnicians(Array.isArray(techniciansResult.value?.data) ? techniciansResult.value.data : []);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [providedTechnicians, providedWarehouses]);

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  useEffect(() => () => {
    requestRef.current += 1;
  }, []);

  return (
    <div className="st3-history-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <section className="st3-history-panel" role="dialog" aria-modal="true" aria-label="Historique du stock">
        <header className="st3-history-header">
          <div>
            <span>Traçabilité logistique</span>
            <h2>Historique du stock</h2>
            <p>Chaque réception, dotation, consommation, retour et ajustement avec son contexte métier.</p>
          </div>
          <button type="button" className="st3-icon-button" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="st3-history-filters">
          <label>
            <span>Rechercher</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Article, technicien, client, intervention, note…"
            />
          </label>
          <label>
            <span>Mouvement</span>
            <select value={movementType} onChange={(event) => setMovementType(event.target.value)}>
              <option value="">Tous</option>
              {MOVEMENT_TYPES.map((value) => <option key={value} value={value}>{movementLabel(value)}</option>)}
            </select>
          </label>
          <label>
            <span>Dépôt / garde</span>
            <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
              <option value="">Tous</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>{warehouse.name} · {warehouse.code}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Technicien</span>
            <select value={technicianId} onChange={(event) => setTechnicianId(event.target.value)}>
              <option value="">Tous</option>
              {technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>{technician.name} · {technician.employee_id || technician.id}</option>
              ))}
            </select>
          </label>
          <button type="button" className="st3-secondary-button" onClick={load} disabled={loading}>
            {loading ? 'Actualisation…' : 'Actualiser'}
          </button>
        </div>

        <div className="st3-history-summary">
          <strong>{rows.length}</strong>
          <span>mouvement{rows.length !== 1 ? 's' : ''} affiché{rows.length !== 1 ? 's' : ''}</span>
          <small>Journal serveur immuable · jusqu’à 500 lignes</small>
        </div>

        {error ? <div className="st3-notice" role="alert"><span>{error}</span><button type="button" onClick={load}>Réessayer</button></div> : null}

        <div className="st3-history-list">
          {!loading && rows.length === 0 ? (
            <div className="st3-history-empty">Aucun mouvement ne correspond à ces filtres.</div>
          ) : null}
          {rows.map((row) => <MovementRow key={row.id} row={row} onNavigate={onNavigate} />)}
        </div>
      </section>
    </div>
  );
});

export default StockHistoryPanel;
