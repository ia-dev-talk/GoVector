import { useEffect, useMemo, useRef, useState } from 'react';

import { api, apiClient } from '../api/client';
import './operational-job-editor.css';

const JOB_TYPES = [
  ['INSTALLATION', 'Installation'],
  ['DEPANNAGE', 'Dépannage'],
  ['MAINTENANCE', 'Maintenance'],
  ['SAV', 'SAV'],
  ['DISCONNECT', 'Déconnexion'],
  ['INSPECTION', 'Inspection'],
  ['INCIDENT', 'Incident'],
  ['URGENCE', 'Urgence'],
  ['MIGRATION', 'Migration'],
  ['RACCORDEMENT', 'Raccordement'],
  ['AUDIT', 'Audit'],
  ['TUBAGE', 'Tubage'],
  ['NON_JOIGNABLE', 'Non joignable'],
  ['ANNULATION', 'Annulation'],
  ['SPLITTER', 'Splitter'],
  ['CROQUIS_RESEAU', 'Croquis réseau'],
];

const EXCEL_FIELDS = [
  ['avancement_magillan', 'AVANCEMENT MAGILLAN'],
  ['date_action', "DATE D'ACTION", 'datetime-local'],
  ['observation', 'OBSERVATION', 'textarea'],
  ['splitter_msan', 'SPLITTER / MSAN'],
  ['pco', 'PCO'],
  ['sn', 'SN'],
  ['position_pco', 'POSITION PCO'],
  ['gps_pco', 'GPS PCO'],
  ['gps_derivation', 'GPS DÉRIVATION'],
  ['gps_splitter', 'GPS SPLITTER'],
  ['tech_cb', 'TECH CB'],
  ['tech_rac', 'TECH RAC'],
  ['tech_cable', 'TECH CÂBLE'],
  ['cb', 'CB'],
  ['cable', 'CÂBLE'],
  ['cable_code', 'CODE'],
  ['depart', 'DÉPART'],
  ['arrive', 'ARRIVÉE'],
  ['conduite', 'CONDUITE'],
  ['fi', 'F/I'],
  ['a', 'A'],
  ['signal', 'SIGNAL'],
  ['remarque', 'REMARQUE', 'textarea'],
];

function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value).slice(0, 16);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

function errorText(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) return detail.map((item) => item?.msg).filter(Boolean).join(' · ') || fallback;
  return error?.message || fallback;
}

function opValue(job, key) {
  const data = job?.operational_data || {};
  const aliases = {
    avancement_magillan: ['avancement_magillan', 'AVANCEMENT_MAGILLAN'],
    date_action: ['date_action', 'DATE_ACTION'],
    observation: ['observation', 'OBSERVATION'],
    splitter_msan: ['splitter_msan', 'SPLITTER_MSAN'],
    pco: ['pco', 'PCO'],
    sn: ['sn', 'SN'],
    position_pco: ['position_pco', 'POSITION_PCO'],
    gps_pco: ['gps_pco', 'GPS_PCO'],
    gps_derivation: ['gps_derivation', 'GPS_DERIVATION'],
    gps_splitter: ['gps_splitter', 'GPS_SPLITTER'],
    tech_cb: ['tech_cb', 'TECH_CB'],
    tech_rac: ['tech_rac', 'TECH_RAC'],
    tech_cable: ['tech_cable', 'TECH_CABLE'],
    cb: ['cb', 'CB'],
    cable: ['cable', 'CABLE'],
    cable_code: ['cable_code', 'CABLE_CODE'],
    depart: ['depart', 'CABLE_DEPART'],
    arrive: ['arrive', 'CABLE_ARRIVE'],
    conduite: ['conduite', 'POSE_SP'],
    fi: ['fi', 'POSE_FSD'],
    a: ['a', 'POSE_TR'],
    signal: ['signal', 'SIGNAL'],
    remarque: ['remarque', 'REMARQUE'],
  };
  for (const alias of aliases[key] || [key]) {
    if (data[alias] !== undefined && data[alias] !== null) return text(data[alias]);
  }
  return '';
}

