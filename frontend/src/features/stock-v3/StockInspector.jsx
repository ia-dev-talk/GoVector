import {
  memo,
  useState,
} from 'react';
import {
  AlertIcon,
  BoxIcon,
  EditIcon,
  HistoryIcon,
  ReceptionIcon,
  WarehouseIcon,
} from './StockIcons';
import {
  formatDateTime,
  formatMoney,
  movementLabel,
  numeric,
  text,
} from './stockUtils';


function Metric({
  label,
  value,
  tone = 'neutral',
}) {
  return (
    <div className={`st3-metric st3-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}


function WarehouseLines({
  lines,
}) {
  if (lines.length === 0) {
    return (
      <div className="st3-inspector-empty">
        Aucun stock enregistré pour cet article.
      </div>
    );
  }

  return (
    <div className="st3-line-list">
      {lines.map((line) => (
        <div key={line.id}>
          <span className="st3-line-icon">
            <WarehouseIcon />
          </span>

          <span>
            <strong>
              {text(
                line?.warehouse?.name,
                `Dépôt #${line.warehouse_id}`,
              )}
            </strong>
            <small>
              Lot {text(line?.batch_number, 'non renseigné')}
            </small>
          </span>

          <span>
            <strong>
              {numeric(line?.quantity)}
            </strong>
            <small>physique</small>
          </span>

          <span>
            <strong className="st3-success">
              {numeric(
                line?.available_quantity,
              )}
            </strong>
            <small>disponible</small>
          </span>
        </div>
      ))}
    </div>
  );
}


function MovementList({
  movements,
}) {
  if (movements.length === 0) {
    return (
      <div className="st3-inspector-empty">
        Aucun mouvement enregistré pour cet article.
      </div>
    );
  }

  return (
    <div className="st3-movement-list">
      {movements.map((movement) => (
        <div key={movement.id}>
          <span
            className={`st3-movement-type st3-movement-type--${String(
              movement?.movement_type,
            ).toLocaleLowerCase('fr')}`}
          >
            {movementLabel(
              movement?.movement_type,
            )}
          </span>

          <span>
            <strong>
              {numeric(movement?.quantity)}
            </strong>
            <small>
              {formatDateTime(
                movement?.created_at,
              )}
            </small>
          </span>

          <span>
            {text(
              movement?.notes,
              'Aucune note',
            )}
          </span>
        </div>
      ))}
    </div>
  );
}


const StockInspector = memo(function StockInspector({
  item,
  movements,
  canManageCatalog,
  canMoveStock,
  canReceive,
  onEdit,
  onReceive,
}) {
  const [tab, setTab] =
    useState('overview');

  if (!item) {
    return (
      <aside className="st3-inspector st3-inspector--empty">
        <BoxIcon />
        <strong>
          Sélectionnez un article
        </strong>
        <span>
          Consultez sa disponibilité, ses dépôts et sa traçabilité.
        </span>
      </aside>
    );
  }

  return (
    <aside className="st3-inspector">
      <header className="st3-inspector-header">
        <span className="st3-inspector-icon">
          <BoxIcon />
        </span>

        <div>
          <span>Fiche article</span>
          <strong>
            {text(item?.label, 'Article')}
          </strong>
          <small>
            {text(item?.reference, 'Référence inconnue')}
          </small>
        </div>

        {canManageCatalog && (
          <button
            type="button"
            className="st3-icon-button"
            onClick={() => onEdit(item)}
            title="Modifier"
            aria-label="Modifier l’article"
          >
            <EditIcon />
          </button>
        )}
      </header>

      <div className="st3-inspector-tabs">
        {[
          ['overview', 'Vue d’ensemble'],
          ['warehouses', 'Dépôts'],
          ['history', 'Historique'],
        ].map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={
              tab === key ? 'active' : ''
            }
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="st3-inspector-body">
        {tab === 'overview' && (
          <>
            <section>
              <div className="st3-section-title">
                Référentiel
              </div>

              <div className="st3-detail-grid">
                <div>
                  <span>Type</span>
                  <strong>
                    {text(item?.equipment_type, '—')}
                  </strong>
                </div>

                <div>
                  <span>Opérateur</span>
                  <strong>
                    {text(item?.operator, '—')}
                  </strong>
                </div>

                <div>
                  <span>Fabricant</span>
                  <strong>
                    {text(item?.manufacturer, '—')}
                  </strong>
                </div>

                <div>
                  <span>Modèle</span>
                  <strong>
                    {text(item?.model, '—')}
                  </strong>
                </div>

                <div>
                  <span>Catégorie</span>
                  <strong>
                    {text(item?.category, '—')}
                  </strong>
                </div>

                <div>
                  <span>Prix unitaire</span>
                  <strong>
                    {formatMoney(item?.unit_price)}
                  </strong>
                </div>
              </div>
            </section>

            <section>
              <div className="st3-section-title">
                Situation consolidée
              </div>

              <div className="st3-metrics-grid">
                <Metric
                  label="Stock physique"
                  value={item.totals.quantity}
                />
                <Metric
                  label="Disponible"
                  value={item.totals.available}
                  tone="success"
                />
                <Metric
                  label="Réservé"
                  value={item.totals.reserved}
                  tone="info"
                />
                <Metric
                  label="Dépôts"
                  value={item.warehouseCount}
                />
                <Metric
                  label="Seuil minimum"
                  value={item.threshold}
                  tone={
                    item.lowStock
                      ? 'warning'
                      : 'neutral'
                  }
                />
                <Metric
                  label="Valeur"
                  value={formatMoney(
                    item.totals.quantity *
                      numeric(
                        item?.unit_price,
                      ),
                  )}
                />
              </div>

              {item.lowStock && (
                <div className="st3-alert-note">
                  <AlertIcon />
                  Le disponible est inférieur ou égal au seuil configuré.
                </div>
              )}
            </section>
          </>
        )}

        {tab === 'warehouses' && (
          <section>
            <div className="st3-section-title">
              Répartition par dépôt
            </div>

            <WarehouseLines
              lines={item.lines}
            />
          </section>
        )}

        {tab === 'history' && (
          <section>
            <div className="st3-section-title">
              <HistoryIcon />
              Mouvements récents
            </div>

            <MovementList
              movements={movements}
            />
          </section>
        )}
      </div>

      {canMoveStock && (
        <footer className="st3-inspector-footer">
          <button
            type="button"
            className="st3-primary-button"
            onClick={() => onReceive(item)}
            disabled={!canReceive}
            title={
              canReceive
                ? 'Enregistrer une réception'
                : 'Créez d’abord un dépôt'
            }
          >
            <ReceptionIcon />
            {canReceive
              ? 'Enregistrer une réception'
              : 'Aucun dépôt configuré'}
          </button>
        </footer>
      )}
    </aside>
  );
});


export default StockInspector;
