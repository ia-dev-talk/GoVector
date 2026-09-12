import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../../api/client';

const emptyForm = { code: '', cable_type: 'FO16', current_mark_m: '', technician_id: '' };

export default function CableDrumPanel({ technicians = [], canManage = false }) {
  const [drums, setDrums] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [drumsResponse, historyResponse] = await Promise.all([
        apiClient.get('/cable-stock/drums'),
        apiClient.get('/cable-stock/history', { params: { limit: 20 } }),
      ]);
      setDrums(Array.isArray(drumsResponse.data) ? drumsResponse.data : []);
      setHistory(Array.isArray(historyResponse.data) ? historyResponse.data : []);
      setError('');
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Stock câble indisponible.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/cable-stock/drums', {
        code: form.code.trim(),
        cable_type: form.cable_type,
        current_mark_m: Number(form.current_mark_m),
        technician_id: form.technician_id ? Number(form.technician_id) : null,
      });
      setForm(emptyForm);
      await load();
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Création impossible.');
    } finally {
      setSaving(false);
    }
  };

  const assign = async (drum, technicianId) => {
    const isTransfer = drum.assigned_technician_id && Number(drum.assigned_technician_id) !== Number(technicianId);
    const reason = isTransfer ? window.prompt('Justification obligatoire du transfert') : null;
    if (isTransfer && !reason?.trim()) return;
    try {
      await apiClient.put(`/cable-stock/drums/${drum.id}/assignment`, {
        technician_id: Number(technicianId), reason,
      });
      await load();
    } catch (requestError) {
      setError(requestError?.response?.data?.detail || 'Affectation impossible.');
    }
  };

  return (
    <section className="st3-cable-drums" aria-labelledby="cable-drums-title">
      <div className="st3-cable-drums__heading">
        <div>
          <span className="st3-cable-drums__eyebrow">Traçabilité terrain</span>
          <h2 id="cable-drums-title">Bobines câble par CODE</h2>
          <p>Un seul identifiant : CODE bobine = CODE câble = CODE ouvrage.</p>
        </div>
        <button type="button" onClick={load}>Actualiser</button>
      </div>

      {canManage ? (
        <form className="st3-cable-drums__form" onSubmit={create}>
          <label>CODE<input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="4475" /></label>
          <label>Type<select value={form.cable_type} onChange={(e) => setForm({ ...form, cable_type: e.target.value })}><option>FO16</option><option>FO64</option></select></label>
          <label>Repère courant (m)<input required min="0" step="0.01" type="number" value={form.current_mark_m} onChange={(e) => setForm({ ...form, current_mark_m: e.target.value })} placeholder="2003" /></label>
          <label>Technicien<select value={form.technician_id} onChange={(e) => setForm({ ...form, technician_id: e.target.value })}><option value="">Non affectée</option>{technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</select></label>
          <button disabled={saving} type="submit">{saving ? 'Enregistrement…' : 'Ajouter la bobine'}</button>
        </form>
      ) : null}

      {error ? <div className="st3-notice" role="alert">{String(error)}</div> : null}
      <div className="st3-cable-drums__grid">
        <div className="st3-cable-drums__table-wrap">
          <table><thead><tr><th>CODE</th><th>Type</th><th>Repère</th><th>Consommé</th><th>État</th><th>Technicien</th></tr></thead>
            <tbody>{drums.map((drum) => <tr key={drum.id}><td><strong>{drum.code}</strong></td><td>{drum.cable_type}</td><td>{drum.current_mark_m} m</td><td>{drum.total_consumed_m} m</td><td>{drum.status === 'ACTIVE' ? 'Active' : 'Épuisée'}</td><td>{canManage && drum.status === 'ACTIVE' ? <select value={drum.assigned_technician_id || ''} onChange={(e) => e.target.value && assign(drum, e.target.value)}><option value="">Non affectée</option>{technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</select> : (drum.assigned_technician_name || '—')}</td></tr>)}</tbody>
          </table>
          {!drums.length ? <p className="st3-cable-drums__empty">Aucune bobine enregistrée.</p> : null}
        </div>
        <div className="st3-cable-drums__history"><h3>Dernières consommations</h3>{history.slice(0, 8).map((item) => <div key={item.id}><strong>{item.code} · {item.quantity_m} m</strong><span>{item.start_mark_m} → {item.end_mark_m} · {item.installation_mode}</span><small>{item.job_number || `Intervention ${item.job_id}`} · {item.technician_name}</small></div>)}{!history.length ? <p>Aucune consommation.</p> : null}</div>
      </div>
    </section>
  );
}
