import { memo } from 'react';
import {
  ChevronIcon,
  ClipboardIcon,
  EmptyIcon,
  FilterIcon,
  UsersIcon,
} from './LiveMapIcons';
import {
  GPS_LABELS,
  GPS_TONES,
  assignedTechnicianName,
  formatAge,
  getLocationAgeMinutes,
  getTechGpsState,
  jobId,
  jobStatus,
  jobTitle,
  jobType,
  primaryTechnicianSector,
  technicianId,
  technicianInitials,
  technicianName,
  text,
} from './liveMapUtils';


function EmptyList({
  type,
  filtered,
}) {
  return (
    <div className="lm-list-empty">
      <EmptyIcon />
      <strong>
        {type === 'technicians'
          ? 'Aucun technicien'
          : 'Aucune intervention'}
      </strong>
      <span>
        {filtered
          ? 'Aucun élément ne correspond aux filtres.'
          : 'Aucune donnée géolocalisée à afficher.'}
      </span>
    </div>
  );
}


function TechnicianRow({
  technician,
  selected,
  referenceNow,
  staleAfterMinutes,
  onSelect,
}) {
  const id = technicianId(technician);
  const gpsState = getTechGpsState(
    technician,
    referenceNow,
    staleAfterMinutes,
  );

  const age = getLocationAgeMinutes(
    technician,
    referenceNow,
  );

  return (
    <button
      type="button"
      className={[
        'lm-resource-row',
        selected
          ? 'lm-resource-row--selected'
          : '',
      ].join(' ')}
      onClick={() =>
        onSelect({
          type: 'technician',
          id,
        })
      }
    >
      <span className="lm-resource-avatar">
        {technicianInitials(technician)}
      </span>

      <span className="lm-resource-copy">
        <strong>
          {technicianName(technician)}
        </strong>

        <span>
          {text(
            technician?.live_status ??
              technician?.status,
            'Statut inconnu',
          ).replace(/_/g, ' ')}
        </span>

        <small>
          {primaryTechnicianSector(technician) ||
            'Aucun secteur lié'}
        </small>
      </span>

      <span
        className={`lm-gps-state lm-gps-state--${GPS_TONES[gpsState]}`}
        title={GPS_LABELS[gpsState]}
      >
        <span aria-hidden="true" />
        {age !== null
          ? formatAge(age)
          : GPS_LABELS[gpsState]}
      </span>
    </button>
  );
}


function JobRow({
  job,
  selected,
  onSelect,
}) {
  const id = jobId(job);
  const status = jobStatus(job);

  return (
    <button
      type="button"
      className={[
        'lm-resource-row',
        'lm-resource-row--job',
        selected
          ? 'lm-resource-row--selected'
          : '',
      ].join(' ')}
      onClick={() =>
        onSelect({
          type: 'job',
          id,
        })
      }
    >
      <span className="lm-resource-avatar lm-resource-avatar--job">
        {jobTitle(job)
          .replace(/\D/g, '')
          .slice(-2) || 'I'}
      </span>

      <span className="lm-resource-copy">
        <strong>{jobTitle(job)}</strong>
        <span>{jobType(job)}</span>
        <small>
          {assignedTechnicianName(job)}
        </small>
      </span>

      <span className={`lm-job-status lm-job-status--${status.value}`}>
        {status.label}
      </span>
    </button>
  );
}


