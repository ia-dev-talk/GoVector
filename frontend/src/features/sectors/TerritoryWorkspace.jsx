import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import territoryApi from './territoryApi';
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
  return typeof detail === 'string' && detail.trim() ? detail : error?.message || fallback;
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
  nodes.filter((node) => !rows.some((row) => row.id === node.id)).forEach((node) => rows.push({ ...node, depth: 0 }));
  return rows;
}

export default function TerritoryWorkspace({ canManage, legacySectors = [], toast }) {
  const [nodes, setNodes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', code: '', kind: 'SECTOR', parent_id: '', legacy_sector_id: '', color: '#4f8cff' });
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await territoryApi.list({ includeInactive: true });
      setNodes(Array.isArray(response?.data) ? response.data : []);
    } catch (loadError) {
      setError(message(loadError, 'Impossible de charger la géographie BlueVector.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => buildRows(nodes), [nodes]);
  const selected = useMemo(() => nodes.find((node) => node.id === selectedId) || null, [nodes, selectedId]);

  const beginCreate = (parent = null) => {
    setDraft({ name: '', code: '', kind: parent ? 'SUBSECTOR' : 'SECTOR', parent_id: parent?.id || '', legacy_sector_id: '', color: parent?.color || '#4f8cff' });
    setEditing(true);
  };

  const beginEdit = () => {
    if (!selected) return;
    setDraft({
      name: selected.name || '', code: selected.code || '', kind: selected.kind || 'SECTOR',
      parent_id: selected.parent_id || '', legacy_sector_id: selected.legacy_sector_id || '', color: selected.color || '#4f8cff',
    });
    setEditing(true);
  };

  const save = async () => {
    if (!draft.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(), code: draft.code.trim() || null, kind: draft.kind,
        parent_id: draft.parent_id ? Number(draft.parent_id) : null,
        legacy_sector_id: draft.legacy_sector_id ? Number(draft.legacy_sector_id) : null,
        color: draft.color || null,
      };
      if (selected && editing && draft.name === selected.name && String(draft.code || '') === String(selected.code || '')) {
        await territoryApi.update(selected.id, payload);
      } else {
        const response = await territoryApi.create(payload);
        setSelectedId(response?.data?.id || null);
      }
      setEditing(false);
      await load();
      toast?.('Géographie territoriale enregistrée.', 'success');
    } catch (saveError) {
      toast?.(message(saveError, 'Impossible d’enregistrer le territoire.'), 'error');
    } finally { setSaving(false); }
  };

  const deactivate = async () => {
    if (!selected) return;
    try {
      await territoryApi.deactivate(selected.id);
      await load();
      toast?.('Territoire désactivé.', 'success');
    } catch (actionError) { toast?.(message(actionError, 'Impossible de désactiver ce territoire.'), 'error'); }
  };

  const exportGeoJson = async () => {
    try {
      const response = await territoryApi.exportGeoJson();
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/geo+json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'bluevector-territories.geojson'; anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) { toast?.(message(exportError, 'Export GeoJSON impossible.'), 'error'); }
  };

  const importGeoJson = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const collection = JSON.parse(await file.text());
      const response = await territoryApi.importGeoJson(collection);
      await load();
      toast?.(`Import QGIS terminé · ${response?.data?.created || 0} créé(s), ${response?.data?.updated || 0} mis à jour.`, 'success');
    } catch (importError) { toast?.(message(importError, 'GeoJSON invalide ou import impossible.'), 'error'); }
  };

  return (
    <section className="territory-workspace">
      <header className="territory-workspace__header">
        <div><span className="territory-workspace__eyebrow">Géographie & QGIS/QField</span><h2>Hiérarchie territoriale</h2><p>Structurez région, zones, secteurs et sous-secteurs sans casser les secteurs opérationnels existants.</p></div>
        <div className="territory-workspace__actions">
          <button type="button" onClick={exportGeoJson}>Exporter GeoJSON</button>
          {canManage && <><input ref={fileRef} hidden type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={importGeoJson} /><button type="button" onClick={() => fileRef.current?.click()}>Importer QGIS</button><button type="button" className="is-primary" onClick={() => beginCreate(null)}>+ Territoire</button></>}
        </div>
      </header>
      {error && <div className="territory-workspace__error">{error} <button type="button" onClick={load}>Réessayer</button></div>}
      <div className="territory-workspace__body">
        <div className="territory-tree" aria-busy={loading}>
          {loading ? <p>Chargement…</p> : rows.length === 0 ? <p className="territory-empty">Aucune géographie. Créez Casablanca, puis Est/Ouest et leurs sous-secteurs.</p> : rows.map((node) => (
            <button key={node.id} type="button" className={selectedId === node.id ? 'territory-row is-selected' : 'territory-row'} style={{ '--territory-depth': node.depth }} onClick={() => { setSelectedId(node.id); setEditing(false); }}>
              <span className="territory-row__dot" style={{ background: node.color || '#60728a' }} /><span><strong>{node.name}</strong><small>{KIND_LABELS[node.kind] || node.kind}{node.code ? ` · ${node.code}` : ''}</small></span><em>{node.child_count || 0}</em>
            </button>
          ))}
        </div>
        <aside className="territory-inspector">
          {editing ? <>
            <h3>{selected ? 'Modifier le territoire' : 'Nouveau territoire'}</h3>
            <label>Nom<input value={draft.name} onChange={(e) => setDraft((v) => ({ ...v, name: e.target.value }))} placeholder="Sidi Maarouf" /></label>
            <div className="territory-form-grid"><label>Code<input value={draft.code} onChange={(e) => setDraft((v) => ({ ...v, code: e.target.value }))} placeholder="CASA-SM" /></label><label>Type<select value={draft.kind} onChange={(e) => setDraft((v) => ({ ...v, kind: e.target.value }))}>{Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
            <label>Parent<select value={draft.parent_id} onChange={(e) => setDraft((v) => ({ ...v, parent_id: e.target.value }))}><option value="">Racine</option>{nodes.filter((node) => node.id !== selected?.id).map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
            <label>Secteur opérationnel lié<select value={draft.legacy_sector_id} onChange={(e) => setDraft((v) => ({ ...v, legacy_sector_id: e.target.value }))}><option value="">Aucun</option>{legacySectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
            <div className="territory-form-actions"><button type="button" onClick={() => setEditing(false)}>Annuler</button><button type="button" className="is-primary" disabled={saving || !draft.name.trim()} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button></div>
          </> : selected ? <>
            <span className="territory-workspace__eyebrow">{KIND_LABELS[selected.kind] || selected.kind}</span><h3>{selected.name}</h3><p>{selected.code || 'Sans code'} · source {selected.source || 'manual'}</p>
            <dl><div><dt>Sous-territoires</dt><dd>{selected.child_count || 0}</dd></div><div><dt>Géométrie</dt><dd>{selected.geometry_geojson ? selected.geometry_geojson.type : 'À définir'}</dd></div><div><dt>Secteur métier</dt><dd>{selected.legacy_sector_id || 'Non lié'}</dd></div><div><dt>État</dt><dd>{selected.is_active === false ? 'Inactif' : 'Actif'}</dd></div></dl>
            {canManage && <div className="territory-form-actions"><button type="button" onClick={() => beginCreate(selected)}>+ Sous-zone</button><button type="button" onClick={beginEdit}>Modifier</button>{selected.is_active !== false && <button type="button" className="is-danger" onClick={deactivate}>Désactiver</button>}</div>}
          </> : <div className="territory-empty">Sélectionnez un territoire pour voir sa géométrie, son rattachement et ses sous-zones.</div>}
        </aside>
      </div>
    </section>
  );
}
