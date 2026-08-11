import { useCallback, useEffect, useState } from 'react';

import { api } from '../../api/client';
import '../../styles/settings-audit.css';


const ACTION_LABELS = Object.freeze({
  'account.created': 'Compte créé',
  'account.updated': 'Compte modifié',
  'account.password_reset': 'Mot de passe réinitialisé',
  'client.created': 'Entreprise créée',
  'client.updated': 'Entreprise modifiée',
  'team.created': 'Équipe créée',
  'team.updated': 'Équipe modifiée',
  'team.technician_assigned': 'Technicien affecté',
  'team.technician_removed': 'Technicien retiré',
  'settings.operational_updated': 'Exploitation configurée',
  'settings.catalog_updated': 'Référentiel modifié',
  'site.merged': 'Sites fusionnés',
});


function formatDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Date inconnue';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}


function errorMessage(error) {
  return error?.response?.data?.message
    || error?.response?.data?.detail
    || error?.message
    || 'Journal d’audit indisponible.';
}


export default function OperationalAuditSection({ userRole, refreshRevision = 0 }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (nextPage = 1) => {
    if (userRole !== 'ADMIN') return;
    setLoading(true);
    setError('');
    try {
      const response = await api.getOperationalAuditEvents({
        page: nextPage,
        page_size: 50,
        search: query.trim() || undefined,
        action: action || undefined,
        entity_type: entityType || undefined,
      });
      setItems(Array.isArray(response.data?.items) ? response.data.items : []);
      setTotal(Number(response.data?.total || 0));
      setPage(nextPage);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [action, entityType, query, userRole]);

  useEffect(() => {
    const timer = window.setTimeout(() => load(1), 300);
    return () => window.clearTimeout(timer);
  }, [load, refreshRevision]);

  if (userRole !== 'ADMIN') {
    return (
      <section className="settings-audit-card">
        <h2>Journal d’administration</h2>
        <p>Cette trace sensible est réservée aux administrateurs.</p>
      </section>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / 50));

  return (
    <section className="settings-audit-card">
      <header>
        <div>
          <span>Gouvernance</span>
          <h2>Journal d’administration</h2>
          <p>Trace append-only des comptes, équipes, référentiels et rapprochements de sites.</p>
        </div>
        <strong>{total} événement(s)</strong>
      </header>

      <form
        className="settings-audit-filters"
        onSubmit={(event) => { event.preventDefault(); load(1); }}
      >
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Acteur, action ou identifiant"
        />
        <select value={action} onChange={(event) => setAction(event.target.value)}>
          <option value="">Toutes les actions</option>
          {Object.entries(ACTION_LABELS).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
        <select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
          <option value="">Toutes les ressources</option>
          <option value="user_account">Comptes</option>
          <option value="client_organization">Entreprises</option>
          <option value="field_team">Équipes</option>
          <option value="technician">Techniciens</option>
          <option value="application_setting">Paramètres</option>
          <option value="site">Sites</option>
        </select>
        <button type="submit" disabled={loading}>Filtrer</button>
      </form>

      {error ? <div className="settings-audit-error" role="alert">{error}</div> : null}
      {loading ? <p className="settings-audit-empty">Chargement du journal réel…</p> : null}
      {!loading && !error && items.length === 0 ? (
        <p className="settings-audit-empty">Aucune mutation auditée pour ces filtres.</p>
      ) : null}

      <div className="settings-audit-list">
        {items.map((item) => (
          <article key={item.id}>
            <div className="settings-audit-event-heading">
              <div>
                <strong>{ACTION_LABELS[item.action] || item.action}</strong>
                <span>{item.entity_type}{item.entity_id ? ` #${item.entity_id}` : ''}</span>
              </div>
              <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
            </div>
            <p>{item.actor_username} · {item.actor_role}</p>
            <details>
              <summary>Voir les changements structurés</summary>
              <pre>{JSON.stringify({ changes: item.changes, context: item.context }, null, 2)}</pre>
            </details>
          </article>
        ))}
      </div>

      <footer>
        <button type="button" disabled={loading || page <= 1} onClick={() => load(page - 1)}>
          Précédent
        </button>
        <span>Page {page} / {pageCount}</span>
        <button type="button" disabled={loading || page >= pageCount} onClick={() => load(page + 1)}>
          Suivant
        </button>
      </footer>
    </section>
  );
}
