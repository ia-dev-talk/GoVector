/**
 * AlertsPanel — priorités opérationnelles du cockpit BlueVector.
 *
 * Le composant travaille uniquement sur les interventions déjà chargées.
 * Il ne modifie aucune donnée et n'invente aucune action d'affectation :
 * un clic ouvre la fiche correspondante dans l'espace Interventions.
 */

import {
  memo,
  useCallback,
  useMemo,
} from 'react';

import {
  getJobTypeLabel,
} from '../../lib/job-types';

const MAX_PRIORITIES = 6;

const TERMINAL_STATUSES = new Set([
  'completed',
  'cancelled',
  'failed',
]);

const STATUS_LABELS = Object.freeze({
  pending: 'En attente',
  assigned: 'Affectée',
  en_route: 'En route',
  on_site: 'Sur site',
  work_in_progress:
    'Travail en cours',
  in_progress: 'En cours',
  installation_done:
    'Installation terminée',
  client_validation:
    'Validation client',
  en_attente_validation:
    'En attente de validation',
  completed: 'Terminée',
  cancelled: 'Annulée',
  on_hold: 'En attente',
  failed: 'Échec',
  client_absent:
    'Client absent',
  postponed: 'Reportée',
  suspended: 'Suspendue',
});

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function text(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

function normalizeStatus(value) {
  return text(value)
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      '',
    )
    .toLocaleLowerCase('fr')
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function normalizePriority(value) {
  return text(value)
    .toLocaleUpperCase('fr');
}

function positiveJobId(value) {
  return (
    Number.isInteger(value) &&
    value > 0
      ? value
      : null
  );
}

function jobId(job) {
  return positiveJobId(job?.id);
}

function isUrgent(job) {
  return (
    normalizePriority(
      job?.priority,
    ) === 'URGENT'
  );
}

function isTerminal(job) {
  return TERMINAL_STATUSES.has(
    normalizeStatus(job?.status),
  );
}

function hasAssignment(job) {
  const identifier =
    job?.assigned_tech_id ??
    job?.assigned_technician_id ??
    job?.technician_id ??
    job?.assignment
      ?.technician_id;

  return text(identifier) !== '';
}

function jobSector(job) {
  return text(
    job?.sector_name ??
      job?.sector_raw ??
      job?.route_criteria ??
      job?.sector,
  );
}

function statusLabel(value) {
  const normalized =
    normalizeStatus(value);

  if (!normalized) {
    return '';
  }

  return (
    STATUS_LABELS[normalized] ||
    normalized
      .replace(/_/g, ' ')
      .replace(
        /^./,
        (character) =>
          character.toUpperCase(),
      )
  );
}

function jobTypeLabel(value) {
  const fallback = text(value)
    .replace(/_/g, ' ')
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );

  return getJobTypeLabel(
    value,
    fallback,
  );
}

function jobTitle(job) {
  return (
    text(job?.customer_name) ||
    text(job?.job_number) ||
    (
      jobId(job)
        ? `Intervention #${jobId(
            job,
          )}`
        : 'Intervention'
    )
  );
}

function uniqueDetails(values) {
  const result = [];
  const known = new Set();

  values.forEach((value) => {
    const normalized =
      text(value);

    if (
      !normalized ||
      known.has(normalized)
    ) {
      return;
    }

    known.add(normalized);
    result.push(normalized);
  });

  return result;
}

function buildPriority(
  job,
  sourceIndex,
  canAssign,
) {
  const identifier = jobId(job);

  if (
    identifier === null ||
    isTerminal(job)
  ) {
    return null;
  }

  const urgent = isUrgent(job);
  const unassigned =
    !hasAssignment(job);

  let rank;
  let category;
  let icon;
  let color;

  if (urgent && unassigned) {
    rank = 1;
    category =
      'Urgente et non affectée';
    icon = '🚨';
    color =
      'var(--color-danger)';
  } else if (urgent) {
    rank = 2;
    category = 'Urgente';
    icon = '🚨';
    color =
      'var(--color-danger)';
  } else if (unassigned) {
    rank = 3;
    category = 'Non affectée';
    icon = '📋';
    color =
      'var(--color-warning)';
  } else {
    return null;
  }

  const details = uniqueDetails([
    category,
    text(job?.job_number),
    jobTypeLabel(job?.job_type),
    jobSector(job),
    text(job?.operator),
    statusLabel(job?.status),
  ]);

  return {
    jobId: identifier,
    sourceIndex,
    rank,
    icon,
    color,
    title: jobTitle(job),
    description:
      details.join(' · '),
    action:
      unassigned && canAssign
        ? 'Ouvrir pour affecter'
        : 'Voir',
  };
}

