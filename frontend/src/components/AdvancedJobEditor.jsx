import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api, apiClient } from '../api/client';
import { JOB_TYPES_CONFIG } from '../lib/job-types';
import './AdvancedJobEditor.css';

const EQUIPMENT_TYPES = ['ONU_INWI', 'ONT_IAM', 'ONT_ORANGE', 'HUAWEI', 'ZTE', 'NOKIA'];
const PRIORITIES = ['URGENT', 'HAUTE', 'NORMALE', 'FAIBLE'];

const NUMERIC_FIELDS = new Set([
  'latitude', 'longitude', 'sector_id', 'splitter_port', 'optical_power_dbm',
  'cable_length_m', 'estimated_duration', 'client_organization_id',
]);

const EDITABLE_FIELDS = [
  'job_type', 'customer_name', 'customer_phone', 'customer_email',
  'service_address', 'service_city', 'service_zip', 'latitude', 'longitude',
  'planned_location_source', 'planned_location_precision', 'route_criteria',
  'sector_raw', 'sector_id', 'required_skills', 'priority', 'scheduled_date',
  'time_slot_start', 'time_slot_end', 'estimated_duration', 'description',
  'notes', 'special_instructions', 'operator', 'client_organization_id', 'nro',
  'sro', 'pbo', 'pto', 'splitter', 'splitter_port', 'optical_power_dbm',
  'cable_length_m', 'ont_serial', 'router_serial', 'mac_address',
  'wifi_box_serial', 'equipment_type', 'serial_number', 'operational_data',
];

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function dateValue(value) {
  const source = text(value);
  const match = source.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function errorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const joined = detail.map((item) => item?.msg || item?.message || String(item)).filter(Boolean).join(' · ');
    if (joined) return joined;
  }
  return error?.message || fallback;
}

function normalizedKey(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function propertyIndex(properties = {}) {
  const result = new Map();
  Object.entries(properties).forEach(([key, value]) => {
    const normalized = normalizedKey(key);
    if (normalized && !result.has(normalized)) result.set(normalized, value);
  });
  return result;
}

function firstProperty(index, keys) {
  for (const key of keys) {
    const value = index.get(normalizedKey(key));
    if (value !== null && value !== undefined && text(value).trim() !== '') return value;
  }
  return null;
}

function pointInRing(longitude, latitude, ring) {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  let inside = false;
  let previous = ring[ring.length - 1];
  for (const current of ring) {
    if (!Array.isArray(previous) || !Array.isArray(current)) {
      previous = current;
      continue;
    }
    const [x1, y1] = previous.map(Number);
    const [x2, y2] = current.map(Number);
    if ([x1, y1, x2, y2].every(Number.isFinite)) {
      const crosses = (y1 > latitude) !== (y2 > latitude);
      if (crosses) {
        const boundary = ((x2 - x1) * (latitude - y1)) / (y2 - y1) + x1;
        if (longitude < boundary) inside = !inside;
      }
    }
    previous = current;
  }
  return inside;
}

function geometryContainsPoint(geometry, latitude, longitude) {
  if (!geometry || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (geometry.type === 'Polygon') {
    return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0
      ? pointInRing(longitude, latitude, geometry.coordinates[0])
      : false;
  }
  if (geometry.type === 'MultiPolygon') {
    return Array.isArray(geometry.coordinates) && geometry.coordinates.some(
      (polygon) => Array.isArray(polygon) && polygon.length > 0 && pointInRing(longitude, latitude, polygon[0]),
    );
  }
  return false;
}

function qgisPatch(feature, current) {
  const properties = feature?.properties && typeof feature.properties === 'object'
    ? feature.properties
    : {};
  const index = propertyIndex(properties);
  const value = (...keys) => firstProperty(index, keys);
  const patch = {};

  const mappings = {
    customer_name: ['customer_name', 'client', 'nom_client', 'client_name', 'nom_abonne'],
    customer_phone: ['customer_phone', 'telephone', 'tel', 'phone', 'mobile'],
    customer_email: ['customer_email', 'email', 'mail'],
    service_address: ['service_address', 'adresse', 'address', 'adresse_client'],
    service_city: ['service_city', 'ville', 'city', 'commune'],
    service_zip: ['service_zip', 'code_postal', 'postal_code', 'zip'],
    operator: ['operator', 'operateur', 'operateur_ftth'],
    sector_raw: ['sector_raw', 'nom_secteur', 'secteur', 'sector', 'zone', 'quartier'],
    nro: ['nro', 'code_nro', 'ref_nro'],
    sro: ['sro', 'pm', 'code_sro', 'code_pm', 'ref_sro'],
    pbo: ['pbo', 'code_pbo', 'ref_pbo'],
    pto: ['pto', 'code_pto', 'ref_pto'],
    splitter: ['splitter', 'coupleur', 'repartiteur'],
    splitter_port: ['splitter_port', 'port_splitter', 'port_coupleur'],
    optical_power_dbm: ['optical_power_dbm', 'puissance_optique', 'power_dbm'],
    cable_length_m: ['cable_length_m', 'longueur_cable', 'longueur'],
    ont_serial: ['ont_serial', 'sn_ont', 'serial_ont'],
    router_serial: ['router_serial', 'sn_routeur', 'serial_routeur'],
    mac_address: ['mac_address', 'mac', 'adresse_mac'],
    notes: ['notes', 'commentaire', 'comments', 'observation'],
    special_instructions: ['special_instructions', 'instructions', 'consigne'],
  };

  Object.entries(mappings).forEach(([field, aliases]) => {
    const found = value(...aliases);
    if (found !== null) patch[field] = found;
  });

  const latitude = value('latitude', 'lat', 'y');
  const longitude = value('longitude', 'lon', 'lng', 'long', 'x');
  if (latitude !== null && longitude !== null) {
    patch.latitude = latitude;
    patch.longitude = longitude;
    patch.planned_location_source = 'qgis_import';
    patch.planned_location_precision = 'source_file';
  } else if (feature?.geometry?.type === 'Point' && Array.isArray(feature.geometry.coordinates)) {
    const [lon, lat] = feature.geometry.coordinates;
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lon))) {
      patch.latitude = lat;
      patch.longitude = lon;
      patch.planned_location_source = 'qgis_import';
      patch.planned_location_precision = 'source_file';
    }
  }

  if (patch.sector_raw) patch.route_criteria = patch.sector_raw;

  patch.operational_data = {
    ...(current?.operational_data || {}),
    qgis_feature_id: feature?.id ?? null,
    qgis_properties: properties,
  };
  return patch;
}

