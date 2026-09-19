import {
  memo,
  useLayoutEffect,
} from 'react';
import { getInterventionWorkspaceContextLabel } from '../../lib/interventionWorkspaceContext';
import { registerInterventionRealtimeScope } from '../../lib/interventionRealtimeScope';


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
    useLayoutEffect(
      () =>
        registerInterventionRealtimeScope(
          isToday && !isDemo,
        ),
      [isDemo, isToday],
    );

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
          <div className="intervention-workspace-kicker-row">
            <span className="intervention-workspace-eyebrow">
              Exploitation FTTH
            </span>

            <span
              className={[
                'intervention-workspace-mode',
                isDemo
                  ? 'intervention-workspace-mode--demo'
                  : isToday
                    ? 'intervention-workspace-mode--live'
                    : 'intervention-workspace-mode--history',
              ].join(' ')}
            >
              <span aria-hidden="true" />
              {isDemo
                ? 'Simulation'
                : isToday
                  ? 'Temps réel'
                  : 'Historique'}
            </span>
          </div>

          <div className="intervention-workspace-title-row">
            <h1>Interventions</h1>

            <span
              className="intervention-context-pill"
              aria-label={`Contexte : ${contextLabel}`}
            >
              {contextLabel}
            </span>
          </div>

          <p>
            Affectez, suivez et contrôlez l’exécution terrain depuis un seul poste.
          </p>
        </div>

        <div
          className="intervention-workspace-scope"
          aria-label="Périmètre opérationnel chargé"
        >
          <span className="intervention-scope-metric">
            <strong>{interventionCount}</strong>
            <small>interventions</small>
          </span>

          <span className="intervention-scope-metric">
            <strong>{technicianCount}</strong>
            <small>techniciens</small>
          </span>
        </div>

        <div className="intervention-workspace-date-wrap">
          <span className="intervention-workspace-date-label">
            Journée affichée
          </span>

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
        </div>
      </header>
    );
  },
);


InterventionWorkspaceHeader.displayName =
  'InterventionWorkspaceHeader';


export default InterventionWorkspaceHeader;
