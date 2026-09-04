import {
  memo,
  useEffect,
  useRef,
  useState,
} from 'react';

import Button from '../ui/Button';
import {
  BoltIcon,
  ExportIcon,
  FilterIcon,
  MapIcon,
  RefreshIcon,
  SearchIcon,
  TimelineIcon,
} from '../DashboardIcons';


function IconBase({ children }) {
  return (
    <svg
      viewBox="0 0 20 20"
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


function ListIcon() {
  return (
    <IconBase>
      <path d="M6 5h10M6 10h10M6 15h10" />
      <circle cx="3" cy="5" r=".7" fill="currentColor" stroke="none" />
      <circle cx="3" cy="10" r=".7" fill="currentColor" stroke="none" />
      <circle cx="3" cy="15" r=".7" fill="currentColor" stroke="none" />
    </IconBase>
  );
}


function PlusIcon() {
  return (
    <IconBase>
      <path d="M10 4v12M4 10h12" />
    </IconBase>
  );
}


function ImportIcon() {
  return (
    <IconBase>
      <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5" />
      <path d="M4 14.5v2h12v-2" />
    </IconBase>
  );
}


function AssignIcon() {
  return (
    <IconBase>
      <rect x="2.5" y="4" width="7" height="12" rx="2" />
      <circle cx="14.5" cy="6.5" r="2.2" />
      <path d="M11.5 15.5c.4-2.6 1.5-4 3-4s2.6 1.4 3 4M8.5 10h3M10 8.5l1.5 1.5-1.5 1.5" />
    </IconBase>
  );
}


function MoreIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="4" cy="10" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="16" cy="10" r="1.4" />
    </svg>
  );
}


