import { useCallback, useEffect, useState } from 'react';

import { api } from '../api/client';
import '../styles/client-portal.css';

export default function ClientPortalPage() {
  const [data, setData] = useState(null);
  const [statusLabels, setStatusLabels] = useState({});
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const [overview, workflow] = await Promise.all([
        api.getClientV1Overview(),
        api.getWorkflowCapabilities(),
      ]);
      setData(overview.data);
      setStatusLabels(Object.fromEntries((workflow.data?.statuses || []).map((item) => [item.code, item.label])));
      setError('');
    }
    catch (requestError) { setError(requestError?.response?.data?.detail || 'Actualisation indisponible.'); }
  }, []);
  useEffect(() => {
    const initialTimer = window.setTimeout(() => load(), 0);
    const timer = window.setInterval(load, 15_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [load]);
  if (!data) return <div className="client-portal-state">{error || 'Chargement des opérations…'}</div>;
  return (
    <div className="client-portal">
      <header><div><span>Portail entreprise · lecture seule</span><h1>{data.organization?.name}</h1><p>Suivi opérationnel BlueVector actualisé automatiquement toutes les 15 secondes.</p></div><button type="button" onClick={load}>Actualiser</button></header>
      {error ? <div className="client-portal-error">{error}</div> : null}
      <section className="client-portal-kpis">
        <article><span>Total</span><strong>{data.kpis?.total ?? 0}</strong></article>
        <article><span>Ouvertes</span><strong>{data.kpis?.open ?? 0}</strong></article>
        <article><span>Terminées</span><strong>{data.kpis?.completed ?? 0}</strong></article>
        <article><span>Échecs</span><strong>{data.kpis?.failed ?? 0}</strong></article>
      </section>
      <section className="client-portal-table-wrap">
        <div className="client-portal-table-title"><div><span>Temps réel</span><h2>Interventions de votre entreprise</h2></div><small>{data.generated_at ? `Mis à jour ${new Date(data.generated_at).toLocaleTimeString('fr-FR')}` : ''}</small></div>
        <div className="client-portal-table">
          <div className="client-portal-row client-portal-row--head"><span>Intervention</span><span>Client / site</span><span>Adresse</span><span>Technicien</span><span>Statut</span></div>
          {(data.jobs || []).map((job) => <div key={job.id} className="client-portal-row"><span>#{job.job_number || job.id}<small>{job.job_type}</small></span><span>{job.customer_name || '—'}<small>{job.operator || '—'}</small></span><span>{job.service_address || '—'}<small>{job.service_city || ''}</small></span><span>{job.assigned_tech_name || 'Non affectée'}</span><span><b data-status={job.status}>{statusLabels[job.status] || job.status}</b></span></div>)}
        </div>
      </section>
    </div>
  );
}
