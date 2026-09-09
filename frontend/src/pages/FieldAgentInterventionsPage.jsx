import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { apiClient } from '../api/client';
import {
  fieldAgentReviewCounters,
  fieldAgentStatusLabel,
  isAwaitingAgentReview,
  normalizeFieldAgentEntries,
} from '../features/field-agent/fieldAgentReview.js';
import '../styles/field-agent-interventions.css';

function formatDateTime(value) {
  if (!value) {
    return 'Non planifiée';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function readableError(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail;
  }
  return 'Action impossible pour le moment. Actualisez puis réessayez.';
}

function DataRow({ label, value }) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return (
    <div className="fa-review-data-row">
      <span>{label}</span>
      <strong>{String(value)}</strong>
    </div>
  );
}

export default function FieldAgentInterventionsPage() {
  const [entries, setEntries] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [decisionPending, setDecisionPending] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [filter, setFilter] = useState('all');
  const [message, setMessage] = useState(null);

  const loadTeamJobs = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await apiClient.get('/orienteur-agent/me/jobs');
      const nextEntries = normalizeFieldAgentEntries(response.data);
      setEntries(nextEntries);
      setSelectedJobId((currentId) => {
        if (currentId && nextEntries.some((entry) => entry.job.id === currentId)) {
          return currentId;
        }
        const reviewFirst = nextEntries.find((entry) => isAwaitingAgentReview(entry.job));
        return reviewFirst?.job?.id ?? nextEntries[0]?.job?.id ?? null;
      });
      setMessage(null);
    } catch (error) {
      setMessage({ type: 'error', text: readableError(error) });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTeamJobs();
  }, [loadTeamJobs]);

  const counters = useMemo(
    () => fieldAgentReviewCounters(entries),
    [entries],
  );

  const visibleEntries = useMemo(() => {
    if (filter === 'review') {
      return entries.filter((entry) => isAwaitingAgentReview(entry.job));
    }
    if (filter === 'active') {
      return entries.filter((entry) => !isAwaitingAgentReview(entry.job));
    }
    return entries;
  }, [entries, filter]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.job.id === selectedJobId) ?? null,
    [entries, selectedJobId],
  );

  const selectedJob = selectedEntry?.job ?? null;
  const selectedTechnician = selectedEntry?.assigned_technician ?? null;
  const awaitingReview = isAwaitingAgentReview(selectedJob);

  const validateJob = async () => {
    if (!selectedJob || !awaitingReview || decisionPending) {
      return;
    }

    if (!window.confirm(`Valider et clôturer ${selectedJob.job_number || `#${selectedJob.id}`} ?`)) {
      return;
    }

    setDecisionPending(true);
    setMessage(null);
    try {
      await apiClient.post(`/orienteur-agent/me/jobs/${selectedJob.id}/validate`);
      setMessage({ type: 'success', text: 'Intervention validée et clôturée.' });
      setReturnReason('');
      await loadTeamJobs({ quiet: true });
    } catch (error) {
      setMessage({ type: 'error', text: readableError(error) });
    } finally {
      setDecisionPending(false);
    }
  };

  const returnJob = async () => {
    if (!selectedJob || !awaitingReview || decisionPending) {
      return;
    }

    const reason = returnReason.trim();
    if (!reason) {
      setMessage({ type: 'error', text: 'Le motif de retour est obligatoire.' });
      return;
    }

    setDecisionPending(true);
    setMessage(null);
    try {
      await apiClient.post(
        `/orienteur-agent/me/jobs/${selectedJob.id}/return`,
        { reason },
      );
      setMessage({ type: 'success', text: 'Intervention retournée au technicien avec le motif indiqué.' });
      setReturnReason('');
      await loadTeamJobs({ quiet: true });
    } catch (error) {
      setMessage({ type: 'error', text: readableError(error) });
    } finally {
      setDecisionPending(false);
    }
  };

  return (
    <main className="fa-review-page" data-testid="field-agent-interventions">
      <header className="fa-review-header">
        <div>
          <span className="fa-review-eyebrow">GoVector · Agent terrain</span>
          <h1>Contrôle des interventions</h1>
          <p>Votre équipe uniquement. Contrôlez le dossier terrain, retournez-le avec un motif ou validez la clôture.</p>
        </div>
        <button
          type="button"
          className="fa-review-refresh"
          onClick={() => loadTeamJobs({ quiet: true })}
          disabled={refreshing || decisionPending}
        >
          {refreshing ? 'Actualisation…' : 'Actualiser'}
        </button>
      </header>

      <section className="fa-review-kpis" aria-label="Résumé équipe">
        <button
          type="button"
          className={filter === 'all' ? 'is-active' : ''}
          onClick={() => setFilter('all')}
        >
          <span>Total équipe</span>
          <strong>{counters.total}</strong>
        </button>
        <button
          type="button"
          className={filter === 'review' ? 'is-active is-review' : 'is-review'}
          onClick={() => setFilter('review')}
        >
          <span>À contrôler</span>
          <strong>{counters.awaitingReview}</strong>
        </button>
        <button
          type="button"
          className={filter === 'active' ? 'is-active' : ''}
          onClick={() => setFilter('active')}
        >
          <span>En cours équipe</span>
          <strong>{counters.active}</strong>
        </button>
      </section>

      {message ? (
        <div className={`fa-review-message fa-review-message--${message.type}`} role="status">
          {message.text}
        </div>
      ) : null}

      {loading ? (
        <div className="fa-review-empty">Chargement des interventions de votre équipe…</div>
      ) : entries.length === 0 ? (
        <div className="fa-review-empty">
          <strong>Aucune intervention active dans votre équipe.</strong>
          <span>Les nouveaux dossiers apparaîtront ici dès qu’un technicien de votre équipe sera affecté.</span>
        </div>
      ) : (
        <div className="fa-review-layout">
          <section className="fa-review-list" aria-label="Interventions équipe">
            <div className="fa-review-list-title">
              <strong>{filter === 'review' ? 'À contrôler' : filter === 'active' ? 'En cours' : 'Interventions équipe'}</strong>
              <span>{visibleEntries.length}</span>
            </div>

            {visibleEntries.length === 0 ? (
              <div className="fa-review-list-empty">Aucune intervention dans ce filtre.</div>
            ) : visibleEntries.map((entry) => {
              const job = entry.job;
              const selected = job.id === selectedJobId;
              const review = isAwaitingAgentReview(job);
              return (
                <button
                  type="button"
                  key={job.id}
                  className={`fa-review-card${selected ? ' is-selected' : ''}${review ? ' is-awaiting' : ''}`}
                  onClick={() => {
                    setSelectedJobId(job.id);
                    setReturnReason('');
                    setMessage(null);
                  }}
                >
                  <div className="fa-review-card-topline">
                    <strong>{job.job_number || `Intervention #${job.id}`}</strong>
                    <span>{fieldAgentStatusLabel(job.status)}</span>
                  </div>
                  <div className="fa-review-card-client">{job.customer_name || 'Client non renseigné'}</div>
                  <div className="fa-review-card-meta">
                    <span>{entry.assigned_technician?.name || 'Technicien'}</span>
                    <span>{formatDateTime(job.scheduled_date)}</span>
                  </div>
                </button>
              );
            })}
          </section>

          <section className="fa-review-detail" aria-live="polite">
            {!selectedJob ? (
              <div className="fa-review-empty">Sélectionnez une intervention.</div>
            ) : (
              <>
                <div className="fa-review-detail-header">
                  <div>
                    <span className={`fa-review-status${awaitingReview ? ' is-awaiting' : ''}`}>
                      {fieldAgentStatusLabel(selectedJob.status)}
                    </span>
                    <h2>{selectedJob.job_number || `Intervention #${selectedJob.id}`}</h2>
                    <p>{selectedJob.customer_name || 'Client non renseigné'}</p>
                  </div>
                  <div className="fa-review-technician">
                    <span>Technicien</span>
                    <strong>{selectedTechnician?.name || '—'}</strong>
                    <small>{selectedTechnician?.employee_id || ''}</small>
                  </div>
                </div>

                <div className="fa-review-sections">
                  <article>
                    <h3>Planning & site</h3>
                    <DataRow label="Créneau" value={`${formatDateTime(selectedJob.scheduled_date)}${selectedJob.time_slot_start || selectedJob.time_slot_end ? ` · ${selectedJob.time_slot_start || '—'}–${selectedJob.time_slot_end || '—'}` : ''}`} />
                    <DataRow label="Adresse" value={selectedJob.service_address} />
                    <DataRow label="Ville" value={selectedJob.service_city} />
                    <DataRow label="Secteur" value={selectedJob.sector_name || selectedJob.sector_raw || selectedJob.route_criteria} />
                    <DataRow label="GPS" value={selectedJob.gps_latitude != null && selectedJob.gps_longitude != null ? `${selectedJob.gps_latitude}, ${selectedJob.gps_longitude}` : null} />
                  </article>

                  <article>
                    <h3>Réseau</h3>
                    <DataRow label="Opérateur" value={selectedJob.operator} />
                    <DataRow label="NRO" value={selectedJob.nro} />
                    <DataRow label="SRO" value={selectedJob.sro} />
                    <DataRow label="PBO" value={selectedJob.pbo} />
                    <DataRow label="PTO" value={selectedJob.pto} />
                    <DataRow label="Splitter" value={selectedJob.splitter} />
                  </article>

                  <article>
                    <h3>Câble & mesures</h3>
                    <DataRow label="Type câble" value={selectedJob.type_cable} />
                    <DataRow label="Longueur" value={selectedJob.cable_length_m != null ? `${selectedJob.cable_length_m} m` : null} />
                    <DataRow label="Puissance optique" value={selectedJob.optical_power_dbm != null ? `${selectedJob.optical_power_dbm} dBm` : null} />
                    <DataRow label="Fibres" value={selectedJob.nombre_fibres} />
                    <DataRow label="Boîte raccordement" value={selectedJob.boite_raccordement} />
                  </article>

                  <article>
                    <h3>Compte rendu</h3>
                    <DataRow label="Description" value={selectedJob.description} />
                    <DataRow label="Notes" value={selectedJob.notes} />
                    <DataRow label="Consignes" value={selectedJob.special_instructions} />
                    <DataRow label="Commentaire bureau" value={selectedJob.coordinator_comments} />
                  </article>
                </div>

                {awaitingReview ? (
                  <div className="fa-review-decision">
                    <div className="fa-review-decision-copy">
                      <strong>Décision Agent</strong>
                      <span>La validation clôture définitivement l’intervention. Un retour exige un motif et remet le dossier au technicien affecté.</span>
                    </div>
                    <textarea
                      value={returnReason}
                      onChange={(event) => setReturnReason(event.target.value)}
                      maxLength={1000}
                      placeholder="Motif du retour au technicien…"
                      aria-label="Motif du retour"
                      disabled={decisionPending}
                    />
                    <div className="fa-review-actions">
                      <button
                        type="button"
                        className="fa-review-return"
                        onClick={returnJob}
                        disabled={decisionPending || !returnReason.trim()}
                      >
                        Retourner au technicien
                      </button>
                      <button
                        type="button"
                        className="fa-review-validate"
                        onClick={validateJob}
                        disabled={decisionPending}
                      >
                        {decisionPending ? 'Traitement…' : 'Valider et clôturer'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="fa-review-waiting-note">
                    Ce dossier n’est pas encore soumis au contrôle Agent. Vous pouvez suivre son avancement, mais aucune décision finale n’est disponible.
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
