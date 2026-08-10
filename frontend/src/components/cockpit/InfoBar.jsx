/**
 * InfoBar — barre d'information opérationnelle BlueVector.
 *
 * Ce composant est conservé pour les anciens imports. Le cockpit actif
 * affiche déjà sa date, son heure et son résumé personnel séparément.
 */

import { memo } from 'react';

const DEFAULT_LOCATION = 'Casablanca';
const DEFAULT_CLOCK = '--:--';

const STAT_DEFINITIONS = Object.freeze([
  {
    key: 'techConnected',
    label: 'Connectés',
    color: 'var(--color-success)',
  },
  {
    key: 'activeJobs',
    label: 'Actives',
    color: 'var(--color-accent)',
  },
  {
    key: 'criticalAlerts',
    label: 'Alertes',
    color: 'var(--color-danger)',
    emphasizeWhenPositive: true,
  },
  {
    key: 'incidents',
    label: 'Incidents',
    color: 'var(--color-warning)',
    emphasizeWhenPositive: true,
  },
]);

function text(value, fallback = '') {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean'
  ) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized || fallback;
}

function normalizeCount(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : null;
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime())
    ? new Date()
    : date;
}

function localDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatDate(date, locale) {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
    .format(date)
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function joinClassNames(...values) {
  return values
    .filter(
      (value) =>
        typeof value === 'string' &&
        value.trim(),
    )
    .map((value) => value.trim())
    .join(' ');
}

function LocationIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 1.5 2.5 6v8.5h11V6L8 1.5Z" />
      <path d="M5.5 14.5v-5h5v5" />
    </svg>
  );
}

const InfoBar = memo(function InfoBar({
  realClock = DEFAULT_CLOCK,
  techConnected,
  activeJobs,
  criticalAlerts,
  incidents,
  location = DEFAULT_LOCATION,
  currentDate = new Date(),
  locale = 'fr-FR',
  showContext = true,
  showZeroValues = true,
  className = '',
  style,
  ariaLabel = 'Résumé opérationnel',
}) {
  const date = validDate(currentDate);
  const normalizedLocale = text(locale, 'fr-FR');
  const normalizedClock = text(realClock, DEFAULT_CLOCK);
  const normalizedLocation = text(location);

  const dateLabel = formatDate(date, normalizedLocale);

  const values = {
    techConnected: normalizeCount(techConnected),
    activeJobs: normalizeCount(activeJobs),
    criticalAlerts: normalizeCount(criticalAlerts),
    incidents: normalizeCount(incidents),
  };

  const displayedStats = STAT_DEFINITIONS.filter((definition) => {
    const value = values[definition.key];

    return showZeroValues || value === null || value > 0;
  });

  const accessibleSummary = displayedStats
    .map((definition) => {
      const value = values[definition.key];

      return `${definition.label} : ${value === null ? 'indisponible' : value}`;
    })
    .join('. ');

  return (
    <section
      className={joinClassNames(
        'cockpit-infobar',
        className,
      )}
      style={
        style && typeof style === 'object'
          ? style
          : undefined
      }
      aria-label={text(ariaLabel, 'Résumé opérationnel')}
      title={accessibleSummary || undefined}
    >
      {showContext && (
        <div className="cockpit-infobar-left">
          {normalizedLocation && (
            <span className="cockpit-infobar-city">
              <LocationIcon />
              {normalizedLocation}
            </span>
          )}

          {normalizedLocation && (
            <span
              className="cockpit-infobar-sep"
              aria-hidden="true"
            >
              |
            </span>
          )}

          <time
            className="cockpit-infobar-date"
            dateTime={localDateKey(date)}
            title={date.toLocaleDateString(normalizedLocale, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          >
            {dateLabel}
          </time>

          <span
            className="cockpit-infobar-sep"
            aria-hidden="true"
          >
            |
          </span>

          <time
            className="cockpit-infobar-clock"
            dateTime={date.toISOString()}
            aria-label={`Heure : ${normalizedClock}`}
          >
            {normalizedClock}
          </time>
        </div>
      )}

      <div className="cockpit-infobar-right">
        {displayedStats.map((definition) => {
          const value = values[definition.key];
          const positive =
            value !== null && value > 0;

          return (
            <div
              className="cockpit-infobar-stat"
              key={definition.key}
              aria-label={`${definition.label} : ${
                value === null ? 'indisponible' : value
              }`}
            >
              <span
                className="cockpit-infobar-dot"
                aria-hidden="true"
                style={{
                  background: definition.color,
                  opacity: value === null ? 0.35 : 1,
                }}
              />

              <span className="cockpit-infobar-label">
                {definition.label}
              </span>

              <span
                className="cockpit-infobar-value"
                style={
                  definition.emphasizeWhenPositive && positive
                    ? {
                        color: definition.color,
                      }
                    : undefined
                }
              >
                {value === null ? '—' : value}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
});

InfoBar.displayName = 'InfoBar';

export default InfoBar;
