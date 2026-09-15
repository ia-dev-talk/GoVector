import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api, apiClient } from '../../api/client';
import territoryApi from './territoryApi';
import './territory-workspace-v2.css';

const KINDS = {
  REGION: 'Région',
  ZONE: 'Zone',
  SECTOR: 'Secteur',
  SUBSECTOR: 'Sous-secteur',
  MICROZONE: 'Micro-zone',
};

function readableName(value) {
  const raw = String(value ?? '').trim();
  if (!raw || ['nan', 'none', 'null', 'n/a', 'na'].includes(raw.toLowerCase())) return false;
  if (/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(raw)) return false;
  return /[A-Za-zÀ-ÿ]/.test(raw);
}

function errorText(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  return error?.message || fallback;
}

function buildRows(nodes) {
  const children = new Map();
  nodes.forEach((node) => {
    const key = node.parent_id ?? null;
    children.set(key, [...(children.get(key) || []), node]);
  });
  const rows = [];
  const seen = new Set();
  const visit = (parent, depth) => {
    (children.get(parent) || []).forEach((node) => {
      if (seen.has(node.id)) return;
      seen.add(node.id);
      rows.push({ ...node, depth });
      visit(node.id, depth + 1);
    });
  };
  visit(null, 0);
  nodes.forEach((node) => {
    if (!seen.has(node.id)) rows.push({ ...node, depth: 0 });
  });
  return rows;
}

