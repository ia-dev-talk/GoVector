import { useCallback, useEffect, useRef, useState } from 'react';
import { MapContainer, GeoJSON } from 'react-leaflet';
import { circleMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, apiClient } from '../../api/client';
import './gis-datasets.css';

function message(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (typeof detail?.message === 'string') return detail.message;
  if (error instanceof SyntaxError) return 'Le fichier GeoJSON retourné par QGIS est invalide.';
  return 'Opération SIG indisponible. Réessayez après vérification du service.';
}

function ClientDatasets({ clientId }) {
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewDataset, setPreviewDataset] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [exportSelection, setExportSelection] = useState(null);
  const [qgisReturn, setQgisReturn] = useState(null);
  const alive = useRef(true);
  const loadSequence = useRef(0);

  const load = useCallback(async (after = 0) => {
    const sequence = ++loadSequence.current;
    const response = await apiClient.get('/gis-datasets', { params: { client_organization_id: clientId, after_id: after } });
    if (!alive.current || sequence !== loadSequence.current) return;
    setItems((current) => after ? [...current, ...response.data.items] : response.data.items);
    setNext(response.data.next_after_id);
  }, [clientId]);

  useEffect(() => {
    alive.current = true;
    load().catch((failure) => { if (alive.current) setError(message(failure)); });
    return () => { alive.current = false; loadSequence.current += 1; };
  }, [load]);

  const run = async (operation) => {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); }
    catch (failure) { if (alive.current) setError(message(failure)); }
    finally { if (alive.current) setBusy(false); }
  };

  const analyze = () => run(async () => {
    setPreview(null); setPreviewDataset(null);
    const data = new FormData(); data.append('file', file);
    const response = await apiClient.post('/gis-datasets/preview', data);
    if (alive.current) setPreview(response.data);
  });

  const save = () => run(async () => {
    const data = new FormData();
    data.append('file', file); data.append('name', name.trim());
    data.append('client_organization_id', clientId); data.append('expected_sha256', preview.sha256);
    const response = await apiClient.post('/gis-datasets', data);
    if (!alive.current) return;
    setNotice(response.data.reused ? 'Ce fichier est déjà enregistré pour ce client.' : 'Brouillon enregistré. Vérifiez-le avant publication.');
    setPreview(null);
    await load();
  });

  const publish = (dataset) => run(async () => {
    await apiClient.post(`/gis-datasets/${dataset.id}/publish`, { expected_revision: dataset.revision });
    if (!alive.current) return;
    setNotice('Jeu de données publié pour les échanges SIG.');
    await load();
  });

  const download = (datasetId, layer) => run(async () => {
    const response = await apiClient.get(`/gis-datasets/${datasetId}/geojson`, { params: { layer_id: layer.id }, responseType: 'blob' });
    if (!alive.current) return;
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `govector-${datasetId}-couche-${layer.id}.geojson`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const downloadForQgis = (dataset) => run(async () => {
    const response = await apiClient.get(`/gis-datasets/${dataset.id}/qfield-sync`, { responseType: 'blob' });
    if (!alive.current) return;
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `govector-qgis-${dataset.id}.geojson`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Fichier QGIS exporté. Conservez les colonnes techniques _bv_* pendant les modifications.');
  });

  const previewQgisReturn = () => run(async () => {
    const collection = JSON.parse(await qgisReturn.file.text());
    const response = await apiClient.post(`/gis-datasets/${qgisReturn.dataset.id}/qfield-sync/preview`, collection);
    if (alive.current) setQgisReturn((current) => ({ ...current, collection, preview: response.data }));
  });

  const applyQgisReturn = () => run(async () => {
    const response = await apiClient.post(`/gis-datasets/${qgisReturn.dataset.id}/qfield-sync/apply`, qgisReturn.collection);
    if (!alive.current) return;
    setNotice(`${response.data.applied_count ?? 0} modification(s) QGIS appliquée(s), ${response.data.noop_count ?? 0} inchangée(s).`);
    setQgisReturn(null);
    await load();
  });

  return <div>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <fieldset disabled={busy} className="gis-import-fields">
      <label>Nom du jeu de données<input value={name} maxLength={180} onChange={(event) => setName(event.target.value)} /></label>
      <label>Fichier KML ou KMZ<input type="file" accept=".kml,.kmz" onChange={(event) => {
        setFile(event.target.files?.[0] ?? null); setPreview(null); setPreviewDataset(null); setError(''); setNotice('');
      }} /></label>
      <button type="button" className="btn btn--secondary" disabled={!file} onClick={analyze}>Analyser le fichier</button>
    </fieldset>
    {preview && <div className="gis-preview">
      {previewDataset && <h4>Aperçu enregistré : {previewDataset}</h4>}
      <p><strong>{preview.feature_count} objet(s), {preview.layers.length} couche(s)</strong> · {preview.source_type}</p>
      {preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      <p>{preview.sample_is_partial ? 'Aperçu limité aux 20 premiers objets ; les compteurs portent sur le fichier complet.' : 'Aperçu de tous les objets du fichier.'}</p>
      <p>Géométries du fichier, sans fond de carte externe.</p>
      <MapContainer key={preview.sha256} className="gis-preview-map" maxZoom={18} bounds={[[preview.bbox[1], preview.bbox[0]], [preview.bbox[3], preview.bbox[2]]]} scrollWheelZoom={false} attributionControl={false}>
        <GeoJSON data={{ type: 'FeatureCollection', features: preview.sample.map((f) => ({ type: 'Feature', geometry: f.geometry, properties: {} })) }}
          pointToLayer={(_feature, point) => circleMarker(point, { radius: 6 })} />
      </MapContainer>
      <ul>{preview.layers.map((layer) => <li key={`${layer.folder_path}:${layer.geometry_type}`}>{layer.folder_path || 'Sans dossier'} · {layer.geometry_type} · {layer.feature_count} objet(s)</li>)}</ul>
      {!previewDataset && <button type="button" className="btn btn--primary" disabled={busy || !name.trim()} onClick={save}>Enregistrer le brouillon</button>}
      {previewDataset && <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => { setPreview(null); setPreviewDataset(null); }}>Fermer l’aperçu</button>}
    </div>}
    <div className="gis-registry">
      <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => run(() => load())}>Actualiser les jeux de données</button>
      {items.length === 0 && <p>Aucun jeu de données chargé pour cette entreprise.</p>}
      {items.map((dataset) => <article key={dataset.id}>
        <div><strong>{dataset.name}</strong><p>{dataset.status === 'PUBLISHED' ? 'Publié' : 'Brouillon'} · révision {dataset.revision} · {dataset.feature_count} objet(s)</p><small>{dataset.source_filename}</small></div>
        <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => run(async () => {
          setPreview(null); setPreviewDataset(null);
          const response = await apiClient.get(`/gis-datasets/${dataset.id}/preview`);
          if (alive.current) { setPreview(response.data); setPreviewDataset(dataset.name); }
        })}>Voir l’aperçu</button>
        {dataset.status === 'DRAFT'
          ? <button type="button" className="btn btn--primary" disabled={busy} onClick={() => publish(dataset)}>Publier</button>
          : <>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => downloadForQgis(dataset)}>Exporter vers QGIS</button>
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => setQgisReturn({ dataset, file: null, collection: null, preview: null })}>Importer le retour QGIS</button>
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => run(async () => {
              const response = await apiClient.get(`/gis-datasets/${dataset.id}/layers`);
              if (alive.current) setExportSelection({ id: dataset.id, name: dataset.name, layers: response.data });
            })}>Exporter les couches</button>
          </>}
      </article>)}
      {next && <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => run(() => load(next))}>Charger la suite</button>}
    </div>
    {qgisReturn && <div className="gis-preview">
      <h4>Retour QGIS : {qgisReturn.dataset.name}</h4>
      <p>Sélectionnez le GeoJSON précédemment exporté par GoVector et modifié dans QGIS. Les champs <code>_bv_*</code> doivent être conservés.</p>
      <label>Fichier GeoJSON modifié<input type="file" accept=".geojson,application/geo+json,application/json" onChange={(event) => setQgisReturn((current) => ({ ...current, file: event.target.files?.[0] ?? null, collection: null, preview: null }))} /></label>
      <button type="button" className="btn btn--secondary" disabled={busy || !qgisReturn.file} onClick={previewQgisReturn}>Analyser sans modifier GoVector</button>
      {qgisReturn.preview && <div>
        <p><strong>{qgisReturn.preview.apply_count} modification(s)</strong> · {qgisReturn.preview.noop_count} inchangée(s) · {qgisReturn.preview.conflict_count} conflit(s)</p>
        {qgisReturn.preview.conflict_count > 0
          ? <p role="alert">Application bloquée : réexportez la version la plus récente depuis GoVector.</p>
          : <button type="button" className="btn btn--primary" disabled={busy || qgisReturn.preview.apply_count === 0} onClick={applyQgisReturn}>Appliquer les modifications validées</button>}
      </div>}
      <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => setQgisReturn(null)}>Fermer</button>
    </div>}
    {exportSelection && <div><h4>Export : {exportSelection.name}</h4><p>Un fichier GeoJSON par couche, à ouvrir dans QGIS pour consultation. Pour réimporter des modifications, utilisez « Exporter vers QGIS ».</p>
      {exportSelection.layers.map((layer) => <button key={layer.id} type="button" className="btn btn--secondary" disabled={busy} onClick={() => download(exportSelection.id, layer)}>{layer.name} · {layer.geometry_type} ({layer.feature_count})</button>)}
    </div>}
  </div>;
}

export default function GisDatasetWorkspace() {
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.getV1Clients().then((response) => { if (active) setClients(response.data); })
      .catch((failure) => { if (active) setError(message(failure)); });
    return () => { active = false; };
  }, []);
  return <details className="gis-workspace"><summary>Jeux de données SIG · KML/KMZ et QGIS</summary>
    <p>Imports versionnés par entreprise cliente. Les secteurs, sites et équipements opérationnels restent indépendants. Gestion réservée aux administrateurs.</p>
    {error && <p role="alert">{error}</p>}
    <label>Entreprise du jeu de données<select value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">Choisir une entreprise…</option>{clients.filter((c) => c.is_active).map((c) => <option value={String(c.id)} key={c.id}>{c.name}</option>)}</select></label>
    {clientId && <ClientDatasets key={clientId} clientId={clientId} />}
  </details>;
}
