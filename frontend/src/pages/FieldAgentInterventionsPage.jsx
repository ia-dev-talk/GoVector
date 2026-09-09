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

function compactPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload == null ? '—' : String(payload);
  }

  const preferredKeys = [
    'type_cable',
    'cable_type',
    'cable_code',
    'pose_type',
    'type_pose',
    'metric_start',
    'metric_end',
    'metrique_depart',
    'metrique_arrivee',
    'length_m',
    'computed_length_m',
    'value',
    'unit',
    'latitude',
    'longitude',
    'note',
    'comment',
  ];

  const parts = preferredKeys
    .filter((key) => payload[key] !== null && payload[key] !== undefined && payload[key] !== '')
    .slice(0, 6)
    .map((key) => `${key}: ${String(payload[key])}`);

  if (parts.length) {
    return parts.join(' · ');
  }

  try {
    const serialized = JSON.stringify(payload);
    return serialized.length > 180 ? `${serialized.slice(0, 177)}…` : serialized;
  } catch {
    return 'Donnée terrain enregistrée';
  }
}

function mediaGpsLabel(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const latitude = metadata.latitude ?? metadata.lat;
  const longitude = metadata.longitude ?? metadata.lon ?? metadata.lng;
  if (latitude == null || longitude == null) {
    return null;
  }
  const accuracy = metadata.accuracy ?? metadata.accuracy_m;
  return accuracy == null
    ? `${latitude}, ${longitude}`
    : `${latitude}, ${longitude} · ±${accuracy} m`;
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
  const [fieldRecord, setFieldRecord] = useState(null);
  const [stockContext, setStockContext] = useState(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState('');

  const loadTeamJobs = useCallback(async ({ quiet = false, preserveMessage = false } = {}) => {
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
      if (!preserveMessage) {
        setMessage(null);
      }
    } catch (error) {
      setMessage({ type: 'error', text: readableError(error) });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadReviewContext = useCallback(async (jobId) => {
    if (!jobId) {
      setFieldRecord(null);
      setStockContext(null);
      setContextError('');
      return;
    }

    setContextLoading(true);
    setContextError('');
    try {
      const [recordResponse, stockResponse] = await Promise.all([
        apiClient.get(`/orienteur-agent/me/jobs/${jobId}/field-record`),
        apiClient.get(`/orienteur-agent/me/jobs/${jobId}/stock-context`),
      ]);
      setFieldRecord(recordResponse.data ?? null);
      setStockContext(stockResponse.data ?? null);
    } catch (error) {
      setFieldRecord(null);
      setStockContext(null);
      setContextError(readableError(error));
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTeamJobs();
  }, [loadTeamJobs]);

  useEffect(() => {
    loadReviewContext(selectedJobId);
  }, [loadReviewContext, selectedJobId]);

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
  const technicianMedia = Array.isArray(fieldRecord?.technician_media)
    ? fieldRecord.technician_media
    : [];
  const fieldActions = Array.isArray(fieldRecord?.field_actions)
    ? fieldRecord.field_actions
    : [];
  const visits = Array.isArray(fieldRecord?.visits) ? fieldRecord.visits : [];
  const currentVisit = visits.find((visit) => visit?.is_current) ?? visits.at(-1) ?? null;
  const vehicleStock = Array.isArray(stockContext?.vehicle_stock)
    ? stockContext.vehicle_stock
    : [];

  const openProtectedAsset = async (path, fallbackName) => {
    try {
      const response = await apiClient.get(path, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fallbackName || 'preuve-terrain';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      window.setTimeout(() => window.URL.revokeObjectURL(url), 60000);
    } catch (error) {
      setMessage({ type: 'error', text: readableError(error) });
    }
  };

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
      await loadTeamJobs({ quiet: true, preserveMessage: true });
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
      await loadTeamJobs({ quiet: true, preserveMessage: true });
      await loadReviewContext(selectedJob.id);
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
          onClick={async () => {
            await loadTeamJobs({ quiet: true });
            await loadReviewContext(selectedJobId);
          }}
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

                <div className="fa-review-context-heading">
                  <div>
                    <strong>Preuves & contrôle terrain</strong>
                    <span>Données issues du même dossier utilisé par le technicien, limitées à votre équipe.</span>
                  </div>
                  {contextLoading ? <span>Chargement…</span> : null}
                </div>

                {contextError ? (
                  <div className="fa-review-message fa-review-message--error">{contextError}</div>
                ) : null}

                {!contextLoading && !contextError ? (
                  <div className="fa-review-proof-grid">
                    <article className="fa-review-proof-card">
                      <h3>Photos & médias <span>{technicianMedia.length}</span></h3>
                      {technicianMedia.length === 0 ? (
                        <p>Aucun média terrain enregistré.</p>
                      ) : (
                        <div className="fa-review-proof-list">
                          {technicianMedia.slice(0, 8).map((media) => (
                            <div className="fa-review-proof-item" key={media.media_id}>
                              <div>
                                <strong>{media.filename || media.kind || 'Preuve terrain'}</strong>
                                <span>{media.kind || 'media'} · {formatDateTime(media.created_at)}</span>
                                {mediaGpsLabel(media.metadata) ? <small>GPS {mediaGpsLabel(media.metadata)}</small> : null}
                              </div>
                              <button
                                type="button"
                                onClick={() => openProtectedAsset(
                                  `/orienteur-agent/me/jobs/${selectedJob.id}/media/${media.media_id}/download`,
                                  media.filename,
                                )}
                              >
                                Ouvrir
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>

                    <article className="fa-review-proof-card">
                      <h3>Actions terrain <span>{fieldActions.length}</span></h3>
                      {fieldActions.length === 0 ? (
                        <p>Aucune action terrain enregistrée.</p>
                      ) : (
                        <div className="fa-review-proof-list">
                          {fieldActions.slice(0, 10).map((action) => (
                            <div className="fa-review-proof-item is-block" key={action.id || action.event_id}>
                              <div>
                                <strong>{action.type || 'Action terrain'}</strong>
                                <span>{formatDateTime(action.occurred_at)} · {action.technician_name || selectedTechnician?.name || 'Technicien'}</span>
                                <small>{compactPayload(action.payload)}</small>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>

                    <article className="fa-review-proof-card">
                      <h3>Passage & GPS</h3>
                      <DataRow label="État passage" value={currentVisit?.status_label || fieldAgentStatusLabel(currentVisit?.status)} />
                      <DataRow label="Acceptée" value={currentVisit?.accepted_at ? formatDateTime(currentVisit.accepted_at) : null} />
                      <DataRow label="Départ" value={currentVisit?.started_at ? formatDateTime(currentVisit.started_at) : null} />
                      <DataRow label="Sur site" value={currentVisit?.arrived_at ? formatDateTime(currentVisit.arrived_at) : null} />
                      <DataRow label="Travail démarré" value={currentVisit?.work_started_at ? formatDateTime(currentVisit.work_started_at) : null} />
                      <DataRow
                        label="GPS terrain"
                        value={fieldRecord?.field_reference_location?.latitude != null && fieldRecord?.field_reference_location?.longitude != null
                          ? `${fieldRecord.field_reference_location.latitude}, ${fieldRecord.field_reference_location.longitude}${fieldRecord.field_reference_location.accuracy_m != null ? ` · ±${fieldRecord.field_reference_location.accuracy_m} m` : ''}`
                          : null}
                      />
                    </article>

                    <article className="fa-review-proof-card">
                      <h3>Stock technicien <span>{vehicleStock.length}</span></h3>
                      <DataRow label="Lignes connues" value={stockContext?.stock_summary?.line_count} />
                      <DataRow label="Total connu" value={stockContext?.stock_summary?.total_units} />
                      <DataRow label="Disponible" value={stockContext?.stock_summary?.available_units} />
                      {vehicleStock.length ? (
                        <div className="fa-review-stock-lines">
                          {vehicleStock.slice(0, 8).map((row) => (
                            <div key={row.item_id}>
                              <span>{row.reference || row.label || `Article #${row.item_id}`}</span>
                              <strong>{row.available_quantity ?? row.quantity ?? 0} {row.unit || ''}</strong>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p>Stock connu à 0 / non renseigné. Cela ne bloque pas la consommation constatée sur le terrain.</p>
                      )}
                    </article>
                  </div>
                ) : null}

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
                        disabled={decisionPending || contextLoading || Boolean(contextError)}
                      >
                        {decisionPending ? 'Traitement…' : 'Valider et clôturer'}
                      </button>
                    </div>
                    {contextError ? (
                      <small>La validation reste désactivée tant que le dossier de contrôle ne peut pas être chargé.</small>
                    ) : null}
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
