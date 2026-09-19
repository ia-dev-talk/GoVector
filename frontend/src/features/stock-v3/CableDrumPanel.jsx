import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { apiClient } from '../../api/client';

const emptyForm = {
  code: '',
  cable_type: 'FO16',
  current_mark_m: '',
  technician_id: '',
};

export default function CableDrumPanel({
  technicians = [],
  canManage = false,
}) {
  const [drums, setDrums] = useState([]);
  const [history, setHistory] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);

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
      setError(
        requestError?.response?.data?.detail ||
          'Stock câble indisponible.',
      );
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const active = drums.filter(
      (drum) => drum.status === 'ACTIVE',
    );
    return {
      total: drums.length,
      active: active.length,
      assigned: active.filter(
        (drum) => Boolean(drum.assigned_technician_id),
      ).length,
      consumed: history.reduce(
        (sum, item) => sum + (Number(item?.quantity_m) || 0),
        0,
      ),
    };
  }, [drums, history]);

  const create = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      await apiClient.post('/cable-stock/drums', {
        code: form.code.trim(),
        cable_type: form.cable_type,
        current_mark_m: Number(form.current_mark_m),
        technician_id: form.technician_id
          ? Number(form.technician_id)
          : null,
      });
      setForm(emptyForm);
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.detail ||
          'Création impossible.',
      );
    } finally {
      setSaving(false);
    }
  };

  const assign = async (drum, technicianId) => {
    const isTransfer =
      drum.assigned_technician_id &&
      Number(drum.assigned_technician_id) !== Number(technicianId);
    const reason = isTransfer
      ? window.prompt('Justification obligatoire du transfert')
      : null;

    if (isTransfer && !reason?.trim()) return;

    try {
      await apiClient.put(
        `/cable-stock/drums/${drum.id}/assignment`,
        {
          technician_id: Number(technicianId),
          reason,
        },
      );
      await load();
    } catch (requestError) {
      setError(
        requestError?.response?.data?.detail ||
          'Affectation impossible.',
      );
    }
  };

  return (
    <section
      className={[
        'st3-cable-drums',
        expanded ? 'st3-cable-drums--expanded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby="cable-drums-title"
    >
      <div className="st3-cable-drums__heading">
        <div className="st3-cable-drums__identity">
          <span className="st3-cable-drums__eyebrow">
            Traçabilité terrain
          </span>
          <h2 id="cable-drums-title">Bobines & consommation câble</h2>
          <p>
            Suivi par CODE unique, affectation technicien et historique de
            consommation.
          </p>
        </div>

        <div
          className="st3-cable-drums__summary"
          aria-label="Résumé des bobines"
        >
          <span>
            <strong>{summary.active}</strong>
            actives
          </span>
          <span>
            <strong>{summary.assigned}</strong>
            affectées
          </span>
          <span>
            <strong>{summary.consumed.toFixed(0)} m</strong>
            consommés
          </span>
        </div>

        <div className="st3-cable-drums__actions">
          <button
            type="button"
            className="st3-cable-drums__refresh"
            onClick={load}
          >
            Actualiser
          </button>
          <button
            type="button"
            className="st3-cable-drums__toggle"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
          >
            {expanded ? 'Réduire' : 'Ouvrir les bobines'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="st3-cable-drums__error" role="alert">
          {String(error)}
        </div>
      ) : null}

      {expanded ? (
        <div className="st3-cable-drums__body">
          {canManage ? (
            <form
              className="st3-cable-drums__form"
              onSubmit={create}
            >
              <div className="st3-cable-drums__form-heading">
                <span>Nouvelle bobine</span>
                <small>
                  CODE bobine = CODE câble = CODE ouvrage
                </small>
              </div>

              <label>
                CODE
                <input
                  required
                  value={form.code}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      code: event.target.value,
                    })
                  }
                  placeholder="4475"
                />
              </label>

              <label>
                Type
                <select
                  value={form.cable_type}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      cable_type: event.target.value,
                    })
                  }
                >
                  <option>FO16</option>
                  <option>FO64</option>
                </select>
              </label>

              <label>
                Repère courant (m)
                <input
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  value={form.current_mark_m}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      current_mark_m: event.target.value,
                    })
                  }
                  placeholder="2003"
                />
              </label>

              <label>
                Technicien
                <select
                  value={form.technician_id}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      technician_id: event.target.value,
                    })
                  }
                >
                  <option value="">Non affectée</option>
                  {technicians.map((technician) => (
                    <option
                      key={technician.id}
                      value={technician.id}
                    >
                      {technician.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="st3-cable-drums__create"
                disabled={saving}
                type="submit"
              >
                {saving ? 'Enregistrement…' : 'Ajouter la bobine'}
              </button>
            </form>
          ) : null}

          <div className="st3-cable-drums__grid">
            <div className="st3-cable-drums__table-wrap">
              <div className="st3-cable-drums__section-heading">
                <div>
                  <span>Registre</span>
                  <strong>
                    {summary.total} bobine{summary.total !== 1 ? 's' : ''}
                  </strong>
                </div>
                <small>Repère courant et affectation terrain</small>
              </div>

              <div className="st3-cable-drums__table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>CODE</th>
                      <th>Type</th>
                      <th>Repère</th>
                      <th>Consommé</th>
                      <th>État</th>
                      <th>Technicien</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drums.map((drum) => (
                      <tr key={drum.id}>
                        <td>
                          <strong>{drum.code}</strong>
                        </td>
                        <td>{drum.cable_type}</td>
                        <td>{drum.current_mark_m} m</td>
                        <td>{drum.total_consumed_m} m</td>
                        <td>
                          <span
                            className={[
                              'st3-cable-drums__status',
                              drum.status === 'ACTIVE'
                                ? 'st3-cable-drums__status--active'
                                : 'st3-cable-drums__status--empty',
                            ].join(' ')}
                          >
                            {drum.status === 'ACTIVE'
                              ? 'Active'
                              : 'Épuisée'}
                          </span>
                        </td>
                        <td>
                          {canManage && drum.status === 'ACTIVE' ? (
                            <select
                              value={drum.assigned_technician_id || ''}
                              onChange={(event) =>
                                event.target.value &&
                                assign(drum, event.target.value)
                              }
                            >
                              <option value="">Non affectée</option>
                              {technicians.map((technician) => (
                                <option
                                  key={technician.id}
                                  value={technician.id}
                                >
                                  {technician.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            drum.assigned_technician_name || '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!drums.length ? (
                <div className="st3-cable-drums__empty">
                  <strong>Aucune bobine enregistrée</strong>
                  <span>
                    Le registre apparaîtra ici dès la première création.
                  </span>
                </div>
              ) : null}
            </div>

            <aside className="st3-cable-drums__history">
              <div className="st3-cable-drums__section-heading">
                <div>
                  <span>Journal</span>
                  <strong>Dernières consommations</strong>
                </div>
                <small>{Math.min(history.length, 8)} affichées</small>
              </div>

              <div className="st3-cable-drums__history-list">
                {history.slice(0, 8).map((item) => (
                  <div
                    className="st3-cable-drums__history-item"
                    key={item.id}
                  >
                    <div>
                      <strong>{item.code}</strong>
                      <span>{item.quantity_m} m</span>
                    </div>
                    <p>
                      {item.start_mark_m} → {item.end_mark_m}
                      {' · '}
                      {item.installation_mode}
                    </p>
                    <small>
                      {item.job_number || `Intervention ${item.job_id}`}
                      {' · '}
                      {item.technician_name}
                    </small>
                  </div>
                ))}

                {!history.length ? (
                  <div className="st3-cable-drums__empty st3-cable-drums__empty--compact">
                    <strong>Aucune consommation</strong>
                    <span>Le journal terrain est vide.</span>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </section>
  );
}
