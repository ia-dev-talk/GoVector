/**
 * RealtimeActivityFeed — journal d'exploitation récent du cockpit BlueVector.
 *
 * Le composant affiche uniquement les événements reçus pendant la session
 * courante. Il ne les présente pas comme un historique persistant.
 */

import {
  memo,
  useId,
  useMemo,
} from 'react';

const DEFAULT_MAX_ITEMS = 100;

const AVATAR_COLORS = Object.freeze([
  'var(--color-accent, #4a9eff)',
  'var(--color-success, #4caf6a)',
  'var(--color-warning, #e5a834)',
  'var(--color-danger, #e05555)',
  'var(--color-purple, #9b7ed8)',
  'var(--color-info, #5b9bd5)',
  'var(--text-secondary, #c3c7cf)',
  'var(--text-muted, #8d929c)',
]);

const DEFAULT_STATUS_COLOR =
  'var(--color-accent, #4a9eff)';

const DEFAULT_STATUS_BACKGROUND =
  'var(--color-accent-dim, rgba(74, 158, 255, .12))';

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeText(
  value,
  fallback = '',
) {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean'
  ) {
    return fallback;
  }

  if (
    typeof value === 'number' &&
    !Number.isFinite(value)
  ) {
    return fallback;
  }

  const normalized =
    String(value).trim();

  return normalized || fallback;
}

function normalizeMaxItems(value) {
  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return DEFAULT_MAX_ITEMS;
  }

  return Math.min(
    parsed,
    500,
  );
}

function parseEventDate(event) {
  const candidates = [
    event?.isoTime,
    event?.timestamp,
    event?.created_at,
    event?.createdAt,
    event?.occurred_at,
    event?.occurredAt,
  ];

  for (const candidate of candidates) {
    if (
      candidate === null ||
      candidate === undefined ||
      candidate === ''
    ) {
      continue;
    }

    const date =
      candidate instanceof Date
        ? candidate
        : new Date(candidate);

    if (
      !Number.isNaN(
        date.getTime(),
      )
    ) {
      return date;
    }
  }

  return null;
}

function formatEventTime(
  date,
) {
  return date.toLocaleTimeString(
    'fr-FR',
    {
      hour: '2-digit',
      minute: '2-digit',
    },
  );
}

function getAvatarColor(name) {
  const normalizedName =
    normalizeText(
      name,
      'Système',
    );

  let hash = 0;

  for (
    let index = 0;
    index <
    normalizedName.length;
    index += 1
  ) {
    hash =
      normalizedName.charCodeAt(
        index,
      ) +
      (
        (hash << 5) -
        hash
      );
  }

  return AVATAR_COLORS[
    Math.abs(hash) %
      AVATAR_COLORS.length
  ];
}

function getInitials(name) {
  const normalizedName =
    normalizeText(
      name,
      'Système',
    );

  const parts =
    normalizedName
      .split(/\s+/)
      .filter(Boolean);

  if (parts.length >= 2) {
    return (
      parts[0][0] +
      parts[1][0]
    ).toLocaleUpperCase(
      'fr',
    );
  }

  const firstPart =
    parts[0] || '?';

  return firstPart
    .slice(0, 2)
    .toLocaleUpperCase('fr');
}

function isExplicitSimulationEvent(
  event,
  name,
  identifier,
) {
  const source =
    normalizeText(
      event?.source,
    ).toLocaleLowerCase(
      'fr',
    );

  return (
    event?.isSimulation ===
      true ||
    event?.simulated === true ||
    source === 'simulation' ||
    source === 'simulated' ||
    source === 'demo' ||
    name.toLocaleLowerCase(
      'fr',
    ) === 'simulation' ||
    identifier.startsWith(
      'script-',
    ) ||
    identifier.startsWith(
      'simulation-',
    )
  );
}

