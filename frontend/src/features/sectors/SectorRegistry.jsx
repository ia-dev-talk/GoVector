import { memo, useEffect } from 'react';
import {
  FilterIcon,
  SortIcon,
} from './SectorIcons';
import { reconcileVisibleSectorSelection } from './sectorSnapshot';
import { sectorId } from './sectorUtils';


function SectorRow({
  sector,
  selected,
  onSelect,
}) {
  return (
    <button
      type="button"
      className={[
        'sv3-sector-row',
        selected
          ? 'sv3-sector-row--selected'
          : '',
        sector.is_active === false
          ? 'sv3-sector-row--inactive'
          : '',
      ].join(' ')}
      onClick={() =>
        onSelect(sectorId(sector))
      }
    >
      <span
        className="sv3-sector-color"
        style={{
          background:
            sector.color || '#4b8dff',
        }}
      />

      <span className="sv3-sector-name">
        <strong>{sector.name}</strong>
        <small>
          {sector.description ||
            'Aucune description'}
        </small>
      </span>

      <span>
        <strong>
          {sector.technicians.length}
        </strong>
        <small>techniciens</small>
      </span>

      <span>
        <strong>
          {sector.primaryTechnicians.length}
        </strong>
        <small>principaux</small>
      </span>

      <span>
        <strong>
          {sector.jobs.length}
        </strong>
        <small>interventions</small>
      </span>

      <span>
        <strong>
          {sector.statusCounts.active}
        </strong>
        <small>actives</small>
      </span>

      <span
        className={
          sector.gpsIssues > 0
            ? 'sv3-cell-danger'
            : ''
        }
      >
        <strong>
          {sector.gpsIssues}
        </strong>
        <small>GPS</small>
      </span>

      <span
        className={[
          'sv3-sector-state',
          sector.is_active === false
            ? 'sv3-sector-state--inactive'
            : 'sv3-sector-state--active',
        ].join(' ')}
      >
        {sector.is_active === false
          ? 'Inactif'
          : 'Actif'}
      </span>
    </button>
  );
}


const SectorRegistry = memo(function SectorRegistry({
  sectors,
  selectedId,
  onSelect,
  statusFilter,
  onStatusFilter,
  issueFilter,
  onIssueFilter,
  sortBy,
  onSortBy,
  totalCount,
}) {
  useEffect(() => {
    const nextSelectedId = reconcileVisibleSectorSelection(
      sectors,
      selectedId,
      sectorId,
    );
    if (selectedId !== null && nextSelectedId === null) {
      onSelect(null);
    }
  }, [onSelect, sectors, selectedId]);

  return (
    <section className="sv3-registry">
      <header className="sv3-panel-header">
        <div>
          <span>Référentiel central</span>
          <strong>Secteurs opérationnels</strong>
        </div>

        <span className="sv3-count-pill">
          {sectors.length}
          {' '}affiché
          {sectors.length > 1 ? 's' : ''}
          {' '}sur {totalCount}
        </span>
      </header>

      <div className="sv3-registry-toolbar">
        <label>
          <FilterIcon />
          <select
            value={statusFilter}
            onChange={(event) =>
              onStatusFilter(
                event.target.value,
              )
            }
            aria-label="Filtrer par état"
          >
            <option value="all">
              Tous les états
            </option>
            <option value="active">
              Actifs
            </option>
            <option value="inactive">
              Inactifs
            </option>
          </select>
        </label>

        <label>
          <FilterIcon />
          <select
            value={issueFilter}
            onChange={(event) =>
              onIssueFilter(
                event.target.value,
              )
            }
            aria-label="Filtrer par situation"
          >
            <option value="all">
              Toutes les situations
            </option>
            <option value="without-tech">
              Sans technicien
            </option>
            <option value="gps">
              GPS à vérifier
            </option>
            <option value="with-jobs">
              Avec interventions
            </option>
          </select>
        </label>

        <label>
          <SortIcon />
          <select
            value={sortBy}
            onChange={(event) =>
              onSortBy(
                event.target.value,
              )
            }
            aria-label="Trier les secteurs"
          >
            <option value="name">
              Nom
            </option>
            <option value="technicians">
              Techniciens
            </option>
            <option value="jobs">
              Interventions
            </option>
            <option value="gps">
              GPS à vérifier
            </option>
          </select>
        </label>
      </div>

      <div className="sv3-registry-head">
        <span />
        <span>Secteur</span>
        <span>Techniciens</span>
        <span>Principaux</span>
        <span>Interventions</span>
        <span>Actives</span>
        <span>GPS</span>
        <span>État</span>
      </div>

      <div className="sv3-registry-body">
        {sectors.length === 0 ? (
          <div className="sv3-empty">
            <strong>
              Aucun secteur correspondant
            </strong>
            <span>
              Modifiez la recherche ou les filtres.
            </span>
          </div>
        ) : (
          sectors.map((sector) => (
            <SectorRow
              key={sectorId(sector)}
              sector={sector}
              selected={
                selectedId ===
                sectorId(sector)
              }
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </section>
  );
});


export default SectorRegistry;
