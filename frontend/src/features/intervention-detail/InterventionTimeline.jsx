import {
  asRecords,
  formatDateTime,
  formatLabel,
  getAssignedTechnician,
  getStatusMeta,
  normalizeStatus,
  text,
} from './interventionDetailUtils';

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
    job?.scheduled_date ||
    job?.appointment_date ||
    job?.date;
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
      description: text(
        job?.team,
        'Équipe non renseignée.',
      ),
    });
  }

  activities.push({
    id: 'snapshot-status',
    snapshot_label: `État actuel · ${statusMeta.label}`,
    snapshot_tone: statusMeta.tone,
    created_at:
      job?.updated_at ||
      job?.completed_at ||
      job?.started_at,
    description:
      STATUS_DESCRIPTIONS[normalizedStatus] ||
      'Statut actuel issu de la fiche intervention.',
  });

  return activities;
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
    safeActivities.length > 0
      ? safeActivities
      : snapshotActivities;
  const usingSnapshot =
    safeActivities.length === 0 &&
    snapshotActivities.length > 0;

  return (
    <section className="intervention-detail-card intervention-detail-timeline-card">
      <header className="intervention-detail-card-header">
        <div>
          <span>Traçabilité</span>
          <h2>Timeline</h2>
        </div>

        <span className="intervention-detail-card-count">
          {usingSnapshot
            ? 'Synthèse'
            : safeActivities.length}
        </span>
      </header>

      <div className="intervention-detail-card-body intervention-detail-timeline-body">
        {error ? (
          <div className="intervention-detail-inline-error" role="alert">
            <div>
              <strong>Timeline indisponible</strong>
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
            Chargement de la timeline…
          </div>
        ) : null}

        {usingSnapshot ? (
          <p className="intervention-detail-timeline-note">
            Repères factuels dérivés des champs actuels. Ils ne remplacent
            pas l’historique serveur.
          </p>
        ) : null}

        {displayedActivities.length > 0 ? (
          <ol className="intervention-detail-timeline">
            {displayedActivities.map((activity, index) => {
              const meta = getActivityMeta(activity);
              const description = getDescription(activity);
              const actor = getActor(activity);

              return (
                <li
                  className={`intervention-detail-timeline-item intervention-detail-timeline-item--${meta.tone}`}
                  key={getActivityKey(activity, index)}
                >
                  <span
                    className="intervention-detail-timeline-dot"
                    aria-hidden="true"
                  />

                  <div className="intervention-detail-timeline-content">
                    <div className="intervention-detail-timeline-title-row">
                      <strong>{meta.label}</strong>
                      <time>
                        {formatDateTime(
                          activity?.created_at ||
                            activity?.timestamp ||
                            activity?.date,
                        )}
                      </time>
                    </div>

                    {description ? <p>{description}</p> : null}

                    {actor ? (
                      <span className="intervention-detail-timeline-actor">
                        {actor}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