const PriorityItem = memo(
  function PriorityItem({
    priority,
    onActivate,
  }) {
    const actionable =
      typeof onActivate ===
      'function';

    const accessibleLabel = [
      priority.action,
      priority.title,
      priority.description,
    ]
      .filter(Boolean)
      .join('. ');

    if (!actionable) {
      return (
        <div
          className="cockpit-alert-item"
          style={{
            '--alert-color':
              priority.color,
          }}
        >
          <span
            className="cockpit-alert-icon"
            aria-hidden="true"
          >
            {priority.icon}
          </span>

          <div className="cockpit-alert-content">
            <div className="cockpit-alert-title-row">
              <span className="cockpit-alert-title">
                {priority.title}
              </span>
            </div>

            <div className="cockpit-alert-meta-row">
              <span className="cockpit-alert-desc">
                {priority.description}
              </span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <button
        type="button"
        role="button"
        className="cockpit-alert-item"
        style={{
          '--alert-color':
            priority.color,
          width: '100%',
          borderTop: 0,
          borderRight: 0,
          borderBottom: 0,
          textAlign: 'left',
          fontFamily:
            'var(--font-family)',
        }}
        aria-label={
          accessibleLabel
        }
        onClick={onActivate}
      >
        <span
          className="cockpit-alert-icon"
          aria-hidden="true"
        >
          {priority.icon}
        </span>

        <span className="cockpit-alert-content">
          <span className="cockpit-alert-title-row">
            <span className="cockpit-alert-title">
              {priority.title}
            </span>
          </span>

          <span className="cockpit-alert-meta-row">
            <span className="cockpit-alert-desc">
              {priority.description}
            </span>
          </span>
        </span>

        <span
          className="cockpit-alert-action"
          aria-hidden="true"
        >
          {priority.action}
        </span>
      </button>
    );
  },
);

const AlertsPanel = memo(
  function AlertsPanel({
    jobs = [],
    onNavigate,
    canAssign = false,
  }) {
    const hasJobsArray =
      Array.isArray(jobs);

    const safeJobs = useMemo(
      () => (hasJobsArray ? jobs : []),
      [hasJobsArray, jobs],
    );

    const {
      validJobCount,
      candidateCount,
      displayedPriorities,
    } = useMemo(() => {
      const seenJobIds =
        new Set();

      const candidates = [];
      let validCount = 0;

      safeJobs.forEach(
        (job, sourceIndex) => {
          if (!isRecord(job)) {
            return;
          }

          const identifier =
            jobId(job);

          if (
            identifier === null ||
            seenJobIds.has(
              identifier,
            )
          ) {
            return;
          }

          seenJobIds.add(
            identifier,
          );

          validCount += 1;

          const priority =
            buildPriority(
              job,
              sourceIndex,
              canAssign === true,
            );

          if (priority) {
            candidates.push(
              priority,
            );
          }
        },
      );

      candidates.sort(
        (first, second) =>
          first.rank -
            second.rank ||
          first.sourceIndex -
            second.sourceIndex,
      );

      return {
        validJobCount:
          validCount,
        candidateCount:
          candidates.length,
        displayedPriorities:
          candidates.slice(
            0,
            MAX_PRIORITIES,
          ),
      };
    }, [
      canAssign,
      safeJobs,
    ]);

    const handlePriorityClick =
      useCallback(
        (identifier) => {
          if (
            typeof onNavigate !==
            'function'
          ) {
            return;
          }

          const payload = {
            id: identifier,
          };

          /*
           * Le payload direct est la source principale.
           * sessionStorage conserve la compatibilité avec
           * les anciens routeurs qui perdaient le second argument.
           */
          try {
            sessionStorage.setItem(
              'cockpit_filter',
              JSON.stringify(
                payload,
              ),
            );
          } catch {
            // Le payload direct reste disponible.
          }

          onNavigate(
            'interventions',
            payload,
          );
        },
        [onNavigate],
      );

    const canNavigate =
      typeof onNavigate ===
      'function';

    const displayedCount =
      displayedPriorities.length;

    return (
      <div
        className="cockpit-alerts"
        aria-label="Priorités à traiter"
      >
        <div className="cockpit-alerts-header">
          <h3>
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M8 1.5 1.5 13.5h13L8 1.5Z" />
              <path d="M8 6v3M8 11.5v.5" />
            </svg>

            Priorités à traiter
          </h3>

          {hasJobsArray && (
            <span
              className="cockpit-alerts-count"
              aria-label={`${candidateCount} priorité${
                candidateCount > 1
                  ? 's'
                  : ''
              } détectée${
                candidateCount > 1
                  ? 's'
                  : ''
              }`}
            >
              {candidateCount}
            </span>
          )}
        </div>

        {hasJobsArray &&
          validJobCount > 0 &&
          candidateCount > 0 && (
            <div className="cockpit-alerts-section-header">
              <span>
                Parmi les interventions chargées
              </span>

              {candidateCount >
                displayedCount && (
                <span>
                  {displayedCount}{' '}
                  affichées sur{' '}
                  {candidateCount}
                </span>
              )}
            </div>
          )}

        <div className="cockpit-alerts-body">
          {!hasJobsArray && (
            <div
              className="cockpit-alerts-empty"
              role="status"
            >
              Données d’interventions indisponibles.
            </div>
          )}

          {hasJobsArray &&
            safeJobs.length === 0 && (
              <div
                className="cockpit-alerts-empty"
                role="status"
              >
                Aucune intervention chargée.
              </div>
            )}

          {hasJobsArray &&
            safeJobs.length > 0 &&
            validJobCount === 0 && (
              <div
                className="cockpit-alerts-empty"
                role="status"
              >
                Aucune intervention exploitable dans les données chargées.
              </div>
            )}

          {hasJobsArray &&
            validJobCount > 0 &&
            candidateCount === 0 && (
              <div
                className="cockpit-alerts-empty"
                role="status"
              >
                Aucune intervention urgente ou non affectée à traiter.
              </div>
            )}

          {displayedPriorities.map(
            (priority) => (
              <PriorityItem
                key={
                  priority.jobId
                }
                priority={
                  priority
                }
                onActivate={
                  canNavigate
                    ? () =>
                        handlePriorityClick(
                          priority.jobId,
                        )
                    : undefined
                }
              />
            ),
          )}
        </div>
      </div>
    );
  },
);

export default AlertsPanel;