function pickQgisFeature(collection, form) {
  const features = Array.isArray(collection?.features) ? collection.features : [];
  if (features.length === 1) return { feature: features[0], reason: 'unique' };
  if (features.length === 0) return { feature: null, reason: 'empty' };

  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const matches = features.filter((feature) => geometryContainsPoint(feature?.geometry, latitude, longitude));
    if (matches.length === 1) return { feature: matches[0], reason: 'geometry' };
  }

  const needles = [form.job_number, form.sector_raw, form.route_criteria]
    .map((item) => normalizedKey(item))
    .filter(Boolean);
  if (needles.length) {
    const matches = features.filter((feature) => {
      const props = feature?.properties || {};
      const haystack = Object.values(props).map((item) => normalizedKey(item));
      return needles.some((needle) => haystack.includes(needle));
    });
    if (matches.length === 1) return { feature: matches[0], reason: 'reference' };
  }
  return { feature: null, reason: 'ambiguous', count: features.length };
}

function Field({ label, children, full = false, hint }) {
  return (
    <label className={`aje-field${full ? ' aje-field--full' : ''}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

function TextInput({ name, form, setField, type = 'text', placeholder = '' }) {
  return (
    <input
      type={type}
      value={text(form[name])}
      placeholder={placeholder}
      onChange={(event) => setField(name, event.target.value)}
    />
  );
}

export default function AdvancedJobEditor({ job, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dirty, setDirty] = useState(false);
  const [sectors, setSectors] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [technicianId, setTechnicianId] = useState('');
  const originalTechnicianIdRef = useRef('');
  const fileRef = useRef(null);

  const jobId = job?.id;

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    setError('');
    try {
      const [editorResponse, sectorsResponse, techniciansResponse] = await Promise.all([
        apiClient.get(`/interventions/${jobId}/editor`),
        api.getSectors({ limit: 500 }),
        api.getTechnicians(),
      ]);
      const data = editorResponse?.data || {};
      setForm({
        ...data,
        scheduled_date: dateValue(data.scheduled_date),
        required_skills: Array.isArray(data.required_skills)
          ? data.required_skills.join(', ')
          : text(data.required_skills),
        operational_data: data.operational_data || {},
      });
      const sectorData = sectorsResponse?.data;
      setSectors(Array.isArray(sectorData) ? sectorData : (sectorData?.items || []));
      const techData = techniciansResponse?.data;
      setTechnicians(Array.isArray(techData) ? techData : (techData?.items || []));
      const assigned = data.assigned_tech_id ?? job?.assigned_tech_id ?? '';
      setTechnicianId(text(assigned));
      originalTechnicianIdRef.current = text(assigned);
      setDirty(false);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Impossible de charger l’intervention complète.'));
    } finally {
      setLoading(false);
    }
  }, [job?.assigned_tech_id, jobId]);

  useEffect(() => { load(); }, [load]);

  const setField = useCallback((name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
    setDirty(true);
    setError('');
  }, []);

  const close = useCallback(() => {
    if (saving) return;
    if (dirty && !window.confirm('Fermer sans enregistrer les modifications ?')) return;
    onClose?.();
  }, [dirty, onClose, saving]);

  const operationalJson = useMemo(
    () => JSON.stringify(form.operational_data || {}, null, 2),
    [form.operational_data],
  );

  const setOperationalJson = useCallback((value) => {
    setField('_operational_json', value);
  }, [setField]);

  const importQgis = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setNotice('');
    try {
      const collection = JSON.parse(await file.text());
      if (collection?.type !== 'FeatureCollection') {
        throw new Error('Le fichier QGIS doit être un GeoJSON FeatureCollection.');
      }
      const choice = pickQgisFeature(collection, form);
      if (!choice.feature) {
        if (choice.reason === 'empty') throw new Error('Le GeoJSON ne contient aucune entité.');
        throw new Error(
          `Le fichier contient ${choice.count || 'plusieurs'} entités et GoVector ne peut pas choisir la bonne sans ambiguïté. Ajoutez le GPS/la référence ou exportez uniquement l’entité concernée.`,
        );
      }
      const patch = qgisPatch(choice.feature, form);
      setForm((current) => ({ ...current, ...patch }));
      setDirty(true);
      setNotice(
        choice.reason === 'geometry'
          ? 'QGIS importé : la zone contenant le GPS de l’intervention a été sélectionnée.'
          : 'QGIS importé dans l’intervention. Les colonnes sources sont conservées.',
      );
    } catch (importError) {
      setError(errorMessage(importError, 'Import QGIS impossible.'));
    }
  }, [form]);

  const save = useCallback(async () => {
    if (!jobId || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      let operationalData = form.operational_data || {};
      if (Object.prototype.hasOwnProperty.call(form, '_operational_json')) {
        operationalData = JSON.parse(form._operational_json || '{}');
        if (!operationalData || typeof operationalData !== 'object' || Array.isArray(operationalData)) {
          throw new Error('Les colonnes source doivent former un objet JSON.');
        }
      }

      const payload = {};
      EDITABLE_FIELDS.forEach((name) => {
        if (name === 'operational_data') {
          payload.operational_data = operationalData;
          return;
        }
        let value = form[name];
        if (name === 'required_skills') {
          payload.required_skills = text(value).split(',').map((item) => item.trim()).filter(Boolean);
          return;
        }
        if (name === 'scheduled_date') {
          payload.scheduled_date = value ? `${value}T00:00:00` : null;
          return;
        }
        if (NUMERIC_FIELDS.has(name)) {
          if (text(value).trim() === '') value = null;
          else {
            const number = Number(value);
            if (!Number.isFinite(number)) throw new Error(`${name} doit être numérique.`);
            value = number;
          }
        } else if (typeof value === 'string') {
          value = value.trim() || null;
        }
        payload[name] = value ?? null;
      });

      const response = await apiClient.patch(`/interventions/${jobId}/editor`, payload);

      const previousTech = originalTechnicianIdRef.current;
      const nextTech = text(technicianId);
      if (previousTech && nextTech && previousTech !== nextTech) {
        await api.reassignAssignment(jobId, nextTech);
      } else if (previousTech && !nextTech) {
        await api.unassignJob(jobId);
      } else if (!previousTech && nextTech) {
        await api.createAssignment({ job_id: jobId, technician_id: nextTech });
      }
      originalTechnicianIdRef.current = nextTech;
      setDirty(false);
      setNotice('Intervention mise à jour.');
      await Promise.resolve(onSaved?.(response?.data));
      onClose?.();
    } catch (saveError) {
      setError(errorMessage(saveError, 'Impossible d’enregistrer l’intervention.'));
    } finally {
      setSaving(false);
    }
  }, [form, jobId, onClose, onSaved, saving, technicianId]);

  if (!jobId) return null;

  return (
    <div className="aje-overlay" role="presentation">
      <section className="aje-modal" role="dialog" aria-modal="true" aria-label="Modifier l’intervention">
        <header className="aje-header">
          <div>
            <span className="aje-eyebrow">Intervention #{jobId}</span>
            <h2>Modification complète</h2>
            <p>Champs métier réels, réseau FTTH, planning, secteur et colonnes Excel/QGIS.</p>
          </div>
          <div className="aje-header-actions">
            <input
              ref={fileRef}
              hidden
              type="file"
              accept=".geojson,.json,application/geo+json,application/json"
              onChange={importQgis}
            />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={loading || saving}>
              Importer QGIS
            </button>
            <button type="button" className="aje-close" onClick={close} aria-label="Fermer">×</button>
          </div>
        </header>

        {loading ? <div className="aje-state">Chargement de l’intervention…</div> : null}
        {error ? <div className="aje-alert aje-alert--error" role="alert">{error}</div> : null}
        {notice ? <div className="aje-alert aje-alert--success" role="status">{notice}</div> : null}

        {!loading && (
          <div className="aje-body">
            <section className="aje-section">
              <h3>Référence & qualification</h3>
              <div className="aje-grid">
                <Field label="Référence intervention" hint="Identifiant stable : non modifiable depuis cet écran.">
                  <input value={text(form.job_number)} disabled />
                </Field>
                <Field label="Type">
                  <select value={text(form.job_type)} onChange={(event) => setField('job_type', event.target.value)}>
                    {Object.keys(JOB_TYPES_CONFIG).map((code) => <option key={code} value={code}>{JOB_TYPES_CONFIG[code]?.label || code}</option>)}
                  </select>
                </Field>
                <Field label="Priorité">
                  <select value={text(form.priority)} onChange={(event) => setField('priority', event.target.value)}>
                    {PRIORITIES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Field>
                <Field label="Technicien affecté">
                  <select value={technicianId} onChange={(event) => { setTechnicianId(event.target.value); setDirty(true); }}>
                    <option value="">Non affecté</option>
                    {technicians.filter((item) => item?.is_active !== false).map((item) => (
                      <option key={item.id} value={item.id}>{item.name || item.full_name || item.username || `Technicien ${item.id}`}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Description" full><textarea rows="3" value={text(form.description)} onChange={(event) => setField('description', event.target.value)} /></Field>
              </div>
            </section>

            <section className="aje-section">
              <h3>Client & adresse</h3>
              <div className="aje-grid">
                <Field label="Client"><TextInput name="customer_name" form={form} setField={setField} /></Field>
                <Field label="Téléphone"><TextInput name="customer_phone" form={form} setField={setField} /></Field>
                <Field label="E-mail"><TextInput name="customer_email" form={form} setField={setField} type="email" /></Field>
                <Field label="Adresse" full><TextInput name="service_address" form={form} setField={setField} /></Field>
                <Field label="Ville"><TextInput name="service_city" form={form} setField={setField} /></Field>
                <Field label="Code postal"><TextInput name="service_zip" form={form} setField={setField} /></Field>
                <Field label="Latitude"><TextInput name="latitude" form={form} setField={setField} type="number" /></Field>
                <Field label="Longitude"><TextInput name="longitude" form={form} setField={setField} type="number" /></Field>
                <Field label="Source GPS"><TextInput name="planned_location_source" form={form} setField={setField} /></Field>
                <Field label="Précision GPS"><TextInput name="planned_location_precision" form={form} setField={setField} /></Field>
              </div>
            </section>

            <section className="aje-section">
              <h3>Secteur & planification</h3>
              <div className="aje-grid">
                <Field label="Secteur opérationnel">
                  <select
                    value={text(form.sector_id)}
                    onChange={(event) => {
                      const value = event.target.value;
                      const sector = sectors.find((item) => text(item.id) === value);
                      setForm((current) => ({
                        ...current,
                        sector_id: value,
                        sector_raw: sector?.name || current.sector_raw,
                        route_criteria: sector?.name || current.route_criteria,
                      }));
                      setDirty(true);
                    }}
                  >
                    <option value="">À résoudre automatiquement</option>
                    {sectors.filter((item) => item?.is_active !== false).map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Libellé secteur/QGIS"><TextInput name="sector_raw" form={form} setField={setField} /></Field>
                <Field label="Critère de tournée"><TextInput name="route_criteria" form={form} setField={setField} /></Field>
                <Field label="Date"><TextInput name="scheduled_date" form={form} setField={setField} type="date" /></Field>
                <Field label="Début"><TextInput name="time_slot_start" form={form} setField={setField} type="time" /></Field>
                <Field label="Fin"><TextInput name="time_slot_end" form={form} setField={setField} type="time" /></Field>
                <Field label="Durée prévue (min)"><TextInput name="estimated_duration" form={form} setField={setField} type="number" /></Field>
                <Field label="Compétences" hint="Séparées par des virgules."><TextInput name="required_skills" form={form} setField={setField} /></Field>
              </div>
            </section>

            <section className="aje-section">
              <h3>Réseau FTTH</h3>
              <div className="aje-grid">
                <Field label="Opérateur"><TextInput name="operator" form={form} setField={setField} /></Field>
                <Field label="NRO"><TextInput name="nro" form={form} setField={setField} /></Field>
                <Field label="SRO / PM"><TextInput name="sro" form={form} setField={setField} /></Field>
                <Field label="PBO"><TextInput name="pbo" form={form} setField={setField} /></Field>
                <Field label="PTO"><TextInput name="pto" form={form} setField={setField} /></Field>
                <Field label="Splitter"><TextInput name="splitter" form={form} setField={setField} /></Field>
                <Field label="Port splitter"><TextInput name="splitter_port" form={form} setField={setField} type="number" /></Field>
                <Field label="Puissance optique dBm"><TextInput name="optical_power_dbm" form={form} setField={setField} type="number" /></Field>
                <Field label="Longueur câble (m)"><TextInput name="cable_length_m" form={form} setField={setField} type="number" /></Field>
                <Field label="N° série ONT"><TextInput name="ont_serial" form={form} setField={setField} /></Field>
                <Field label="N° série routeur"><TextInput name="router_serial" form={form} setField={setField} /></Field>
                <Field label="Adresse MAC"><TextInput name="mac_address" form={form} setField={setField} /></Field>
                <Field label="N° boîtier Wi-Fi"><TextInput name="wifi_box_serial" form={form} setField={setField} /></Field>
              </div>
            </section>

            <section className="aje-section">
              <h3>Équipement & consignes</h3>
              <div className="aje-grid">
                <Field label="Type équipement">
                  <select value={text(form.equipment_type)} onChange={(event) => setField('equipment_type', event.target.value)}>
                    <option value="">Non renseigné</option>
                    {EQUIPMENT_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Field>
                <Field label="N° série équipement"><TextInput name="serial_number" form={form} setField={setField} /></Field>
                <Field label="Instructions spéciales" full><textarea rows="3" value={text(form.special_instructions)} onChange={(event) => setField('special_instructions', event.target.value)} /></Field>
                <Field label="Notes" full><textarea rows="3" value={text(form.notes)} onChange={(event) => setField('notes', event.target.value)} /></Field>
              </div>
            </section>

            <section className="aje-section">
              <h3>Colonnes Excel / QGIS supplémentaires</h3>
              <p className="aje-section-help">
                Toutes les colonnes source qui ne correspondent pas à un champ GoVector restent conservées ici. Elles sont exportables et modifiables sans perdre la donnée d’origine.
              </p>
              <textarea
                className="aje-json"
                rows="12"
                spellCheck="false"
                value={Object.prototype.hasOwnProperty.call(form, '_operational_json') ? form._operational_json : operationalJson}
                onChange={(event) => setOperationalJson(event.target.value)}
              />
            </section>

            <section className="aje-section aje-section--readonly">
              <h3>Preuves terrain protégées</h3>
              <div className="aje-readonly-grid">
                <span>Statut <strong>{form.readonly_evidence?.status || '—'}</strong></span>
                <span>Validation <strong>{form.readonly_evidence?.validation_status || '—'}</strong></span>
                <span>GPS terrain <strong>{form.readonly_evidence?.gps_latitude ?? '—'}, {form.readonly_evidence?.gps_longitude ?? '—'}</strong></span>
                <span>Photo avant <strong>{form.readonly_evidence?.before_photo ? 'Oui' : 'Non'}</strong></span>
                <span>Photo après <strong>{form.readonly_evidence?.after_photo ? 'Oui' : 'Non'}</strong></span>
                <span>Signature <strong>{form.readonly_evidence?.client_signature ? 'Oui' : 'Non'}</strong></span>
              </div>
            </section>
          </div>
        )}

        <footer className="aje-footer">
          <button type="button" onClick={close} disabled={saving}>Annuler</button>
          <button type="button" className="aje-primary" onClick={save} disabled={loading || saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer toutes les modifications'}
          </button>
        </footer>
      </section>
    </div>
  );
}