const LiveMapRail = memo(function LiveMapRail({
  collapsed,
  onToggleCollapsed,
  activeTab,
  onTabChange,
  technicians,
  jobs,
  selected,
  onSelect,
  filters,
  onFilterChange,
  filterOptions,
  referenceNow,
  staleAfterMinutes,
  hasActiveFilters,
}) {
  if (collapsed) {
    return (
      <aside className="lm-rail lm-rail--collapsed">
        <button
          type="button"
          className="lm-rail-expand"
          onClick={onToggleCollapsed}
          aria-label="Déployer le rail ressources"
          title="Déployer les ressources"
        >
          <ChevronIcon direction="right" />
        </button>

        <button
          type="button"
          className={activeTab === 'technicians' ? 'active' : ''}
          onClick={() => onTabChange('technicians')}
          title="Techniciens"
        >
          <UsersIcon />
          <span>{technicians.length}</span>
        </button>

        <button
          type="button"
          className={activeTab === 'jobs' ? 'active' : ''}
          onClick={() => onTabChange('jobs')}
          title="Interventions"
        >
          <ClipboardIcon />
          <span>{jobs.length}</span>
        </button>
      </aside>
    );
  }

  const list =
    activeTab === 'technicians'
      ? technicians
      : jobs;

  return (
    <aside className="lm-rail">
      <header className="lm-rail-header">
        <div>
          <span>Ressources terrain</span>
          <strong>
            {activeTab === 'technicians'
              ? 'Techniciens'
              : 'Interventions'}
          </strong>
        </div>

        <button
          type="button"
          className="lm-rail-collapse"
          onClick={onToggleCollapsed}
          aria-label="Replier le rail ressources"
          title="Replier"
        >
          <ChevronIcon direction="left" />
        </button>
      </header>

      <div className="lm-tabs">
        <button
          type="button"
          className={activeTab === 'technicians' ? 'active' : ''}
          onClick={() => onTabChange('technicians')}
        >
          <UsersIcon />
          Techniciens
          <span>{technicians.length}</span>
        </button>

        <button
          type="button"
          className={activeTab === 'jobs' ? 'active' : ''}
          onClick={() => onTabChange('jobs')}
        >
          <ClipboardIcon />
          Interventions
          <span>{jobs.length}</span>
        </button>
      </div>

      <div className="lm-filter-strip">
        <span>
          <FilterIcon />
          Filtres
        </span>

        <select
          value={filters.sector}
          onChange={(event) =>
            onFilterChange('sector', event.target.value)
          }
          aria-label="Filtrer par secteur"
        >
          <option value="">Tous les secteurs</option>
          {filterOptions.sectors.map((sector) => (
            <option key={sector} value={sector}>
              {sector}
            </option>
          ))}
        </select>

        {activeTab === 'technicians' ? (
          <>
            <select
              value={filters.team}
              onChange={(event) =>
                onFilterChange('team', event.target.value)
              }
              aria-label="Filtrer par équipe"
            >
              <option value="">Toutes les équipes</option>
              {filterOptions.teams.map((team) => (
                <option key={team} value={team}>
                  {team}
                </option>
              ))}
            </select>

            <select
              value={filters.status}
              onChange={(event) =>
                onFilterChange('status', event.target.value)
              }
              aria-label="Filtrer par statut"
            >
              <option value="">Tous les statuts</option>
              {filterOptions.statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </>
        ) : (
          <select
            value={filters.operator}
            onChange={(event) =>
              onFilterChange('operator', event.target.value)
            }
            aria-label="Filtrer par opérateur"
          >
            <option value="">Tous les opérateurs</option>
            {filterOptions.operators.map((operator) => (
              <option key={operator} value={operator}>
                {operator}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="lm-resource-list">
        {list.length === 0 ? (
          <EmptyList
            type={activeTab}
            filtered={hasActiveFilters}
          />
        ) : activeTab === 'technicians' ? (
          list.map((technician) => (
            <TechnicianRow
              key={technicianId(technician)}
              technician={technician}
              selected={
                selected?.type === 'technician' &&
                selected.id === technicianId(technician)
              }
              referenceNow={referenceNow}
              staleAfterMinutes={staleAfterMinutes}
              onSelect={onSelect}
            />
          ))
        ) : (
          list.map((job) => (
            <JobRow
              key={jobId(job)}
              job={job}
              selected={
                selected?.type === 'job' &&
                selected.id === jobId(job)
              }
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
});


export default LiveMapRail;
