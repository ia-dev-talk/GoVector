import { memo } from 'react';


function IconBase({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}


function ClipboardIcon() {
  return (
    <IconBase>
      <rect x="5" y="4.5" width="14" height="17" rx="2.5" />
      <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" />
    </IconBase>
  );
}


function CalendarIcon() {
  return (
    <IconBase>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </IconBase>
  );
}


function FilterIcon() {
  return (
    <IconBase>
      <path d="M3 5h18l-7 8v5l-4 2v-7L3 5Z" />
    </IconBase>
  );
}


function ImportIcon() {
  return (
    <IconBase>
      <path d="M12 3v11M8 10l4 4 4-4" />
      <path d="M4 17v3h16v-3" />
    </IconBase>
  );
}


function PlusIcon() {
  return (
    <IconBase>
      <path d="M12 5v14M5 12h14" />
    </IconBase>
  );
}


const InterventionWorkspaceEmptyState = memo(
  function InterventionWorkspaceEmptyState({
    isToday = false,
    hasFilters = false,
    canCreate = false,
    canImport = false,
    onChangeDate,
    onResetFilters,
    onCreate,
    onImport,
  }) {
    const title = hasFilters
      ? 'Aucune intervention correspondante'
      : isToday
        ? 'Aucune intervention aujourd’hui'
        : 'Aucune intervention pour cette journée';

    const description = hasFilters
      ? (
          'Les filtres actifs masquent toutes les ' +
          'interventions du périmètre chargé.'
        )
      : (
          'Changez la date, importez un planning ou ' +
          'créez une intervention manuellement.'
        );

    return (
      <div className="intervention-workspace-empty">
        <span className="intervention-workspace-empty-icon">
          <ClipboardIcon />
        </span>

        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>

        <div className="intervention-workspace-empty-actions">
          <button
            type="button"
            onClick={onChangeDate}
          >
            <CalendarIcon />
            Changer la date
          </button>

          {hasFilters ? (
            <button
              type="button"
              onClick={onResetFilters}
            >
              <FilterIcon />
              Retirer les filtres
            </button>
          ) : null}

          {canImport ? (
            <button
              type="button"
              onClick={onImport}
            >
              <ImportIcon />
              Importer
            </button>
          ) : null}

          {canCreate ? (
            <button
              type="button"
              className="intervention-workspace-empty-primary"
              onClick={onCreate}
            >
              <PlusIcon />
              Nouvelle intervention
            </button>
          ) : null}
        </div>
      </div>
    );
  },
);


InterventionWorkspaceEmptyState.displayName =
  'InterventionWorkspaceEmptyState';


export default InterventionWorkspaceEmptyState;
