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
import SerializedEquipmentRegistry from './SerializedEquipmentRegistry';
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
  const [registryOpen, setRegistryOpen] = useState(false);
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
          <span className="st3-eyebrow">Logistique FTTH</span>
          <div className="st3-title-row">
            <span className="st3-title-icon"><BoxIcon /></span>
            <div>
              <h1>Stocks</h1>
              <p>Catalogue, dépôts, quantités et traçabilité</p>
            </div>
          </div>
        </div>

        <div className="st3-header-summary">
          <div><strong>{catalogCount}</strong><span>articles</span></div>
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
              placeholder="Référence, article, type, opérateur…"
              aria-label="Rechercher dans le stock"
            />
          </label>
          <button type="button" className="st3-icon-button" onClick={onRefresh} disabled={refreshing} title="Actualiser" aria-label="Actualiser le stock">
            <RefreshIcon spinning={refreshing} />
          </button>
          <button type="button" className="st3-secondary-button" onClick={() => setHistoryOpen(true)} title="Ouvrir le journal complet des mouvements">
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
              className="st3-secondary-button"
              onClick={() => setRegistryOpen(true)}
              disabled={!snapshotWritable}
              title={snapshotWritable ? 'Gérer les numéros de série, MAC, opérateurs et modèles' : mutationBlockedTitle}
            >
              <span aria-hidden="true" style={{ fontFamily: 'var(--font-mono)', fontWeight: 850 }}>SN</span>
              Registre SN
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
              <PlusIcon /> Nouvel article
            </button>
          ) : null}
        </div>
      </header>

      {snapshotStale ? (
        <div className="st3-notice" role="alert">
          <span>
            <strong>Snapshot stock non frais.</strong>{' '}
            Le dernier état cohérent reste affiché. Réception, dotation et modifications sont suspendues jusqu’à la réussite complète d’une actualisation.
          </span>
        </div>
      ) : null}

      {registryOpen ? <SerializedEquipmentRegistry onClose={() => setRegistryOpen(false)} /> : null}
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
