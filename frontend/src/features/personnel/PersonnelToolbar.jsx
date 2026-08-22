import {
  FilterIcon,
  OfflineIcon,
  PauseIcon,
  UserCheckIcon,
} from './PersonnelIcons';
import {
  buildPersonnelStatusConfirmation,
  getStringList,
  normalizeSearchText,
} from './personnelUtils';

function uniqueValues(values) {
  const labels = new Map();

  values.forEach((value) => {
    const label = String(value ?? '').trim();
    const key = normalizeSearchText(label);

    if (key && !labels.has(key)) {
      labels.set(key, label);
    }
  });

  return [...labels.values()].sort((left, right) =>
    left.localeCompare(right, 'fr', {
      sensitivity: 'base',
    }),
  );
}

export default function PersonnelToolbar({
  technicians,
  filters,
  filtersOpen,
  onToggleFilters,
  onFilterChange,
  onClearFilters,
  displayedCount,
  totalCount,
  selectedCount,
  onBulkStatus,
  busy = false,
}) {
  const sectors = uniqueValues(
    technicians.map((tech) => tech.route_criteria),
  );
  const teams = uniqueValues(
    technicians.map((tech) => tech.team),
  );
  const operators = uniqueValues(
    technicians.map((tech) => tech.operator),
  );
  const skills = uniqueValues(
    technicians.flatMap((tech) => getStringList(tech.skills)),
  );

  const activeFilterCount = Object.values(filters)
    .filter(Boolean)
    .length;

  const requestBulkStatus = (status) => {
    const confirmation = buildPersonnelStatusConfirmation(
      status,
      selectedCount,
    );
    if (confirmation && !window.confirm(confirmation)) {
      return;
    }
    onBulkStatus?.(status);
  };

  return (
    <section className="personnel-v3-toolbar-shell">
      <div className="personnel-v3-toolbar">
        <button
          type="button"
          className={[
            'personnel-v3-toolbar-button',
            filtersOpen
              ? 'personnel-v3-toolbar-button--active'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={onToggleFilters}
          aria-expanded={filtersOpen}
        >
          <FilterIcon />
          Filtres
          {activeFilterCount > 0 ? (
            <span>{activeFilterCount}</span>
          ) : null}
        </button>

        <div className="personnel-v3-toolbar-count">
          <strong>{displayedCount}</strong>
          <span>affichés sur {totalCount}</span>
        </div>

        <div className="personnel-v3-toolbar-spacer" />

        {selectedCount > 0 ? (
          <div
            className="personnel-v3-bulk-actions"
            aria-label="Actions sur la sélection"
          >
            <span>
              {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
            </span>

            <button
              type="button"
              onClick={() => requestBulkStatus('disponible')}
              disabled={busy}
            >
              <UserCheckIcon />
              Disponible
            </button>

            <button
              type="button"
              onClick={() => requestBulkStatus('pause')}
              disabled={busy}
            >
              <PauseIcon />
              Pause
            </button>

            <button
              type="button"
              className="personnel-v3-bulk-action--danger"
              onClick={() => requestBulkStatus('hors_service')}
              disabled={busy}
            >
              <OfflineIcon />
              Hors service
            </button>
          </div>
        ) : (
          <span className="personnel-v3-toolbar-help">
            Sélectionnez un technicien pour agir sur son statut
          </span>
        )}
      </div>

      {filtersOpen ? (
        <div className="personnel-v3-filter-panel">
          <label>
            <span>Secteur</span>
            <select
              value={filters.sector ?? ''}
              onChange={(event) =>
                onFilterChange?.('sector', event.target.value || null)
              }
            >
              <option value="">Tous les secteurs</option>
              {sectors.map((sector) => (
                <option key={sector} value={sector}>
                  {sector}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Équipe</span>
            <select
              value={filters.team ?? ''}
              onChange={(event) =>
                onFilterChange?.('team', event.target.value || null)
              }
            >
              <option value="">Toutes les équipes</option>
              {teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Opérateur</span>
            <select
              value={filters.operator ?? ''}
              onChange={(event) =>
                onFilterChange?.('operator', event.target.value || null)
              }
            >
              <option value="">Tous les opérateurs</option>
              {operators.map((operator) => (
                <option key={operator} value={operator}>
                  {operator}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Statut</span>
            <select
              value={filters.status ?? ''}
              onChange={(event) =>
                onFilterChange?.('status', event.target.value || null)
              }
            >
              <option value="">Tous les statuts</option>
              <option value="disponible">Disponible</option>
              <option value="en_route">En route</option>
              <option value="en_intervention">En intervention</option>
              <option value="pause">En pause</option>
              <option value="hors_service">Hors service</option>
              <option value="deconnecte">Déconnecté</option>
            </select>
          </label>

          <label>
            <span>Compétence</span>
            <select
              value={filters.skill ?? ''}
              onChange={(event) =>
                onFilterChange?.('skill', event.target.value || null)
              }
            >
              <option value="">Toutes les compétences</option>
              {skills.map((skill) => (
                <option key={skill} value={skill}>
                  {skill}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Position GPS</span>
            <select
              value={filters.gps ?? ''}
              onChange={(event) =>
                onFilterChange?.('gps', event.target.value || null)
              }
            >
              <option value="">Tous les états GPS</option>
              <option value="active">GPS actif</option>
              <option value="lost">GPS à vérifier</option>
            </select>
          </label>

          <button
            type="button"
            className="personnel-v3-filter-clear"
            onClick={onClearFilters}
            disabled={activeFilterCount === 0}
          >
            Effacer les filtres
          </button>
        </div>
      ) : null}
    </section>
  );
}
