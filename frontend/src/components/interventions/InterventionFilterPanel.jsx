import { memo, useMemo } from 'react';

function normalizePriority(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function ClearIcon() {
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
      <path d="m6 6 8 8M14 6l-8 8" />
    </svg>
  );
}

function SlidersIcon() {
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
      <path d="M3 5h14M3 10h14M3 15h14" />
      <circle cx="7" cy="5" r="1.7" fill="var(--surface-panel)" />
      <circle cx="13" cy="10" r="1.7" fill="var(--surface-panel)" />
      <circle cx="9" cy="15" r="1.7" fill="var(--surface-panel)" />
    </svg>
  );
}

function uniqueValues(values) {
  return [
    ...new Set(
      values
        .map((value) =>
          typeof value === 'string'
            ? value.trim()
            : value,
        )
        .filter(Boolean),
    ),
  ].sort((left, right) =>
    String(left).localeCompare(
      String(right),
      'fr',
      {
        numeric: true,
        sensitivity: 'base',
      },
    ),
  );
}

function FilterField({
  label,
  value,
  onChange,
  children,
}) {
  return (
    <label className="intervention-filter-field">
      <span>{label}</span>

      <select
        value={value || ''}
        onChange={(event) =>
          onChange(
            event.target.value || null,
          )
        }
      >
        {children}
      </select>
    </label>
  );
}

const InterventionFilterPanel = memo(
  function InterventionFilterPanel({
    expanded = false,
    filters,
    onChange,
    onClear,
    technicians,
    jobs,
    resultCount = 0,
    totalCount = 0,
    selectedCount = 0,
    activeFilterCount = 0,
    onOpenAdvanced,
  }) {
    const sectors = useMemo(
      () =>
        uniqueValues(
          jobs.map((job) =>
            job.route_criteria,
          ),
        ),
      [jobs],
    );

    const teams = useMemo(
      () =>
        uniqueValues(
          technicians.map((technician) =>
            technician.team,
          ),
        ),
      [technicians],
    );

    const operators = useMemo(
      () =>
        uniqueValues(
          jobs.map((job) =>
            job.operator,
          ),
        ),
      [jobs],
    );

    const types = useMemo(
      () =>
        uniqueValues(
          jobs.map((job) =>
            job.job_type,
          ),
        ),
      [jobs],
    );

    const priorities = useMemo(
      () =>
        uniqueValues(
          jobs.map((job) =>
            normalizePriority(
              job.priority,
            ),
          ),
        ),
      [jobs],
    );

    const technicianOptions =
      useMemo(
        () =>
          technicians
            .map((technician) => ({
              id: technician.id,
              name:
                technician.name ||
                `Technicien #${technician.id}`,
            }))
            .sort((left, right) =>
              left.name.localeCompare(
                right.name,
                'fr',
                {
                  sensitivity: 'base',
                },
              ),
            ),
        [technicians],
      );

    const hasFilters =
      activeFilterCount > 0;

    return (
      <section
        className={[
          'intervention-filter-panel',
          expanded
            ? 'intervention-filter-panel--expanded'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden={!expanded}
      >
        {expanded ? (
          <>
            <div className="intervention-filter-grid">
              <FilterField
                label="Opérateur"
                value={filters.operator}
                onChange={(value) =>
                  onChange('operator', value)
                }
              >
                <option value="">Tous</option>
                {operators.map((operator) => (
                  <option
                    key={operator}
                    value={operator}
                  >
                    {operator}
                  </option>
                ))}
              </FilterField>

              <FilterField
                label="Secteur"
                value={filters.sector}
                onChange={(value) =>
                  onChange('sector', value)
                }
              >
                <option value="">Tous</option>
                {sectors.map((sector) => (
                  <option
                    key={sector}
                    value={sector}
                  >
                    {sector}
                  </option>
                ))}
              </FilterField>

              <FilterField
                label="Équipe"
                value={filters.team}
                onChange={(value) =>
                  onChange('team', value)
                }
              >
                <option value="">Toutes</option>
                {teams.map((team) => (
                  <option
                    key={team}
                    value={team}
                  >
                    {team}
                  </option>
                ))}
              </FilterField>

              <FilterField
                label="Technicien"
                value={filters.techId}
                onChange={(value) =>
                  onChange('techId', value)
                }
              >
                <option value="">Tous</option>
                {technicianOptions.map(
                  (technician) => (
                    <option
                      key={technician.id}
                      value={technician.id}
                    >
                      {technician.name}
                    </option>
                  ),
                )}
              </FilterField>

              <FilterField
                label="Statut"
                value={filters.status}
                onChange={(value) =>
                  onChange('status', value)
                }
              >
                <option value="">Tous</option>
                <option value="pending">En attente</option>
                <option value="assigned">Affectée</option>
                <option value="in_progress">En cours</option>
                <option value="completed">Terminée</option>
                <option value="cancelled">Annulée</option>
                <option value="on_hold">En pause</option>
              </FilterField>

              <FilterField
                label="Priorité"
                value={filters.priority}
                onChange={(value) =>
                  onChange('priority', value)
                }
              >
                <option value="">Toutes</option>
                {priorities.map((priority) => (
                  <option
                    key={priority}
                    value={priority}
                  >
                    {/^\d+$/.test(priority)
                      ? `P${priority}`
                      : priority}
                  </option>
                ))}
              </FilterField>

              <FilterField
                label="Type"
                value={filters.type}
                onChange={(value) =>
                  onChange('type', value)
                }
              >
                <option value="">Tous</option>
                {types.map((type) => (
                  <option
                    key={type}
                    value={type}
                  >
                    {String(type).replace(
                      /_/g,
                      ' ',
                    )}
                  </option>
                ))}
              </FilterField>

              <label className="intervention-filter-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(filters.urgent)}
                  onChange={(event) =>
                    onChange(
                      'urgent',
                      event.target.checked || null,
                    )
                  }
                />

                <span
                  className="intervention-filter-toggle-control"
                  aria-hidden="true"
                />

                <span>
                  Priorité urgente
                </span>
              </label>
            </div>

            <div className="intervention-filter-footer">
              <div className="intervention-filter-results">
                <strong>{resultCount}</strong>
                <span>
                  sur {totalCount} interventions affichées
                </span>

                {selectedCount > 0 ? (
                  <span className="intervention-filter-selection">
                    {selectedCount} sélectionnée
                    {selectedCount > 1 ? 's' : ''}
                  </span>
                ) : null}
              </div>

              <div className="intervention-filter-actions">
                <button
                  type="button"
                  className="intervention-filter-advanced"
                  onClick={onOpenAdvanced}
                >
                  <SlidersIcon />
                  Filtres avancés
                </button>

                {hasFilters ? (
                  <button
                    type="button"
                    className="intervention-filter-clear"
                    onClick={onClear}
                  >
                    <ClearIcon />
                    Réinitialiser
                  </button>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </section>
    );
  },
);

InterventionFilterPanel.displayName =
  'InterventionFilterPanel';

export default InterventionFilterPanel;
