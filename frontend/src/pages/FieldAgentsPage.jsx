import { useCallback, useEffect, useState } from 'react';

import { api } from '../api/client';

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function asRecords(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.technicians)) return value.technicians;
  return [];
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
      const rows = Array.isArray(payload) ? payload : [];

      const enriched = await Promise.all(rows.map(async (agent) => {
        if (!agent?.id) return { ...agent, technician_count: null };
        try {
          const teamResponse = await api.getOrienteurTechnicians(agent.id);
          return {
            ...agent,
            technician_count: asRecords(teamResponse?.data).length,
          };
        } catch {
          return { ...agent, technician_count: null };
        }
      }));

      setAgents(enriched);
    } catch (loadError) {
      setError(loadError?.response?.data?.detail ?? 'Impossible de charger les agents terrain.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const activeCount = agents.filter((agent) => agent?.is_active !== false).length;
  const knownTechnicians = agents.reduce(
    (sum, agent) => sum + (Number.isInteger(agent?.technician_count) ? agent.technician_count : 0),
    0,
  );

  return (
    <div className="field-agents-page field-agents-page--delivery">
      <header className="field-agents-header field-agents-header--delivery">
        <div>
          <span>Organisation terrain</span>
          <h1>Agents terrain</h1>
          <p>Responsables du contrôle des dossiers et du suivi de leurs équipes techniques.</p>
        </div>
        <div className="field-agents-header-summary" aria-label="Résumé des agents terrain">
          <div><strong>{agents.length}</strong><span>agents</span></div>
          <div><strong>{activeCount}</strong><span>actifs</span></div>
          <div><strong>{knownTechnicians}</strong><span>techniciens rattachés</span></div>
        </div>
        <div className="field-agents-header-actions">
          <button type="button" className="btn btn--secondary" onClick={loadAgents} disabled={loading}>
            {loading ? 'Actualisation…' : 'Actualiser'}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onNavigate?.('techniciens')}>
            Voir les techniciens
          </button>
        </div>
      </header>

      {error ? <div className="field-agents-error" role="alert">{error}</div> : null}

      <section className="field-agents-grid field-agents-grid--delivery" aria-busy={loading}>
        {loading ? <div className="pilot-empty">Chargement des agents terrain…</div> : null}
        {!loading && agents.length === 0 ? <div className="pilot-empty">Aucun agent terrain disponible.</div> : null}
        {agents.map((agent) => {
          const sector = text(agent?.sector_name ?? agent?.sector?.name);
          const team = text(agent?.team_name ?? agent?.team?.name);
          const technicianCount = Number.isInteger(agent?.technician_count)
            ? agent.technician_count
            : null;

          return (
            <article className="field-agent-card field-agent-card--delivery" key={agent?.id ?? agent?.name}>
              <div className="field-agent-card-heading">
                <span className="field-agent-avatar">AT</span>
                <div>
                  <h2>{text(agent?.name, 'Agent terrain')}</h2>
                  <span className={agent?.is_active === false ? 'field-agent-state is-inactive' : 'field-agent-state is-active'}>
                    {agent?.is_active === false ? 'Inactif' : 'Actif'}
                  </span>
                </div>
              </div>

              <dl>
                {sector ? <div><dt>Secteur</dt><dd>{sector}</dd></div> : null}
                {team ? <div><dt>Équipe</dt><dd>{team}</dd></div> : null}
                <div>
                  <dt>Techniciens</dt>
                  <dd>{technicianCount === null ? 'À synchroniser' : technicianCount}</dd>
                </div>
              </dl>

              {!sector && !team ? (
                <p className="field-agent-card-note">
                  Organisation à compléter dans l’administration ; aucune donnée n’est inventée.
                </p>
              ) : null}

              <button
                type="button"
                className="field-agent-team-button"
                onClick={() => onNavigate?.('techniciens')}
              >
                Ouvrir l’équipe technique
              </button>
            </article>
          );
        })}
      </section>
    </div>
  );
}
