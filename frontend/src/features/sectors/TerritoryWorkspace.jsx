import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../../api/client';
import territoryApi from './territoryApi';
import { isTerritoryWorkspaceEmpty } from './territoryWorkspacePresentation';
import './territory-workspace.css';

const KIND_LABELS = {
  REGION: 'Région',
  ZONE: 'Zone',
  SECTOR: 'Secteur',
  SUBSECTOR: 'Sous-secteur',
  MICROZONE: 'Micro-zone',
};

function message(error, fallback) {
  const detail = error?.response?.data?.detail;
  return typeof detail === 'string' && detail.trim()
    ? detail
    : error?.message || fallback;
}

function buildRows(nodes) {
  const byParent = new Map();
  nodes.forEach((node) => {
    const key = node.parent_id ?? null;
    byParent.set(key, [...(byParent.get(key) || []), node]);
  });
  const rows = [];
  const visit = (parentId, depth, visited) => {
    (byParent.get(parentId) || []).forEach((node) => {
      if (visited.has(node.id)) return;
      rows.push({ ...node, depth });
      const next = new Set(visited);
      next.add(node.id);
      visit(node.id, depth + 1, next);
    });
  };
  visit(null, 0, new Set());
  nodes
    .filter((node) => !rows.some((row) => row.id === node.id))
    .forEach((node) => rows.push({ ...node, depth: 0 }));
  return rows;
}

function descendantIds(nodes, nodeId) {
  const children = new Map();
  nodes.forEach((node) => {
    const key = node.parent_id ?? null;
    children.set(key, [...(children.get(key) || []), node.id]);
  });
  const result = new Set([nodeId]);
  const queue = [...(children.get(nodeId) || [])];
  while (queue.length) {
    const id = queue.shift();
    if (result.has(id)) continue;
    result.add(id);
    queue.push(...(children.get(id) || []));
  }
  return result;
}