const InterventionToolbar = memo(
  function InterventionToolbar({
    searchValue = '',
    onSearchChange,
    filtersExpanded = false,
    activeFilterCount = 0,
    onToggleFilters,
    onOpenSearch,
    showMap = false,
    onToggleMap,
    showTimeline = false,
    onToggleTimeline,
    refreshing = false,
    onRefresh,
    canAssign = false,
    canAssignSelected = false,
    selectedJobCount = 0,
    selectedTechnicianCount = 0,
    onAssignSelected,
    canCreate = false,
    onCreate,
    canImport = false,
    onImport,
    canExport = false,
    onExport,
    demoLocked = false,
    canAutoAssign = false,
    pendingCount = 0,
    autoRouting = false,
    onAutoAssign,
  }) {
    const [menuOpen, setMenuOpen] =
      useState(false);

    const menuRef =
      useRef(null);

    useEffect(() => {
      if (!menuOpen) {
        return undefined;
      }

      const closeOnOutside = (event) => {
        if (
          !menuRef.current?.contains(event.target)
        ) {
          setMenuOpen(false);
        }
      };

      const closeOnEscape = (event) => {
        if (event.key === 'Escape') {
          setMenuOpen(false);
        }
      };

      document.addEventListener(
        'pointerdown',
        closeOnOutside,
      );

      document.addEventListener(
        'keydown',
        closeOnEscape,
      );

      return () => {
        document.removeEventListener(
          'pointerdown',
          closeOnOutside,
        );

        document.removeEventListener(
          'keydown',
          closeOnEscape,
        );
      };
    }, [menuOpen]);

    const activeView =
      showTimeline
        ? 'activity'
        : showMap
          ? 'map'
          : 'list';

    const selectView = (nextView) => {
      if (nextView === activeView) {
        return;
      }

      if (nextView === 'list') {
        if (showMap) {
          onToggleMap?.();
        }

        if (showTimeline) {
          onToggleTimeline?.();
        }

        return;
      }

      if (nextView === 'map') {
        if (showTimeline) {
          onToggleTimeline?.();
        }

        if (!showMap) {
          onToggleMap?.();
        }

        return;
      }

      if (showMap) {
        onToggleMap?.();
      }

      if (!showTimeline) {
        onToggleTimeline?.();
      }
    };

    const hasSecondaryActions =
      canImport ||
      canExport ||
      canAutoAssign ||
      typeof onOpenSearch === 'function';

    const assignLabel =
      selectedJobCount > 1
        ? `Affecter ${selectedJobCount}`
        : 'Affecter';

    const assignTitle =
      !canAssignSelected
        ? selectedJobCount === 0
          ? 'Sélectionnez une ou plusieurs interventions.'
          : selectedTechnicianCount !== 1
            ? 'Sélectionnez exactement un technicien.'
            : 'Affectation indisponible.'
        : (
            `Affecter ${selectedJobCount} intervention` +
            `${selectedJobCount > 1 ? 's' : ''} ` +
            'au technicien sélectionné'
          );

    const runMenuAction = (action) => {
      setMenuOpen(false);
      action?.();
    };

    const viewButtons = [
      {
        id: 'list',
        label: 'Liste',
        Icon: ListIcon,
      },
      {
        id: 'map',
        label: 'Carte',
        Icon: MapIcon,
      },
      {
        id: 'activity',
        label: 'Activité',
        Icon: TimelineIcon,
      },
    ];

    return (
      <section className="intervention-toolbar intervention-toolbar--v4">
        <form
          className="intervention-toolbar-search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            event.currentTarget
              .querySelector('input')
              ?.blur();
          }}
        >
          <SearchIcon aria-hidden="true" />

          <input
            type="search"
            value={searchValue}
            placeholder="DTLI, client, adresse, technicien…"
            aria-label="Rechercher parmi les interventions chargées"
            onChange={(event) =>
              onSearchChange?.(event.target.value)
            }
          />
        </form>

        <div
          className="intervention-view-switcher intervention-view-switcher--v4"
          aria-label="Vue du workspace"
        >
          {viewButtons.map((view) => (
            <button
              key={view.id}
              type="button"
              className={[
                'intervention-view-button',
                activeView === view.id
                  ? 'intervention-view-button--active'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() =>
                selectView(view.id)
              }
              aria-pressed={
                activeView === view.id
              }
            >
              <view.Icon />
              <span>{view.label}</span>
            </button>
          ))}
        </div>

        <div className="intervention-toolbar-actions">
          <Button
            variant={
              filtersExpanded
                ? 'primary'
                : 'secondary'
            }
            onClick={onToggleFilters}
            className="intervention-toolbar-filter-button"
          >
            <FilterIcon />
            <span>Filtres</span>

            {activeFilterCount > 0 ? (
              <span className="intervention-toolbar-count">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>

          <Button
            variant="secondary"
            onClick={onRefresh}
            disabled={refreshing}
            className="intervention-toolbar-refresh"
            title="Actualiser les données"
          >
            <RefreshIcon spinning={refreshing} />
            <span className="intervention-toolbar-label">
              Actualiser
            </span>
          </Button>

          {canAssign ? (
            <Button
              variant="secondary"
              onClick={onAssignSelected}
              disabled={
                demoLocked ||
                !canAssignSelected
              }
              className="intervention-toolbar-assign"
              title={assignTitle}
            >
              <AssignIcon />
              <span>{assignLabel}</span>
            </Button>
          ) : null}

          {canCreate ? (
            <Button
              variant="primary"
              onClick={onCreate}
              disabled={demoLocked}
              className="intervention-toolbar-primary intervention-toolbar-create"
            >
              <PlusIcon />
              <span>Nouvelle intervention</span>
            </Button>
          ) : null}

          {hasSecondaryActions ? (
            <div
              className="intervention-actions-menu"
              ref={menuRef}
            >
              <Button
                variant="secondary"
                className="intervention-actions-trigger"
                onClick={() =>
                  setMenuOpen((value) => !value)
                }
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="Autres actions"
              >
                <MoreIcon />
                <span className="intervention-toolbar-label">
                  Actions
                </span>
              </Button>

              {menuOpen ? (
                <div
                  className="intervention-actions-popover"
                  role="menu"
                >
                  {typeof onOpenSearch === 'function' ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        runMenuAction(onOpenSearch)
                      }
                    >
                      <SearchIcon />
                      <span>
                        <strong>
                          Recherche avancée
                        </strong>
                        <small>
                          Recherche transversale
                        </small>
                      </span>
                    </button>
                  ) : null}

                  {canAutoAssign ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={
                        demoLocked ||
                        autoRouting ||
                        pendingCount === 0
                      }
                      onClick={() =>
                        runMenuAction(onAutoAssign)
                      }
                    >
                      <BoltIcon />
                      <span>
                        <strong>
                          {autoRouting
                            ? 'Affectation en cours'
                            : `Auto-affecter ${pendingCount}`}
                        </strong>
                        <small>
                          Action avancée à confirmer
                        </small>
                      </span>
                    </button>
                  ) : null}

                  {canImport ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        runMenuAction(onImport)
                      }
                    >
                      <ImportIcon />
                      <span>
                        <strong>Importer</strong>
                        <small>
                          Charger des interventions
                        </small>
                      </span>
                    </button>
                  ) : null}

                  {canExport ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        runMenuAction(onExport)
                      }
                    >
                      <ExportIcon />
                      <span>
                        <strong>Exporter</strong>
                        <small>
                          Excel, CSV, PDF ou ZIP
                        </small>
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    );
  },
);


InterventionToolbar.displayName =
  'InterventionToolbar';


export default InterventionToolbar;
