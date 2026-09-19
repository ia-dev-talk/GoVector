import { memo, useState } from 'react';
import {
  BoxIcon,
  ExportIcon,
  HistoryIcon,
  PlusIcon,
  ReceptionIcon,
  RefreshIcon,
  SearchIcon,
} from './StockIcons';
import StockHistoryPanel from './StockHistoryPanel';
import { stockV3Api } from './stockV3Api';
import './stock-scope-v08.css';

const StockHeader = memo(function StockHeader({
  catalogCount,
  warehouseCount,
  availableUnits,
  searchQuery,
  onSearchChange,
  onRefresh,
  refreshing,
  onExport,
  onCreate,
  onReceive,
  canManageCatalog,
  canMoveStock,
  hasWarehouses,
  warehouses,
  technicians,
  onNavigate,
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const snapshotStale = stockV3Api.isSnapshotStale();
  const snapshotWritable = stockV3Api.isSnapshotWritable();
  const mutationBlockedTitle = snapshotWritable
    ? undefined
    : 'Actions d’écriture suspendues jusqu’à validation d’un snapshot stock complet et frais';

  return (
    <>
      <header className="st3-header">
        <div className="st3-header-identity">
          <div className="st3-header-kicker-row">
            <span className="st3-eyebrow">Logistique FTTH</span>
            <span
              className={[
                'st3-snapshot-state',
                snapshotStale
                  ? 'st3-snapshot-state--stale'
                  : 'st3-snapshot-state--ready',
              ].join(' ')}
            >
              <span aria-hidden="true" />
              {snapshotStale ? 'À actualiser' : 'État cohérent'}
            </span>
          </div>

          <div className="st3-title-row">
            <span className="st3-title-icon"><BoxIcon /></span>
            <div>
              <h1>Stocks FTTH</h1>
              <p>Câbles FO16 · FO64, dépôts et dotations terrain</p>
            </div>
          </div>
        </div>

        <div className="st3-header-summary">
          <div><strong>{catalogCount}</strong><span>références</span></div>
          <div><strong>{warehouseCount}</strong><span>dépôts</span></div>
          <div><strong>{availableUnits}</strong><span>unités disponibles</span></div>
        </div>

        <div className="st3-header-actions">
          <label className="st3-search">
            <SearchIcon />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="FO16, FO64, dépôt…"
              aria-label="Rechercher dans le stock câbles"
            />
          </label>
          <button type="button" className="st3-icon-button" onClick={onRefresh} disabled={refreshing} title="Actualiser" aria-label="Actualiser le stock">
            <RefreshIcon spinning={refreshing} />
          </button>
          <button type="button" className="st3-secondary-button" onClick={() => setHistoryOpen(true)} title="Ouvrir le journal des mouvements">
            <HistoryIcon /> Historique
          </button>
          <button type="button" className="st3-secondary-button" onClick={onExport}>
            <ExportIcon /> Exporter
          </button>
          {canMoveStock ? (
            <button
              type="button"
              className="st3-secondary-button"
              onClick={onReceive}
              disabled={!hasWarehouses || !snapshotWritable}
              title={!snapshotWritable ? mutationBlockedTitle : hasWarehouses ? 'Enregistrer une réception' : 'Créez d’abord un dépôt'}
            >
              <ReceptionIcon /> Réception
            </button>
          ) : null}
          {canManageCatalog ? (
            <button
              type="button"
              className="st3-primary-button"
              onClick={onCreate}
              disabled={!snapshotWritable}
              title={mutationBlockedTitle}
            >
              <PlusIcon /> Ajouter un câble
            </button>
          ) : null}
        </div>
      </header>

      <div className="st3-notice st3-notice--pilot" role="note">
        <span className="st3-pilot-scope-badge">Périmètre pilote</span>
        <span>
          Câbles FO16 et FO64 confirmés uniquement. Les références historiques restent archivées hors de cette vue opérationnelle.
        </span>
      </div>

      {snapshotStale ? (
        <div className="st3-notice" role="alert">
          <span>
            <strong>Snapshot stock non frais.</strong>{' '}
            Le dernier état cohérent reste affiché. Réception, dotation et modifications sont suspendues jusqu’à la réussite complète d’une actualisation.
          </span>
        </div>
      ) : null}

      {historyOpen ? (
        <StockHistoryPanel
          warehouses={warehouses}
          technicians={technicians}
          onNavigate={onNavigate}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
    </>
  );
});

export default StockHeader;
