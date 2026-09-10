import { useCallback, useEffect, useState } from 'react';

import { api } from '../api/client';

function text(value, fallback = 'Non renseigné') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

export default function FieldAgentsPage({ onNavigate }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getOrienteurs();
      const payload = Array.isArray(response?.data)
        ? response.data
        : response?.data?.items ?? response?.data?.orienteurs ?? [];
      setAgents(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(loadError?.response?.data?.detail ?? 'Impossible de charger les agents terrain.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  return (
    <div className="field-agents-page">
      <header className="field-agents-header">
        <div>
          <span>Organisation mobile</span>
          <h1>Agents terrain</h1>
          <p>Responsables du contrôle des dossiers de leurs équipes techniques.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => onNavigate?.('techniciens')}>
          Voir les techniciens
        </button>
      </header>

      {error ? <div className="field-agents-error" role="alert">{error}</div> : null}

      <section className="field-agents-grid" aria-busy={loading}>
        {loading ? <div className="pilot-empty">Chargement des agents terrain…</div> : null}
        {!loading && agents.length === 0 ? <div className="pilot-empty">Aucun agent terrain disponible.</div> : null}
        {agents.map((agent) => (
          <article className="field-agent-card" key={agent?.id ?? agent?.name}>
            <span className="field-agent-avatar">AT</span>
            <div>
              <h2>{text(agent?.name, 'Agent terrain')}</h2>
              <p>{text(agent?.sector_name ?? agent?.sector?.name, 'Secteur non renseigné')}</p>
            </div>
            <dl>
              <div><dt>Équipe</dt><dd>{text(agent?.team_name ?? agent?.team?.name)}</dd></div>
              <div><dt>Statut</dt><dd>{agent?.is_active === false ? 'Inactif' : 'Actif'}</dd></div>
            </dl>
          </article>
        ))}
      </section>
    </div>
  );
}