function buildFallbackId({
  isoTime,
  time,
  name,
  action,
  status,
  team,
  operator,
  location,
}) {
  return [
    isoTime || time,
    name,
    action,
    status,
    team,
    operator,
    location,
  ]
    .map((value) =>
      normalizeText(value)
        .toLocaleLowerCase(
          'fr',
        )
        .replace(/\s+/g, '-'),
    )
    .filter(Boolean)
    .join('|') ||
    'activity';
}

function normalizeActivityEvent(
  event,
) {
  if (!isRecord(event)) {
    return null;
  }

  const eventDate =
    parseEventDate(event);

  const isoTime =
    eventDate
      ? eventDate.toISOString()
      : '';

  const time =
    normalizeText(
      event.time,
      eventDate
        ? formatEventTime(
            eventDate,
          )
        : '--:--',
    );

  const name =
    normalizeText(
      event.name ??
        event.technicianName ??
        event.technician_name ??
        event.user,
      'Système',
    );

  const action =
    normalizeText(
      event.action ??
        event.message ??
        event.description,
      'Événement reçu',
    );

  const status =
    normalizeText(
      event.status,
    );

  const team =
    normalizeText(
      event.team,
    );

  const operator =
    normalizeText(
      event.operator,
    );

  const location =
    normalizeText(
      event.location ??
        event.sector ??
        event.zone,
    );

  const statusColor =
    normalizeText(
      event.statusColor ??
        event.status_color,
      DEFAULT_STATUS_COLOR,
    );

  const statusBackground =
    normalizeText(
      event.statusBg ??
        event.statusBackground ??
        event.status_background,
      DEFAULT_STATUS_BACKGROUND,
    );

  const providedId =
    normalizeText(
      event.id ??
        event.eventId ??
        event.event_id,
    );

  const baseId =
    providedId ||
    buildFallbackId({
      isoTime,
      time,
      name,
      action,
      status,
      team,
      operator,
      location,
    });

  return {
    baseId,
    time,
    isoTime,
    name,
    action,
    status,
    team,
    operator,
    location,
    statusColor,
    statusBackground,
    isSimulation:
      isExplicitSimulationEvent(
        event,
        name,
        baseId,
      ),
  };
}

function normalizeActivities(
  activities,
  maximum,
) {
  if (!Array.isArray(activities)) {
    return [];
  }

  const occurrences =
    new Map();

  const normalized = [];

  for (const activity of activities) {
    const event =
      normalizeActivityEvent(
        activity,
      );

    if (!event) {
      continue;
    }

    const occurrence =
      occurrences.get(
        event.baseId,
      ) || 0;

    occurrences.set(
      event.baseId,
      occurrence + 1,
    );

    normalized.push({
      ...event,
      key:
        occurrence === 0
          ? event.baseId
          : `${event.baseId}::${occurrence}`,
    });

    if (
      normalized.length >=
      maximum
    ) {
      break;
    }
  }

  return normalized;
}

const ActivityItem = memo(
  function ActivityItem({
    event,
  }) {
    const color =
      getAvatarColor(
        event.name,
      );

    const initials =
      getInitials(
        event.name,
      );

    const accessibleDescription =
      [
        event.time,
        event.name,
        event.team
          ? `Équipe ${event.team}`
          : '',
        event.operator
          ? `Opérateur ${event.operator}`
          : '',
        event.action,
        event.status,
        event.location,
        event.isSimulation
          ? 'Événement de simulation'
          : '',
      ]
        .filter(Boolean)
        .join('. ');

    return (
      <article
        className="cockpit-activity-item"
        aria-label={
          accessibleDescription
        }
      >
        <time
          className="cockpit-activity-time"
          dateTime={
            event.isoTime ||
            undefined
          }
          title={
            event.isoTime
              ? new Date(
                  event.isoTime,
                ).toLocaleString(
                  'fr-FR',
                )
              : undefined
          }
        >
          {event.time}
        </time>

        <div
          className="cockpit-activity-avatar"
          style={{
            backgroundColor:
              color,
            color:
              'var(--text-on-accent, #fff)',
          }}
          aria-hidden="true"
        >
          {initials}
        </div>

        <div className="cockpit-activity-content">
          <div className="cockpit-activity-name-row">
            <span
              className="cockpit-activity-name"
              title={event.name}
            >
              {event.name}
            </span>

            {event.team && (
              <span
                className="cockpit-activity-team"
                title={`Équipe ${event.team}`}
              >
                {event.team}
              </span>
            )}

            {event.operator && (
              <span
                className="cockpit-activity-team"
                title={`Opérateur ${event.operator}`}
              >
                {event.operator}
              </span>
            )}

            {event.isSimulation && (
              <span
                className="cockpit-activity-team"
                title="Événement issu de la simulation"
              >
                Simulation
              </span>
            )}
          </div>

          <span
            className="cockpit-activity-desc"
            title={event.action}
          >
            {event.action}
          </span>
        </div>

        {event.status && (
          <span
            className="cockpit-activity-status"
            style={{
              color:
                event.statusColor,
              backgroundColor:
                event.statusBackground,
            }}
            title={`Statut : ${event.status}`}
          >
            {event.status}
          </span>
        )}

        {event.location && (
          <span
            className="cockpit-activity-location"
            title={event.location}
          >
            {event.location}
          </span>
        )}
      </article>
    );
  },
);

