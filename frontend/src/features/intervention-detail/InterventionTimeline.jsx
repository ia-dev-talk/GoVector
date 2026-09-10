import {
  asRecords,
  formatDateTime,
  formatLabel,
  getAssignedTechnician,
  getStatusMeta,
  normalizeStatus,
  text,
} from './interventionDetailUtils';
import '../../styles/intervention-traceability-v2.css';

const ACTION_META = {
  created: { label: 'Intervention créée', tone: 'success' },
  updated: { label: 'Intervention modifiée', tone: 'info' },
  assigned: { label: 'Affectation', tone: 'info' },
  reassigned: { label: 'Réaffectation', tone: 'info' },
  unassigned: { label: 'Désaffectation', tone: 'warning' },
  started: { label: 'Intervention démarrée', tone: 'purple' },
  status_changed: { label: 'Changement de statut', tone: 'info' },
  completed: { label: 'Intervention terminée', tone: 'success' },
  cancelled: { label: 'Intervention annulée', tone: 'danger' },
  failed: { label: 'Échec déclaré', tone: 'danger' },
  postponed: { label: 'Intervention reportée', tone: 'warning' },
  suspended: { label: 'Intervention suspendue', tone: 'muted' },
  stock_consumed: { label: 'Stock consommé', tone: 'info' },
};

const STATUS_DESCRIPTIONS = {
  pending: 'En attente d’une affectation.',
  assigned: 'En attente du démarrage terrain.',
  in_progress: 'Exécution terrain en cours.',
  en_intervention: 'Exécution terrain en cours.',
  work_in_progress: 'Exécution terrain en cours.',
  completed: 'Intervention clôturée.',
  cancelled: 'Intervention annulée.',
  failed: 'Intervention déclarée en échec.',
  on_hold: 'Intervention suspendue.',
  postponed: 'Intervention reportée.',
};

function getActivityMeta(activity) {
  if (activity?.snapshot_label) {
    return {
      label: activity.snapshot_label,
      tone: activity.snapshot_tone || 'muted',
    };
  }
  const action = normalizeStatus(
    activity?.action ||
      activity?.type ||
      activity?.event_type ||
      activity?.status,
  );
  return ACTION_META[action] || {
    label: formatLabel(action, 'Activité enregistrée'),
    tone: 'muted',
  };
}

function getDescription(activity) {
  return (
    text(activity?.description) ||
    text(activity?.message) ||
    text(activity?.details) ||
    text(activity?.comment) ||
    ''
  );
}

function getActor(activity) {
  return (
    text(activity?.actor_name) ||
    text(activity?.user_name) ||
    text(activity?.created_by_name) ||
    (activity?.created_by ? `Utilisateur #${activity.created_by}` : '')
  );
}

function getActivityKey(activity, index) {
  return (
    text(activity?.id) ||
    text(activity?.uuid) ||
    text(activity?.created_at) ||
    `activity-${index}`
  );
}

function buildSnapshotActivities(job) {
  const activities = [];
  const scheduledAt =
    job?.scheduled_date || job?.appointment_date || job?.date;
  const assignedTechnician = getAssignedTechnician(job);
  const statusMeta = getStatusMeta(job?.status);
  const normalizedStatus = normalizeStatus(job?.status);
  const slot =
    job?.time_slot_start || job?.time_slot_end
      ? `${text(job?.time_slot_start, '—')} – ${text(job?.time_slot_end, '—')}`
      : '';

  if (scheduledAt) {
    activities.push({
      id: 'snapshot-planned',
      snapshot_label: 'Intervention planifiée',
      snapshot_tone: 'info',
      created_at: scheduledAt,
      description: slot
        ? `Créneau prévu : ${slot}.`
        : 'Date planifiée enregistrée dans la fiche.',
    });
  }

  if (assignedTechnician !== 'Non affecté') {
    activities.push({
      id: 'snapshot-assigned',
      snapshot_label: `Affectée à ${assignedTechnician}`,
      snapshot_tone: 'info',
      created_at: job?.assigned_at,
      description: text(job?.team, 'Équipe non renseignée.'),
    });
  }

  activities.push({
    id: 'snapshot-status',
    snapshot_label: `État actuel · ${statusMeta.label}`,
    snapshot_tone: statusMeta.tone,
    created_at: job?.updated_at || job?.completed_at || job?.started_at,
    description:
      STATUS_DESCRIPTIONS[normalizedStatus] ||
      'Statut actuel issu de la fiche intervention.',
  });

  return activities;
}