function initialForm(job) {
  const pendingType = Boolean(job?.operational_data?.job_type_pending);
  return {
    job_number: text(job?.job_number),
    job_type: pendingType ? '' : text(job?.job_type),
    status: text(job?.status || 'pending'),
    priority: text(job?.priority || 'NORMALE'),
    operator: text(job?.operator),
    sector_id: text(job?.sector_id),
    sector_raw: text(job?.sector_raw),
    customer_name: text(job?.customer_name),
    customer_phone: text(job?.customer_phone),
    customer_email: text(job?.customer_email),
    service_address: text(job?.service_address),
    service_city: text(job?.service_city),
    service_zip: text(job?.service_zip),
    latitude: text(job?.latitude),
    longitude: text(job?.longitude),
    scheduled_date: localDateTime(job?.scheduled_date),
    time_slot_start: text(job?.time_slot_start),
    time_slot_end: text(job?.time_slot_end),
    estimated_duration: text(job?.estimated_duration),
    description: text(job?.description),
    notes: text(job?.notes),
    nro_raw: text(job?.nro_raw),
    sro_raw: text(job?.sro_raw),
    pbo_raw: text(job?.pbo_raw),
    pto_raw: text(job?.pto_raw),
    splitter_raw: text(job?.splitter_raw),
    splitter_port_raw: text(job?.splitter_port_raw),
    optical_power_dbm: text(job?.optical_power_dbm),
    cable_length_m: text(job?.cable_length_m),
    ont_serial: text(job?.ont_serial),
    router_serial: text(job?.router_serial),
    mac_address: text(job?.mac_address),
    wifi_box_serial: text(job?.wifi_box_serial),
    ...Object.fromEntries(EXCEL_FIELDS.map(([key]) => [key, opValue(job, key)])),
  };
}

