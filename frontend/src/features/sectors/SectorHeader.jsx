import { memo } from 'react';
import {
  ExportIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SectorIcon,
} from './SectorIcons';
import TerritoryWorkspace from './TerritoryWorkspace';


const SectorHeader = memo(function SectorHeader({
  connected,
  sectorCount,
  technicianCount,
  jobCount,
  searchQuery,
  onSearchChange,
  onRefresh,
  refreshing,
  onExport,
  onCreate,
  canManage,
}) {
  return (
    <>
      <header className="sv3-header">
        <div className="sv3-header-identity">
          <span className="sv3-eyebrow">
            Référentiel géographique
          </span>

          <div className="sv3-title-row">
            <span className="sv3-title-icon">
              <SectorIcon />
            </span>

            <div>
              <div className="sv3-heading-line">
                <h1>Secteurs</h1>

                <span
                  className={[
                    'sv3-live-state',
                    connected
                      ? 'sv3-live-state--connected'
                      : 'sv3-live-state--reconnecting',
                  ].join(' ')}
                >
                  <span aria-hidden="true" />
                  {connected
                    ? 'Temps réel'
                    : 'Reconnexion'}
                </span>
              </div>

              <p>
                Organisation territoriale, affectations et activité terrain
              </p>
            </div>
          </div>
        </div>

        <div className="sv3-header-summary">
          <div>
            <strong>{sectorCount}</strong>
            <span>secteurs</span>
          </div>

          <div>
            <strong>{technicianCount}</strong>
            <span>techniciens liés</span>
          </div>

          <div>
            <strong>{jobCount}</strong>
            <span>interventions du jour</span>
          </div>
        </div>

        <div className="sv3-header-actions">
          <label className="sv3-search">
            <SearchIcon />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) =>
                onSearchChange(
                  event.target.value,
                )
              }
              placeholder="Nom ou description du secteur…"
              aria-label="Rechercher un secteur"
            />
          </label>

          <button
            type="button"
            className="sv3-icon-button"
            onClick={onRefresh}
            disabled={refreshing}
            title="Actualiser"
            aria-label="Actualiser les secteurs"
          >
            <RefreshIcon spinning={refreshing} />
          </button>

          <button
            type="button"
            className="sv3-secondary-button"
            onClick={onExport}
          >
            <ExportIcon />
            Exporter
          </button>

          {canManage && (
            <button
              type="button"
              className="sv3-primary-button"
              onClick={onCreate}
            >
              <PlusIcon />
              Nouveau secteur
            </button>
          )}
        </div>
      </header>

      <TerritoryWorkspace canManage={canManage} />
    </>
  );
});


export default SectorHeader;