const RealtimeActivityFeed = memo(
  function RealtimeActivityFeed({
    activities = [],
    maxItems =
      DEFAULT_MAX_ITEMS,
    title =
      'Activité récente',
    emptyMessage =
      'Aucune activité reçue pendant cette session.',
    ariaLabel =
      'Événements reçus pendant la session courante',
  }) {
    const reactId = useId();

    const titleId =
      `${reactId}-activity-title`;

    const maximum =
      normalizeMaxItems(
        maxItems,
      );

    const validActivities =
      useMemo(
        () =>
          normalizeActivities(
            activities,
            maximum,
          ),
        [
          activities,
          maximum,
        ],
      );

    const activityCount =
      validActivities.length;

    const normalizedTitle =
      normalizeText(
        title,
        'Activité récente',
      );

    const normalizedEmptyMessage =
      normalizeText(
        emptyMessage,
        'Aucune activité reçue pendant cette session.',
      );

    const normalizedAriaLabel =
      normalizeText(
        ariaLabel,
        'Événements reçus pendant la session courante',
      );

    const countLabel =
      `${activityCount} événement` +
      `${
        activityCount > 1
          ? 's'
          : ''
      } reçu` +
      `${
        activityCount > 1
          ? 's'
          : ''
      } pendant cette session`;

    return (
      <section
        className="cockpit-activity"
        aria-labelledby={
          titleId
        }
      >
        <div className="cockpit-activity-header">
          <h3 id={titleId}>
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M1 4h14M1 8h14M1 12h14" />

              <rect
                x="3"
                y="2.5"
                width="4"
                height="3"
                rx="0.5"
                fill="currentColor"
                stroke="none"
              />

              <rect
                x="8"
                y="6.5"
                width="5"
                height="3"
                rx="0.5"
                fill="currentColor"
                stroke="none"
              />

              <rect
                x="2"
                y="10.5"
                width="3"
                height="3"
                rx="0.5"
                fill="currentColor"
                stroke="none"
              />
            </svg>

            {normalizedTitle}
          </h3>

          {activityCount > 0 && (
            <span
              className="cockpit-activity-count"
              title={countLabel}
              aria-label={
                countLabel
              }
            >
              {activityCount}
            </span>
          )}
        </div>

        <div
          className="cockpit-activity-body"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-atomic="false"
          aria-label={
            normalizedAriaLabel
          }
        >
          {activityCount === 0 ? (
            <div
              className="cockpit-activity-empty"
              role="status"
            >
              {
                normalizedEmptyMessage
              }
            </div>
          ) : (
            validActivities.map(
              (event) => (
                <ActivityItem
                  key={event.key}
                  event={event}
                />
              ),
            )
          )}
        </div>
      </section>
    );
  },
);

RealtimeActivityFeed.displayName =
  'RealtimeActivityFeed';

export default RealtimeActivityFeed;