export default function TerritoryWorkspace({ canManage, legacySectors = null, toast }) {
  const [nodes, setNodes] = useState([]);
  const [catalogSectors, setCatalogSectors] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(true);
  const [draft, setDraft] = useState({
    name: '',
    code: '',
    kind: 'SECTOR',
    parent_id: '',
    legacy_sector_id: '',
    color: '#4f8cff',
  });
  const fileRef = useRef(null);

  const notify = useCallback((text, type = 'info') => {
    setNotice(text);
    toast?.(text, type);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([
      territoryApi.list({ includeInactive: true }),
      legacySectors === null ? api.getSectors({ limit: 500 }) : Promise.resolve(null),
    ]);
    const [territoryResult, sectorResult] = results;
    if (territoryResult.status === 'fulfilled') {
      setNodes(Array.isArray(territoryResult.value?.data) ? territoryResult.value.data : []);
    } else {
      setError(message(territoryResult.reason, 'Impossible de charger la géographie BlueVector.'));
    }
    if (legacySectors === null && sectorResult.status === 'fulfilled') {
      const data = sectorResult.value?.data;
      setCatalogSectors(Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : []);
    }
    setLoading(false);
  }, [legacySectors]);

  useEffect(() => {
    load();
  }, [load]);

  const availableLegacySectors = legacySectors ?? catalogSectors;
  const rows = useMemo(() => buildRows(nodes), [nodes]);
  const selected = useMemo(
    () => nodes.find((node) => node.id === selectedId) || null,
    [nodes, selectedId],
  );
  const selectedLegacySector = useMemo(
    () => availableLegacySectors.find((sector) => Number(sector.id) === Number(selected?.legacy_sector_id)) || null,
    [availableLegacySectors, selected?.legacy_sector_id],
  );
  const blockedParents = useMemo(
    () => (editingId ? descendantIds(nodes, editingId) : new Set()),
    [editingId, nodes],
  );
  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fr');
    return rows.filter((node) => {
      if (!showInactive && node.is_active === false) return false;
      if (!query) return true;
      return [node.name, node.code, KIND_LABELS[node.kind], node.source]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase('fr').includes(query));
    });
  }, [rows, search, showInactive]);
  const summary = useMemo(
    () => ({
      total: nodes.length,
      geocoded: nodes.filter((node) => node.geometry_geojson).length,
      linked: nodes.filter((node) => node.legacy_sector_id).length,
      inactive: nodes.filter((node) => node.is_active === false).length,
    }),
    [nodes],
  );
  const emptyWorkspace = isTerritoryWorkspaceEmpty({
    loading,
    error,
    nodes,
    editorOpen,
  });

  const beginCreate = (parent = null) => {
    setEditingId(null);
    setDraft({
      name: '',
      code: '',
      kind: parent ? 'SUBSECTOR' : 'SECTOR',
      parent_id: parent?.id || '',
      legacy_sector_id: '',
      color: parent?.color || '#4f8cff',
    });
    setEditorOpen(true);
  };

  const beginEdit = () => {
    if (!selected) return;
    setEditingId(selected.id);
    setDraft({
      name: selected.name || '',
      code: selected.code || '',
      kind: selected.kind || 'SECTOR',
      parent_id: selected.parent_id || '',
      legacy_sector_id: selected.legacy_sector_id || '',
      color: selected.color || '#4f8cff',
    });
    setEditorOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        code: draft.code.trim() || null,
        kind: draft.kind,
        parent_id: draft.parent_id ? Number(draft.parent_id) : null,
        legacy_sector_id: draft.legacy_sector_id ? Number(draft.legacy_sector_id) : null,
        color: draft.color || null,
      };
      if (editingId) {
        await territoryApi.update(editingId, payload);
      } else {
        const response = await territoryApi.create(payload);
        setSelectedId(response?.data?.id || null);
      }
      setEditorOpen(false);
      setEditingId(null);
      await load();
      notify('Géographie territoriale enregistrée.', 'success');
    } catch (saveError) {
      notify(message(saveError, 'Impossible d’enregistrer le territoire.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!selected) return;
    const confirmed = window.confirm(
      `Désactiver « ${selected.name} » ? Les sous-territoires actifs doivent être déplacés ou désactivés avant cette action.`,
    );
    if (!confirmed) return;
    try {
      await territoryApi.deactivate(selected.id);
      await load();
      notify('Territoire désactivé.', 'success');
    } catch (actionError) {
      notify(message(actionError, 'Impossible de désactiver ce territoire.'), 'error');
    }
  };

  const reactivate = async () => {
    if (!selected) return;
    try {
      await territoryApi.update(selected.id, { is_active: true });
      await load();
      notify('Territoire réactivé.', 'success');
    } catch (actionError) {
      notify(message(actionError, 'Impossible de réactiver ce territoire.'), 'error');
    }
  };

  const exportGeoJson = async () => {
    try {
      const response = await territoryApi.exportGeoJson({ includeInactive: false });
      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/geo+json',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'bluevector-territories.geojson';
      anchor.click();
      URL.revokeObjectURL(url);
      notify('Export GeoJSON préparé.', 'success');
    } catch (exportError) {
      notify(message(exportError, 'Export GeoJSON impossible.'), 'error');
    }
  };

  const importGeoJson = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const collection = JSON.parse(await file.text());
      const response = await territoryApi.importGeoJson(collection);
      await load();
      notify(
        `Import QGIS terminé · ${response?.data?.created || 0} créé(s), ${response?.data?.updated || 0} mis à jour.`,
        'success',
      );
    } catch (importError) {
      notify(message(importError, 'GeoJSON invalide ou import impossible.'), 'error');
    }
  };

  return (
    <section className={`territory-workspace${emptyWorkspace ? ' territory-workspace--empty' : ''}`}>
      <header className="territory-workspace__header">
        <div>
          <span className="territory-workspace__eyebrow">Géographie & QGIS/QField</span>
          <h2>Hiérarchie territoriale</h2>
          <p>Structurez région, zones, secteurs et sous-secteurs sans casser les secteurs opérationnels existants.</p>
        </div>
        <div className="territory-workspace__actions">
          <button type="button" onClick={exportGeoJson}>Exporter GeoJSON</button>
          {canManage && (
            <>
              <input
                ref={fileRef}
                hidden
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                onChange={importGeoJson}
              />
              <button type="button" onClick={() => fileRef.current?.click()}>Importer QGIS</button>
              <button type="button" className="is-primary" onClick={() => beginCreate(null)}>+ Territoire</button>
            </>
          )}
        </div>
      </header>

      <div className="territory-workspace__summary" aria-label="Résumé géographique">
        <span><strong>{summary.total}</strong> territoires</span>
        <span><strong>{summary.geocoded}</strong> géométries</span>
        <span><strong>{summary.linked}</strong> liés au métier</span>
        <span><strong>{summary.inactive}</strong> inactifs</span>
      </div>

      {!emptyWorkspace ? (
        <div className="territory-workspace__filters">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher Casablanca, Sidi Maarouf, code…"
            aria-label="Rechercher dans la hiérarchie territoriale"
          />
          <label>
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            Afficher les inactifs
          </label>
        </div>
      ) : null}

      {notice && <div className="territory-workspace__notice" role="status">{notice}</div>}
      {error && (
        <div className="territory-workspace__error">
          {error} <button type="button" onClick={load}>Réessayer</button>
        </div>
      )}

      {emptyWorkspace ? (
        <div className="territory-workspace__empty-state">
          <div>
            <strong>Aucune géographie détaillée configurée</strong>
            <span>
              Les secteurs opérationnels restent disponibles ci-dessous. Ajoutez la hiérarchie GIS uniquement quand ses territoires et rattachements sont prêts.
            </span>
          </div>
          {canManage ? (
            <button type="button" className="is-primary" onClick={() => beginCreate(null)}>
              Créer le premier territoire
            </button>
          ) : null}
        </div>
      ) : (
      <div className="territory-workspace__body">
        <div className="territory-tree" aria-busy={loading}>
          {loading ? (
            <p>Chargement…</p>
          ) : filteredRows.length === 0 ? (
            <p className="territory-empty">
              {nodes.length === 0
                ? 'Aucune géographie. Créez Casablanca, puis Est/Ouest et leurs sous-secteurs.'
                : 'Aucun territoire ne correspond aux filtres.'}
            </p>
          ) : (
            filteredRows.map((node) => (
              <button
                key={node.id}
                type="button"
                className={`${selectedId === node.id ? 'territory-row is-selected' : 'territory-row'}${node.is_active === false ? ' is-inactive' : ''}`}
                style={{ '--territory-depth': node.depth }}
                onClick={() => {
                  setSelectedId(node.id);
                  setEditorOpen(false);
                }}
              >
                <span className="territory-row__dot" style={{ background: node.color || '#60728a' }} />
                <span>
                  <strong>{node.name}</strong>
                  <small>{KIND_LABELS[node.kind] || node.kind}{node.code ? ` · ${node.code}` : ''}</small>
                </span>
                <em>{node.child_count || 0}</em>
              </button>
            ))
          )}
        </div>

        <aside className="territory-inspector">
          {editorOpen ? (
            <>
              <h3>{editingId ? 'Modifier le territoire' : 'Nouveau territoire'}</h3>
              <label>
                Nom
                <input
                  value={draft.name}
                  onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))}
                  placeholder="Sidi Maarouf"
                />
              </label>
              <div className="territory-form-grid">
                <label>
                  Code
                  <input
                    value={draft.code}
                    onChange={(event) => setDraft((value) => ({ ...value, code: event.target.value }))}
                    placeholder="CASA-SM"
                  />
                </label>
                <label>
                  Type
                  <select
                    value={draft.kind}
                    onChange={(event) => setDraft((value) => ({ ...value, kind: event.target.value }))}
                  >
                    {Object.entries(KIND_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Parent
                <select
                  value={draft.parent_id}
                  onChange={(event) => setDraft((value) => ({ ...value, parent_id: event.target.value }))}
                >
                  <option value="">Racine</option>
                  {nodes
                    .filter((node) => !blockedParents.has(node.id))
                    .map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}
                </select>
              </label>
              <label>
                Secteur opérationnel lié
                <select
                  value={draft.legacy_sector_id}
                  onChange={(event) => setDraft((value) => ({ ...value, legacy_sector_id: event.target.value }))}
                >
                  <option value="">Aucun</option>
                  {availableLegacySectors.map((sector) => (
                    <option key={sector.id} value={sector.id}>{sector.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Couleur cartographique
                <input
                  type="color"
                  value={draft.color || '#4f8cff'}
                  onChange={(event) => setDraft((value) => ({ ...value, color: event.target.value }))}
                />
              </label>
              <div className="territory-form-actions">
                <button type="button" onClick={() => setEditorOpen(false)}>Annuler</button>
                <button
                  type="button"
                  className="is-primary"
                  disabled={saving || !draft.name.trim()}
                  onClick={save}
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </>
          ) : selected ? (
            <>
              <span className="territory-workspace__eyebrow">{KIND_LABELS[selected.kind] || selected.kind}</span>
              <h3>{selected.name}</h3>
              <p>{selected.code || 'Sans code'} · source {selected.source || 'manual'}</p>
              <dl>
                <div><dt>Sous-territoires</dt><dd>{selected.child_count || 0}</dd></div>
                <div><dt>Géométrie</dt><dd>{selected.geometry_geojson?.type || 'À définir'}</dd></div>
                <div><dt>Secteur métier</dt><dd>{selectedLegacySector?.name || selected.legacy_sector_id || 'Non lié'}</dd></div>
                <div><dt>État</dt><dd>{selected.is_active === false ? 'Inactif' : 'Actif'}</dd></div>
                <div><dt>Latitude</dt><dd>{selected.centroid_latitude ?? '—'}</dd></div>
                <div><dt>Longitude</dt><dd>{selected.centroid_longitude ?? '—'}</dd></div>
              </dl>
              {canManage && (
                <div className="territory-form-actions">
                  <button type="button" onClick={() => beginCreate(selected)}>+ Sous-zone</button>
                  <button type="button" onClick={beginEdit}>Modifier</button>
                  {selected.is_active === false ? (
                    <button type="button" onClick={reactivate}>Réactiver</button>
                  ) : (
                    <button type="button" className="is-danger" onClick={deactivate}>Désactiver</button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="territory-empty">
              Sélectionnez un territoire pour voir sa géométrie, son rattachement et ses sous-zones.
            </div>
          )}
        </aside>
      </div>
      )}
    </section>
  );
}