function numberOrNull(value) {
  if (value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export default function OperationalJobEditor({ job = null, onClose, onSaved, onCreated }) {
  const [form, setForm] = useState(() => initialForm(job));
  const [sectors, setSectors] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [newSector, setNewSector] = useState('');
  const [qgisNotice, setQgisNotice] = useState('');
  const qgisRef = useRef(null);
  const editing = Boolean(job?.id);

  const loadSectors = async () => {
    const response = await api.getSectors({ limit: 500 });
    const data = response.data;
    setSectors((Array.isArray(data) ? data : data?.items || []).filter((item) => item.is_active !== false));
  };

  useEffect(() => {
    loadSectors().catch((failure) => setError(errorText(failure, 'Secteurs indisponibles.')));
  }, []);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const selectedSector = useMemo(
    () => sectors.find((sector) => String(sector.id) === String(form.sector_id)) || null,
    [form.sector_id, sectors],
  );

  const createSector = async () => {
    const name = newSector.trim();
    if (!name) return;
    setBusy(true); setError('');
    try {
      const response = await api.createSector({ name, is_active: true, description: 'Créé depuis une intervention GoVector' });
      await loadSectors();
      set('sector_id', String(response.data.id));
      set('sector_raw', response.data.name || name);
      setNewSector('');
    } catch (failure) {
      setError(errorText(failure, 'Impossible de créer le secteur.'));
    } finally { setBusy(false); }
  };

  const importQgis = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true); setError(''); setQgisNotice('');
    try {
      const data = new FormData();
      data.append('file', file);
      data.append('create_missing_sectors', 'true');
      const response = await apiClient.post('/territories/sector-tools/import-qgis', data);
      await loadSectors();
      setQgisNotice(`QGIS importé : ${response.data?.linked || 0} secteur(s) lié(s), ${response.data?.skipped?.length || 0} objet(s) ignoré(s).`);
    } catch (failure) {
      setError(errorText(failure, 'Import QGIS impossible.'));
    } finally { setBusy(false); }
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const operational_data = { ...(job?.operational_data || {}) };
      EXCEL_FIELDS.forEach(([key]) => { operational_data[key] = form[key] === '' ? null : form[key]; });
      operational_data.source_sector = form.sector_raw || selectedSector?.name || null;

      const payload = {
        job_number: form.job_number.trim() || null,
        job_type: form.job_type || null,
        status: form.status || 'pending',
        priority: form.priority || 'NORMALE',
        operator: form.operator.trim() || null,
        sector_id: numberOrNull(form.sector_id),
        sector_raw: selectedSector?.name || form.sector_raw.trim() || null,
        customer_name: form.customer_name.trim() || null,
        customer_phone: form.customer_phone.trim() || null,
        customer_email: form.customer_email.trim() || null,
        service_address: form.service_address.trim() || null,
        service_city: form.service_city.trim() || null,
        service_zip: form.service_zip.trim() || null,
        latitude: numberOrNull(form.latitude),
        longitude: numberOrNull(form.longitude),
        scheduled_date: form.scheduled_date ? new Date(form.scheduled_date).toISOString() : null,
        time_slot_start: form.time_slot_start || null,
        time_slot_end: form.time_slot_end || null,
        estimated_duration: numberOrNull(form.estimated_duration),
        description: form.description || null,
        notes: form.notes || null,
        nro_raw: form.nro_raw || null,
        sro_raw: form.sro_raw || null,
        pbo_raw: form.pbo_raw || null,
        pto_raw: form.pto_raw || null,
        splitter_raw: form.splitter_raw || null,
        splitter_port_raw: numberOrNull(form.splitter_port_raw),
        optical_power_dbm: numberOrNull(form.optical_power_dbm),
        cable_length_m: numberOrNull(form.cable_length_m),
        ont_serial: form.ont_serial || null,
        router_serial: form.router_serial || null,
        mac_address: form.mac_address || null,
        wifi_box_serial: form.wifi_box_serial || null,
        operational_data,
      };
      const response = editing
        ? await apiClient.put(`/jobs/operational-jobs/${job.id}`, payload)
        : await apiClient.post('/jobs/operational-jobs', payload);
      (onSaved || onCreated)?.(response.data);
      onClose?.();
    } catch (failure) {
      setError(errorText(failure, 'Impossible d’enregistrer l’intervention.'));
    } finally { setBusy(false); }
  };

  return (
    <div className="opjob-overlay" role="dialog" aria-modal="true">
      <form className="opjob" onSubmit={save}>
        <header className="opjob__header">
          <div><span>EXPLOITATION FTTH</span><h2>{editing ? `Modifier l’intervention ${job.id}` : 'Nouvelle intervention'}</h2><p>Toutes les données métier, opérateur, réseau et Excel au même endroit.</p></div>
          <button type="button" onClick={onClose} aria-label="Fermer">×</button>
        </header>

        <div className="opjob__body">
          {error && <div className="opjob__error">{error}</div>}
          {qgisNotice && <div className="opjob__success">{qgisNotice}</div>}

          <section>
            <h3>Identification & affectation géographique</h3>
            <div className="opjob__grid">
              <label>Commande / référence<input value={form.job_number} onChange={(e) => set('job_number', e.target.value)} /></label>
              <label>Type intervention<select value={form.job_type} onChange={(e) => set('job_type', e.target.value)}><option value="">À décider par l’orienteur</option>{JOB_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Secteur opérationnel<select value={form.sector_id} onChange={(e) => { set('sector_id', e.target.value); const sector = sectors.find((item) => String(item.id) === e.target.value); if (sector) set('sector_raw', sector.name); }}><option value="">À sélectionner</option>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></label>
              <label>Opérateur<input value={form.operator} onChange={(e) => set('operator', e.target.value)} placeholder="IAM / Orange / INWI…" /></label>
              <label>Statut<select value={form.status} onChange={(e) => set('status', e.target.value)}><option value="pending">Non affecté</option><option value="assigned">Affecté</option><option value="in_progress">En cours</option><option value="on_hold">En pause</option><option value="completed">Terminé</option><option value="cancelled">Annulé</option></select></label>
              <label>Priorité<select value={form.priority} onChange={(e) => set('priority', e.target.value)}><option>NORMALE</option><option>HAUTE</option><option>URGENT</option><option>FAIBLE</option></select></label>
              <label>Date / rendez-vous<input type="datetime-local" value={form.scheduled_date} onChange={(e) => set('scheduled_date', e.target.value)} /></label>
              <label>Durée estimée (min)<input type="number" min="0" value={form.estimated_duration} onChange={(e) => set('estimated_duration', e.target.value)} /></label>
            </div>
            <div className="opjob__inline-create">
              <strong>Ajouter un secteur manquant :</strong><input value={newSector} onChange={(e) => setNewSector(e.target.value)} placeholder="Ex. AIN SEBAA" /><button type="button" onClick={createSector} disabled={busy || !newSector.trim()}>Créer et sélectionner</button>
              <input ref={qgisRef} hidden type="file" accept=".rar,.qgz,.qgs,.geojson,.json,.kml,.kmz" onChange={importQgis} />
              <button type="button" onClick={() => qgisRef.current?.click()} disabled={busy}>Importer QGIS / QField</button>
            </div>
          </section>

          <section>
            <h3>Client & adresse</h3>
            <div className="opjob__grid">
              <label>Intitulé client<input value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} /></label>
              <label>Contact<input value={form.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} /></label>
              <label>Email<input value={form.customer_email} onChange={(e) => set('customer_email', e.target.value)} /></label>
              <label className="span-2">Adresse<input value={form.service_address} onChange={(e) => set('service_address', e.target.value)} /></label>
              <label>Ville<input value={form.service_city} onChange={(e) => set('service_city', e.target.value)} /></label>
              <label>Code postal<input value={form.service_zip} onChange={(e) => set('service_zip', e.target.value)} /></label>
              <label>Latitude<input value={form.latitude} onChange={(e) => set('latitude', e.target.value)} /></label>
              <label>Longitude<input value={form.longitude} onChange={(e) => set('longitude', e.target.value)} /></label>
            </div>
          </section>

          <section>
            <h3>Réseau FTTH</h3>
            <div className="opjob__grid">
              <label>NRO<input value={form.nro_raw} onChange={(e) => set('nro_raw', e.target.value)} /></label>
              <label>SRO<input value={form.sro_raw} onChange={(e) => set('sro_raw', e.target.value)} /></label>
              <label>PBO<input value={form.pbo_raw} onChange={(e) => set('pbo_raw', e.target.value)} /></label>
              <label>PTO<input value={form.pto_raw} onChange={(e) => set('pto_raw', e.target.value)} /></label>
              <label>Splitter<input value={form.splitter_raw} onChange={(e) => set('splitter_raw', e.target.value)} /></label>
              <label>Port<input value={form.splitter_port_raw} onChange={(e) => set('splitter_port_raw', e.target.value)} /></label>
              <label>Signal / puissance dBm<input value={form.optical_power_dbm} onChange={(e) => set('optical_power_dbm', e.target.value)} /></label>
              <label>Longueur câble (m)<input value={form.cable_length_m} onChange={(e) => set('cable_length_m', e.target.value)} /></label>
              <label>ONT SN<input value={form.ont_serial} onChange={(e) => set('ont_serial', e.target.value)} /></label>
              <label>Routeur SN<input value={form.router_serial} onChange={(e) => set('router_serial', e.target.value)} /></label>
              <label>MAC<input value={form.mac_address} onChange={(e) => set('mac_address', e.target.value)} /></label>
              <label>Box Wi-Fi SN<input value={form.wifi_box_serial} onChange={(e) => set('wifi_box_serial', e.target.value)} /></label>
            </div>
          </section>

          <section>
            <h3>Colonnes opérateur / Excel</h3>
            <p className="opjob__hint">Ces champs correspondent au classeur terrain et restent exportables/modifiables sans inventer de valeur.</p>
            <div className="opjob__grid">
              {EXCEL_FIELDS.map(([key, label, kind]) => (
                <label key={key} className={kind === 'textarea' ? 'span-2' : ''}>{label}
                  {kind === 'textarea'
                    ? <textarea value={form[key]} onChange={(e) => set(key, e.target.value)} />
                    : <input type={kind || 'text'} value={form[key]} onChange={(e) => set(key, e.target.value)} />}
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3>Notes</h3>
            <div className="opjob__grid"><label className="span-2">Description<textarea value={form.description} onChange={(e) => set('description', e.target.value)} /></label><label className="span-2">Notes internes<textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} /></label></div>
          </section>
        </div>

        <footer className="opjob__footer"><button type="button" onClick={onClose}>Annuler</button><button type="submit" className="is-primary" disabled={busy}>{busy ? 'Enregistrement…' : editing ? 'Enregistrer les modifications' : 'Créer l’intervention'}</button></footer>
      </form>
    </div>
  );
}
