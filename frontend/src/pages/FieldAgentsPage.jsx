import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api } from '../api/client';
import '../styles/field-agents-v3.css';

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function normalizeSearch(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

function asRecords(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.technicians)) return value.technicians;
  return [];
}

function agentInitials(agent) {
  const parts = text(agent?.name, 'Agent terrain')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'AT';
}

function AgentState({ active }) {
  return (
    <span
      className={[
        'field-agent-state',
        active
          ? 'field-agent-state--active'
          : 'field-agent-state--inactive',
      ].join(' ')}
    >
      <span aria-hidden="true" />
      {active ? 'Actif' : 'Inactif'}
    </span>
  );
}

export default function FieldAgentsPage({ onNavigate }) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const loadAgents = useCallback(async ({ manual = false } = {}) => {
    if (manual) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    try {
      const response = await api.getOrienteurs();
      const payload = Array.isArray(response?.data)
        ? response.data
        : response?.data?.items ?? response?.data?.orienteurs ?? [];
      const rows = Array.isArray(payload) ? payload : [];

      const enriched = await Promise.all(
        rows.map(async (agent) => {
          if (!agent?.id) {
            return {
              ...agent,
              technician_count: null,
            };
          }

          try {
            const teamResponse = await api.getOrienteurTechnicians(agent.id);
            return {
              ...agent,
              technician_count: asRecords(teamResponse?.data).length,
            };
          } catch {
            return {
              ...agent,
              technician_count: null,
            };
          }
        }),
      );

      setAgents(enriched);
      setLastUpdatedAt(new Date());
    } catch (loadError) {
      setError(
        loadError?.response?.data?.detail ??
          'Impossible de charger les agents terrain.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  const activeCount = agents.filter(
    (agent) => agent?.is_active !== false,
  ).length;

  const syncIssueCount = agents.filter(
    (agent) => !Number.isInteger(agent?.technician_count),
  ).length;

  const technicianCountsComplete = syncIssueCount === 0;

  const knownTechnicians = agents.reduce(
    (sum, agent) =>
      sum +
      (Number.isInteger(agent?.technician_count)
        ? agent.technician_count
        : 0),
    0,
  );

  const visibleAgents = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);

    return agents
      .filter((agent) => {
        const active = agent?.is_active !== false;

        if (statusFilter === 'active' && !active) return false;
        if (statusFilter === 'inactive' && active) return false;

        if (!normalizedQuery) return true;

        const values = [
          agent?.name,
          agent?.employee_id,
          agent?.username,
          agent?.email,
          agent?.sector_name,
          agent?.sector?.name,
          agent?.team_name,
          agent?.team?.name,
        ];

        return values.some((value) =>
          normalizeSearch(value).includes(normalizedQuery),
        );
      })
      .sort((first, second) => {
        const firstActive = first?.is_active !== false;
        const secondActive = second?.is_active !== false;

        if (firstActive !== secondActive) {
          return firstActive ? -1 : 1;
        }

        return text(first?.name).localeCompare(
          text(second?.name),
          'fr',
          { sensitivity: 'base' },
        );
      });
  }, [agents, query, statusFilter]);

  const filtersActive = Boolean(query.trim()) || statusFilter !== 'all';

  return (
    <div className="field-agents-page">
      <header className="field-agents-header">
        <div className="field-agents-header__identity">
          <div className="field-agents-header__kicker">
            <span>Organisation terrain</span>
            <span className="field-agents-header__scope">
              Supervision d’équipe
            </span>
          </div>

          <h1>Agents terrain</h1>
          <p>
            Responsables du contrôle des dossiers et du suivi de leurs
            équipes techniques.
          </p>
        </div>

        <div
          className="field-agents-header__summary"
          aria-label="Résumé des agents terrain"
        >
          <div>
            <strong>{agents.length}</strong>
            <span>agents</span>
          </div>
          <div>
            <strong>{activeCount}</strong>
            <span>actifs</span>
          </div>
          <div
            title={
              technicianCountsComplete
                ? 'Total des techniciens rattachés aux agents chargés.'
                : 'Certaines équipes n’ont pas pu être synchronisées : aucun total incomplet n’est présenté comme exact.'
            }
          >
            <strong>
              {technicianCountsComplete
                ? knownTechnicians
                : '—'}
            </strong>
            <span>techniciens</span>
          </div>
        </div>

        <div className="field-agents-header__actions">
          {lastUpdatedAt ? (
            <span
              className="field-agents-last-update"
              title={lastUpdatedAt.toLocaleString('fr-FR')}
            >
              MAJ{' '}
              {lastUpdatedAt.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          ) : null}

          <button
            type="button"
            className="field-agents-button field-agents-button--secondary"
            onClick={() => loadAgents({ manual: true })}
            disabled={loading || refreshing}
          >
            {refreshing ? 'Actualisation…' : 'Actualiser'}
          </button>

          <button
            type="button"
            className="field-agents-button field-agents-button--primary"
            onClick={() => onNavigate?.('techniciens')}
          >
            Voir les techniciens
          </button>
        </div>
      </header>

      {error ? (
        <div className="field-agents-notice" role="alert">
          <div>
            <strong>Agents terrain indisponibles</strong>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => loadAgents({ manual: true })}
            disabled={refreshing}
          >
            Réessayer
          </button>
        </div>
      ) : null}

      {!error && syncIssueCount > 0 ? (
        <div className="field-agents-notice field-agents-notice--info">
          <div>
            <strong>Synchronisation partielle des équipes</strong>
            <span>
              {syncIssueCount} agent{syncIssueCount > 1 ? 's' : ''} sans
              compteur technicien confirmé. Les autres données restent
              affichées.
            </span>
          </div>
        </div>
      ) : null}

      <section className="field-agents-content">
        <div className="field-agents-toolbar">
          <label className="field-agents-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nom, secteur, équipe, identifiant…"
              aria-label="Rechercher un agent terrain"
            />
          </label>

          <div className="field-agents-filter-group" aria-label="État des agents">
            {[
              ['all', 'Tous'],
              ['active', 'Actifs'],
              ['inactive', 'Inactifs'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={statusFilter === value ? 'is-active' : ''}
                onClick={() => setStatusFilter(value)}
                aria-pressed={statusFilter === value}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="field-agents-toolbar__count">
            <strong>{visibleAgents.length}</strong>
            {' '}affiché{visibleAgents.length !== 1 ? 's' : ''} sur{' '}
            {agents.length}
          </span>

          {filtersActive ? (
            <button
              type="button"
              className="field-agents-clear"
              onClick={() => {
                setQuery('');
                setStatusFilter('all');
              }}
            >
              Effacer les filtres
            </button>
          ) : null}
        </div>

        <section
          className="field-agents-grid"
          aria-busy={loading}
          aria-label="Liste des agents terrain"
        >
          {loading && agents.length === 0 ? (
            <div className="field-agents-empty">
              Chargement des agents terrain…
            </div>
          ) : null}

          {!loading && visibleAgents.length === 0 ? (
            <div className="field-agents-empty">
              <strong>
                {agents.length === 0
                  ? 'Aucun agent terrain disponible.'
                  : 'Aucun agent ne correspond aux filtres.'}
              </strong>
              {filtersActive ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    setStatusFilter('all');
                  }}
                >
                  Réinitialiser
                </button>
              ) : null}
            </div>
          ) : null}

          {visibleAgents.map((agent) => {
            const sector = text(
              agent?.sector_name ?? agent?.sector?.name,
            );
            const team = text(
              agent?.team_name ?? agent?.team?.name,
            );
            const technicianCount =
              Number.isInteger(agent?.technician_count)
                ? agent.technician_count
                : null;
            const active = agent?.is_active !== false;

            return (
              <article
                className="field-agent-card"
                key={agent?.id ?? agent?.name}
              >
                <div className="field-agent-card__heading">
                  <span className="field-agent-avatar">
                    {agentInitials(agent)}
                  </span>

                  <div>
                    <span className="field-agent-card__eyebrow">
                      Agent terrain
                    </span>
                    <h2>{text(agent?.name, 'Agent terrain')}</h2>
                    <AgentState active={active} />
                  </div>
                </div>

                <dl className="field-agent-card__metrics">
                  <div>
                    <dt>Techniciens</dt>
                    <dd>
                      {technicianCount === null
                        ? 'À synchroniser'
                        : technicianCount}
                    </dd>
                  </div>
                  <div>
                    <dt>Secteur</dt>
                    <dd>{sector || 'Non renseigné'}</dd>
                  </div>
                  <div>
                    <dt>Équipe</dt>
                    <dd>{team || 'Non renseignée'}</dd>
                  </div>
                </dl>

                {!sector && !team ? (
                  <p className="field-agent-card__note">
                    Données organisationnelles non renseignées.
                  </p>
                ) : null}

                <footer>
                  <span>
                    {technicianCount === null
                      ? 'Compteur équipe non confirmé'
                      : technicianCount === 0
                        ? 'Aucun technicien rattaché'
                        : `${technicianCount} technicien${technicianCount > 1 ? 's' : ''} rattaché${technicianCount > 1 ? 's' : ''}`}
                  </span>

                  <button
                    type="button"
                    className="field-agent-team-button"
                    onClick={() => onNavigate?.('techniciens')}
                  >
                    Voir l’équipe
                  </button>
                </footer>
              </article>
            );
          })}
        </section>
      </section>
    </div>
  );
}
