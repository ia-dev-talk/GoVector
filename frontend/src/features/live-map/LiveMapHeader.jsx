import { memo } from 'react';
import {
  ClockIcon,
  MapIcon,
  RefreshIcon,
  SearchIcon,
} from './LiveMapIcons';
import { formatTime } from './liveMapUtils';


const LiveMapHeader = memo(function LiveMapHeader({
  searchQuery,
  onSearchChange,
  onRefresh,
  refreshing,
  connected,
  technicianCount,
  jobCount,
  lastUpdatedAt,
}) {
  return (
    <header className="lm-header">
      <div className="lm-header-identity">
        <span className="lm-eyebrow">
          Suivi géographique
        </span>

        <div className="lm-title-row">
          <span className="lm-title-icon">
            <MapIcon />
          </span>

          <div>
            <div className="lm-heading-line">
              <h1>Carte live</h1>

              <span
                className={[
                  'lm-live-state',
                  connected
                    ? 'lm-live-state--connected'
                    : 'lm-live-state--reconnecting',
                ].join(' ')}
              >
                <span aria-hidden="true" />
                {connected
                  ? 'Temps réel'
                  : 'Reconnexion'}
              </span>
            </div>

            <p>
              Positions terrain et interventions géolocalisées
            </p>
          </div>
        </div>
      </div>

      <div className="lm-header-summary">
        <div>
          <strong>{technicianCount}</strong>
          <span>techniciens</span>
        </div>

        <div>
          <strong>{jobCount}</strong>
          <span>interventions</span>
        </div>

        <div className="lm-last-update">
          <ClockIcon />
          <span>
            MAJ {formatTime(lastUpdatedAt)}
          </span>
        </div>
      </div>

      <div className="lm-header-actions">
        <label className="lm-search">
          <SearchIcon />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) =>
              onSearchChange(event.target.value)
            }
            placeholder="Technicien, client, adresse, DTLI…"
            aria-label="Rechercher sur la carte"
          />
        </label>

        <button
          type="button"
          className="lm-icon-button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Actualiser la carte"
          title="Actualiser"
        >
          <RefreshIcon spinning={refreshing} />
        </button>
      </div>
    </header>
  );
});


export default LiveMapHeader;