function SourceBanner({ snapshot }) {
  return (
    <div
      className={[
        'intervention-trace-source',
        snapshot
          ? 'intervention-trace-source--snapshot'
          : 'intervention-trace-source--server',
      ].join(' ')}
    >
      <span className="intervention-trace-source-icon" aria-hidden="true">
        {snapshot ? '≈' : '✓'}
      </span>
      <span>
        <strong>
          {snapshot ? 'Synthèse de la fiche' : 'Historique serveur'}
        </strong>
        <small>
          {snapshot
            ? 'Repères reconstruits à partir des champs actuels. À lire comme contexte, pas comme journal d’audit.'
            : 'Événements persistés et ordonnés par BlueVector.'}
        </small>
      </span>
    </div>
  );
}

export default function InterventionTimeline({
  job,
  activities,
  loading = false,
  error = '',
  onRetry,
}) {
  const safeActivities = asRecords(activities);
  const snapshotActivities =
    safeActivities.length === 0 && !loading
      ? buildSnapshotActivities(job)
      : [];
  const displayedActivities =
    safeActivities.length > 0 ? safeActivities : snapshotActivities;
  const usingSnapshot =
    safeActivities.length === 0 && snapshotActivities.length > 0;

  return (
    <section className="intervention-detail-card intervention-detail-timeline-card intervention-trace-card">
      <header className="intervention-detail-card-header intervention-trace-header">
        <div>
          <span>Traçabilité</span>
          <h2>Historique de l’intervention</h2>
        </div>
        <span
          className={[
            'intervention-detail-card-count',
            usingSnapshot ? 'intervention-trace-count--snapshot' : '',
          ].filter(Boolean).join(' ')}
        >
          {usingSnapshot ? 'Synthèse' : `${safeActivities.length} év.`}
        </span>
      </header>

      <div className="intervention-detail-card-body intervention-detail-timeline-body intervention-trace-body">
        {error ? (
          <div className="intervention-detail-inline-error intervention-trace-error" role="alert">
            <div>
              <strong>Historique serveur indisponible</strong>
              <span>{error}</span>
            </div>
            {typeof onRetry === 'function' ? (
              <button
                type="button"
                className="intervention-detail-text-button"
                onClick={onRetry}
                disabled={loading}
              >
                Réessayer
              </button>
            ) : null}
          </div>
        ) : null}

        {loading && safeActivities.length === 0 ? (
          <div className="intervention-detail-loading-state">
            Chargement de l’historique…
          </div>
        ) : null}

        {!loading && displayedActivities.length > 0 ? (
          <SourceBanner snapshot={usingSnapshot} />
        ) : null}

        {displayedActivities.length > 0 ? (
          <ol className="intervention-detail-timeline intervention-trace-list">
            {displayedActivities.map((activity, index) => {
              const meta = getActivityMeta(activity);
              const description = getDescription(activity);
              const actor = getActor(activity);
              const timestamp =
                activity?.created_at ||
                activity?.timestamp ||
                activity?.date;

              return (
                <li
                  className={`intervention-detail-timeline-item intervention-detail-timeline-item--${meta.tone} intervention-trace-item`}
                  key={getActivityKey(activity, index)}
                >
                  <span
                    className="intervention-detail-timeline-dot intervention-trace-dot"
                    aria-hidden="true"
                  />
                  <div className="intervention-detail-timeline-content intervention-trace-content">
                    <div className="intervention-detail-timeline-title-row intervention-trace-title-row">
                      <strong>{meta.label}</strong>
                      <time>{formatDateTime(timestamp)}</time>
                    </div>
                    {description ? <p>{description}</p> : null}
                    {actor ? (
                      <span className="intervention-detail-timeline-actor intervention-trace-actor">
                        Par {actor}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : !loading ? (
          <div className="intervention-detail-empty-state intervention-trace-empty">
            <strong>Aucun événement disponible</strong>
            <span>La traçabilité apparaîtra ici dès qu’un événement sera enregistré.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
