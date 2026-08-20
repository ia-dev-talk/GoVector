import { memo } from 'react';
import { getInterventionWorkspaceContextLabel } from '../../lib/interventionWorkspaceContext';


function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="4.5" width="15" height="13" rx="2.5" />
      <path d="M2.5 8h15M6.5 2.5v4M13.5 2.5v4" />
    </svg>
  );
}


function ChevronIcon({ direction }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d={
          direction === 'left'
            ? 'm12.5 5-5 5 5 5'
            : 'm7.5 5 5 5-5 5'
        }
      />
    </svg>
  );
}


function formatDate(value) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date indisponible';
  }

  return new Intl.DateTimeFormat(
    'fr-FR',
    {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    },
  )
    .format(date)
    .replace(/\./g, '')
    .replace(/^./, (character) =>
      character.toLocaleUpperCase('fr-FR'),
    );
}


const InterventionWorkspaceHeader = memo(
  function InterventionWorkspaceHeader({
    viewDate,
    isToday,
    isDemo,
    dateButtonRef,
    onPreviousDay,
    onNextDay,
    onToggleCalendar,
    technicianCount = 0,
    interventionCount = 0,
  }) {
    const dateLabel =
      isDemo
        ? 'Journée démo'
        : isToday
          ? 'Aujourd’hui'
          : formatDate(viewDate);

    const contextLabel =
      getInterventionWorkspaceContextLabel({
        isToday,
        isDemo,
      });

    return (
      <header className="intervention-workspace-header intervention-workspace-header--v4">
        <div className="intervention-workspace-identity">
          <span className="intervention-workspace-eyebrow">
            Exploitation FTTH
          </span>

          <div className="intervention-workspace-title-row">
            <h1>Interventions</h1>

            <span
              className="intervention-workspace-eyebrow"
              aria-label={`Contexte : ${contextLabel}`}
            >
              {contextLabel}
            </span>
          </div>

          <p>
            Affectation, suivi et pilotage de la journée terrain
          </p>
        </div>

        <div
          className="intervention-workspace-scope"
          aria-label="Périmètre opérationnel chargé"
        >
          <span>
            <strong>{interventionCount}</strong>
            interventions
          </span>

          <span>
            <strong>{technicianCount}</strong>
            techniciens
          </span>
        </div>

        <div className="intervention-workspace-date">
          {!isDemo ? (
            <button
              type="button"
              className="intervention-date-arrow"
              onClick={onPreviousDay}
              aria-label="Afficher le jour précédent"
            >
              <ChevronIcon direction="left" />
            </button>
          ) : null}

          <button
            type="button"
            ref={dateButtonRef}
            className={[
              'intervention-date-button',
              isToday
                ? 'intervention-date-button--today'
                : '',
              isDemo
                ? 'intervention-date-button--locked'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={
              isDemo
                ? undefined
                : onToggleCalendar
            }
            disabled={isDemo}
            aria-label={`Date affichée : ${dateLabel}`}
          >
            <CalendarIcon />
            <span>{dateLabel}</span>
          </button>

          {!isDemo ? (
            <button
              type="button"
              className="intervention-date-arrow"
              onClick={onNextDay}
              aria-label="Afficher le jour suivant"
            >
              <ChevronIcon direction="right" />
            </button>
          ) : null}
        </div>
      </header>
    );
  },
);


InterventionWorkspaceHeader.displayName =
  'InterventionWorkspaceHeader';


export default InterventionWorkspaceHeader;