export default function TerritoryWorkspaceV2({ canManage = false, legacySectors = null, toast }) {
  const [nodes, setNodes] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [draftName, setDraftName] = useState('');
  const [draftKind, setDraftKind] = useState('SECTOR');
  const qgisRef = useRef(null);

  const notify = useCallback((value, type = 'info') => {
    setNotice(value);
    toast?.(value, type);
  }, [toast]);

  const load = useCallback(async () => {
    setError('');
    const [territoryResult, sectorResult] = await Promise.allSettled([
      territoryApi.list({ includeInactive: true }),
      legacySectors === null ? api.getSectors({ limit: 500 }) : Promise.resolve({ data: legacySectors }),
    ]);
    if (territoryResult.status === 'fulfilled') {
      setNodes(Array.isArray(territoryResult.value?.data) ? territoryResult.value.data : []);
    } else {
      setError(errorText(territoryResult.reason, 'Impossible de charger les territoires.'));
    }
    if (sectorResult.status === 'fulfilled') {
      const data = sectorResult.value?.data;
      setSectors(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
    }
  }, [legacySectors]);

  useEffect(() => { load(); }, [load]);

  const validNodes = useMemo(() => nodes.filter((node) => readableName(node.name)), [nodes]);
  const invalidCount = nodes.length - validNodes.length;
  const rows = useMemo(() => buildRows(validNodes), [validNodes]);
  const selected = useMemo(
    () => validNodes.find((node) => Number(node.id) === Number(selectedId)) || null,
    [selectedId, validNodes],
  );
  const linkedSector = useMemo(
    () => sectors.find((sector) => Number(sector.id) === Number(selected?.legacy_sector_id)) || null,
    [sectors, selected?.legacy_sector_id],
  );
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr');
    return rows.filter((node) => {
      if (!showInactive && node.is_active === false) return false;
      if (!query) return true;
      return [node.name, node.code, node.source, KINDS[node.kind]]
        .filter(Boolean)
        .some((item) => String(item).toLocaleLowerCase('fr').includes(query));
    });
  }, [rows, search, showInactive]);

  const summary = useMemo(() => ({
    total: validNodes.length,
    geometry: validNodes.filter((node) => node.geometry_geojson).length,
    linked: validNodes.filter((node) => node.legacy_sector_id).length,
    inactive: validNodes.filter((node) => node.is_active === false).length,
  }), [validNodes]);

  const repair = async () => {
    setBusy(true);
    try {
      const response = await apiClient.post(
        '/territories/sector-tools/repair-links?create_missing_sectors=true',
      );
      await load();
      const data = response.data || {};
      notify(
        `Référentiel réparé · ${data.linked || 0} liaison(s), ${data.created_sectors || 0} secteur(s) créé(s).`,
        'success',
      );
    } catch (actionError) {
      notify(errorText(actionError, 'Réparation impossible.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const ensureSector = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const response = await apiClient.post(
        `/territories/sector-tools/territories/${selected.id}/ensure-sector`,
      );
      await load();
      notify(`Secteur opérationnel « ${response.data?.sector_name || selected.name} » prêt.`, 'success');
    } catch (actionError) {
      notify(errorText(actionError, 'Impossible de créer/lier le secteur.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const importQgis = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('create_missing_sectors', 'true');
      const response = await apiClient.post('/territories/sector-tools/import-qgis', form);
      await load();
      const data = response.data || {};
      notify(
        `Import SIG terminé · ${data.created || 0} territoire(s), ${data.linked || 0} lié(s), ${data.skipped?.length || 0} ignoré(s).`,
        'success',
      );
    } catch (actionError) {
      notify(errorText(actionError, 'Import QGIS/QField impossible.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const createTerritory = async () => {
    if (!draftName.trim()) return;
    setBusy(true);
    try {
      const response = await territoryApi.create({
        name: draftName.trim(),
        kind: draftKind,
        parent_id: null,
        color: '#4f8cff',
        source: 'manual',
      });
      setDraftName('');
      setSelectedId(response.data?.id || null);
      await load();
      notify('Territoire créé. Vous pouvez maintenant le lier au secteur métier.', 'success');
    } catch (actionError) {
      notify(errorText(actionError, 'Création du territoire impossible.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="territory-v2">
      <header className="territory-v2__header">
        <div>
          <span>GÉOGRAPHIE · QGIS / QFIELD</span>
          <h2>Territoires et secteurs opérationnels</h2>
          <p>Un territoire SIG n’est utilisable pour l’affectation que lorsqu’il est relié à un vrai secteur métier.</p>
        </div>
        <div className="territory-v2__actions">
          {canManage && (
            <>
              <input
                ref={qgisRef}
                hidden
                type="file"
                accept=".rar,.qgz,.qgs,.geojson,.json,.kml,.kmz,application/geo+json,application/json"
                onChange={importQgis}
              />
              <button type="button" onClick={() => qgisRef.current?.click()} disabled={busy}>Importer QGIS/QField</button>
              <button type="button" onClick={repair} disabled={busy}>Réparer les liaisons</button>
            </>
          )}
        </div>
      </header>

      <div className="territory-v2__stats">
        <span><strong>{summary.total}</strong> territoires valides</span>
        <span><strong>{summary.geometry}</strong> géométries</span>
        <span><strong>{summary.linked}</strong> liés au métier</span>
        <span><strong>{summary.inactive}</strong> inactifs</span>
        {invalidCount > 0 && <span className="is-warning"><strong>{invalidCount}</strong> libellés QGIS invalides masqués</span>}
      </div>

      <div className="territory-v2__filters">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher secteur, zone, commune…" />
        <label><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Afficher les inactifs</label>
      </div>

      {notice && <div className="territory-v2__notice">{notice}</div>}
      {error && <div className="territory-v2__error">{error}</div>}

      <div className="territory-v2__body">
        <div className="territory-v2__list">
          {filtered.length === 0 ? (
            <div className="territory-v2__empty">Aucun territoire exploitable. Importez un QGIS/GeoJSON ou créez un territoire.</div>
          ) : filtered.map((node) => (
            <button
              type="button"
              key={node.id}
              className={Number(selectedId) === Number(node.id) ? 'is-selected' : ''}
              style={{ '--depth': node.depth || 0 }}
              onClick={() => setSelectedId(node.id)}
            >
              <i style={{ background: node.color || '#5b8def' }} />
              <span><strong>{node.name}</strong><small>{KINDS[node.kind] || node.kind}{node.legacy_sector_id ? ' · lié' : ' · à lier'}</small></span>
              <em>{node.child_count || 0}</em>
            </button>
          ))}
        </div>

        <aside className="territory-v2__inspector">
          {selected ? (
            <>
              <span className="territory-v2__eyebrow">{KINDS[selected.kind] || selected.kind}</span>
              <h3>{selected.name}</h3>
              <dl>
                <div><dt>Source</dt><dd>{selected.source || '—'}</dd></div>
                <div><dt>Code</dt><dd>{selected.code || '—'}</dd></div>
                <div><dt>Secteur métier</dt><dd>{linkedSector?.name || 'Non lié'}</dd></div>
                <div><dt>Géométrie</dt><dd>{selected.geometry_geojson?.type || '—'}</dd></div>
              </dl>
              {canManage && !linkedSector && (
                <button type="button" className="is-primary" onClick={ensureSector} disabled={busy}>
                  Créer / lier le secteur « {selected.name} »
                </button>
              )}
            </>
          ) : (
            <div className="territory-v2__empty">Sélectionnez un territoire pour contrôler sa liaison métier.</div>
          )}
        </aside>
      </div>

      {canManage && (
        <div className="territory-v2__quick-create">
          <strong>Ajouter un territoire</strong>
          <input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Ex. AIN SEBAA" />
          <select value={draftKind} onChange={(event) => setDraftKind(event.target.value)}>
            {Object.entries(KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="button" onClick={createTerritory} disabled={busy || !draftName.trim()}>Ajouter</button>
        </div>
      )}
    </section>
  );
}
