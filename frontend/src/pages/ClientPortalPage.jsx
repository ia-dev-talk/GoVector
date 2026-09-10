import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../api/client';
import ClientOperationsMap from '../features/client-portal/ClientOperationsMap';
import '../styles/client-portal.css';

const PAGE_SIZE = 25;

function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fr-FR', options);
}

function activityLabel(activity, statusLabels) {
  if (activity.new_status) return statusLabels[activity.new_status] || activity.new_status;
  const labels = {
    job_started: 'Intervention démarrée',
    arrival_confirmed: 'Arrivée confirmée',
    work_started: 'Travaux démarrés',
    job_completed: 'Intervention terminée',
    job_failed: 'Échec terrain',
    job_postponed: 'Intervention reportée',
    client_absent: 'Client absent',
  };
  return labels[activity.action] || 'Mise à jour opérationnelle';
}

export default function ClientPortalPage() {
  const [data, setData] = useState(null);
  const [statusCatalog, setStatusCatalog] = useState([]);
  const [draftSearch, setDraftSearch] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '', date_from: '', date_to: '', page: 1 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const statusLabels = useMemo(
    () => Object.fromEntries(statusCatalog.map((item) => [item.code, item.label])),
    [statusCatalog],
  );
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = {
        page: filters.page,
        page_size: PAGE_SIZE,
        search: filters.search || undefined,
        status: filters.status || undefined,
        date_from: filters.date_from ? `${filters.date_from}T00:00:00Z` : undefined,
        date_to: filters.date_to ? `${filters.date_to}T23:59:59Z` : undefined,
      };
      const [overview, workflow] = await Promise.all([
        api.getClientV1Overview(params),
        api.getWorkflowCapabilities(),
      ]);
      setData(overview.data);
      setStatusCatalog(workflow.data?.statuses || []);
      setError('');
    } catch (requestError) {
      const detail = requestError?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Actualisation indisponible. Les dernières données reçues restent affichées.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => load(), 0);
    const timer = window.setInterval(() => load({ silent: true }), 15_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [load]);

  const submitSearch = (event) => {
    event.preventDefault();
    setFilters((current) => ({ ...current, search: draftSearch.trim(), page: 1 }));
  };
  const updateFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value, page: 1 }));
  const resetFilters = () => {
    setDraftSearch('');
    setFilters({ search: '', status: '', date_from: '', date_to: '', page: 1 });
  };

  if (!data) return <div className="client-portal-state">{error || 'Chargement des opérations…'}</div>;
  const pagination = data.pagination || { page: 1, pages: 1, total: 0 };
  const map = data.map || {};

  return (
    <main className="client-portal">
      <header className="client-portal-header">
        <div>
          <span>Portail entreprise · lecture seule</span>
          <h1>{data.organization?.name}</h1>
          <p>Une vision factuelle de vos interventions, sans accès aux opérations internes GoVector.</p>
        </div>
        <div className="client-portal-header__actions">
          <small>{data.generated_at ? `Actualisé ${formatDate(data.generated_at, { hour: '2-digit', minute: '2-digit' })}` : ''}</small>
          <button type="button" onClick={() => load()} disabled={loading}>{loading ? 'Actualisation…' : 'Actualiser'}</button>
        </div>
      </header>
      {error ? <div className="client-portal-error" role="status">{error}</div> : null}

      <section className="client-portal-kpis" aria-label="Indicateurs opérationnels">
        <article><span>Total</span><strong>{data.kpis?.total ?? 0}</strong><small>Dossiers de votre entreprise</small></article>
        <article><span>Ordres ouverts</span><strong>{data.kpis?.open ?? 0}</strong><small>Encore actifs administrativement</small></article>
        <article className="is-live"><span>Sur le terrain</span><strong>{data.kpis?.field_active ?? 0}</strong><small>{map.live_operations?.length || 0} position(s) fraîche(s)</small></article>
        <article className="is-awaiting"><span>À valider</span><strong>{data.kpis?.awaiting_validation ?? 0}</strong><small>Transmis par le terrain</small></article>
        <article className="is-complete"><span>Terminées</span><strong>{data.kpis?.completed ?? 0}</strong><small>Ordres clôturés</small></article>
      </section>

      <section className="client-portal-command">
        <form onSubmit={submitSearch} className="client-portal-search">
          <label>
            <span>Rechercher</span>
            <input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} placeholder="Référence, client, adresse, ville…" />
          </label>
          <label><span>Statut</span><select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">Tous les statuts</option>{statusCatalog.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
          <label><span>Du</span><input type="date" value={filters.date_from} onChange={(event) => updateFilter('date_from', event.target.value)} /></label>
          <label><span>Au</span><input type="date" value={filters.date_to} onChange={(event) => updateFilter('date_to', event.target.value)} /></label>
          <button type="submit">Appliquer</button>
          <button type="button" className="is-secondary" onClick={resetFilters}>Effacer</button>
        </form>
      </section>

      <section className="client-portal-live-grid">
        <article className="client-portal-panel client-portal-panel--map">
          <div className="client-portal-panel__title"><div><span>Cartographie</span><h2>Interventions et équipes actives</h2></div><small>{map.truncated ? 'Carte limitée aux 500 dossiers les plus récents' : `${map.planned_jobs?.length || 0} intervention(s) localisée(s)`}</small></div>
          <ClientOperationsMap plannedJobs={map.planned_jobs} liveOperations={map.live_operations} />
          {!map.live_tracking_configured ? <p className="client-portal-privacy-note">Les positions terrain ne sont pas affichées tant que le seuil de fraîcheur GPS n’est pas configuré par GoVector.</p> : <p className="client-portal-privacy-note">Seules les positions récentes d’équipes travaillant sur vos interventions sont visibles. Seuil : {map.stale_after_minutes} min.</p>}
        </article>
        <article className="client-portal-panel client-portal-activity">
          <div className="client-portal-panel__title"><div><span>Flux vérifié</span><h2>Dernières évolutions</h2></div></div>
          <div className="client-portal-activity__list">
            {(data.recent_activity || []).map((activity) => <div key={activity.id}><i /><span><strong>#{activity.job_reference} · {activityLabel(activity, statusLabels)}</strong><small>{formatDate(activity.occurred_at, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></span></div>)}
            {!data.recent_activity?.length ? <p>Aucune évolution récente à afficher.</p> : null}
          </div>
        </article>
      </section>

      <section className="client-portal-table-wrap">
        <div className="client-portal-table-title"><div><span>Dossiers</span><h2>Interventions de votre entreprise</h2></div><small>{pagination.total} résultat(s)</small></div>
        <div className="client-portal-table">
          <div className="client-portal-row client-portal-row--head"><span>Intervention</span><span>Client / site</span><span>Adresse</span><span>Technicien</span><span>Statut</span></div>
          {(data.jobs || []).map((job) => <div key={job.id} className="client-portal-row"><span>#{job.job_number || job.id}<small>{job.job_type}</small></span><span>{job.customer_name || '—'}<small>{job.operator || '—'}</small></span><span>{job.service_address || '—'}<small>{job.service_city || ''}</small></span><span>{job.assigned_tech_name || 'Non affectée'}</span><span><b data-status={job.status}>{statusLabels[job.status] || job.status}</b></span></div>)}
          {!data.jobs?.length ? <div className="client-portal-empty">Aucune intervention ne correspond à ces filtres.</div> : null}
        </div>
        <footer className="client-portal-pagination"><button type="button" disabled={pagination.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Précédent</button><span>Page {pagination.page} / {pagination.pages}</span><button type="button" disabled={pagination.page >= pagination.pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Suivant</button></footer>
      </section>
    </main>
  );
}
