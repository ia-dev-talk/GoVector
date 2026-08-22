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
import { stockV3Api } from './stockV3Api';
import {
  formatDateTime,
  formatMoney,
  movementLabel,
  numeric,
  text,
} from './stockUtils';

function Metric({ label, value, tone = 'neutral' }) {
  return (
    <div className={`st3-metric st3-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WarehouseLines({ lines }) {
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
          <span className="st3-line-icon"><WarehouseIcon /></span>
          <span>
            <strong>
              {text(line?.warehouse?.name, `Dépôt #${line.warehouse_id}`)}
            </strong>
            <small>Lot {text(line?.batch_number, 'non renseigné')}</small>
          </span>
          <span>
            <strong>{numeric(line?.quantity)}</strong>
            <small>physique</small>
          </span>
          <span>
            <strong className="st3-success">
              {numeric(line?.available_quantity)}
            </strong>
            <small>disponible</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function movementDirection(movement) {
  const quantity = numeric(movement?.quantity);
  if (quantity < 0) return 'Sortie';
  if (quantity > 0) return 'Entrée';
  return 'Ajustement';
}

function MovementList({ movements }) {
  if (movements.length === 0) {
    return (
      <div className="st3-inspector-empty">
        Aucun mouvement enregistré pour cet article et ce périmètre.
      </div>
    );
  }

  return (
    <div className="st3-movement-list st3-movement-list--readable">
      {movements.map((movement) => {
        const quantity = numeric(movement?.quantity);
        const direction = movementDirection(movement);
        const technician = text(movement?.technician_name);
        const employeeId = text(movement?.technician_employee_id);
        const warehouse = text(
          movement?.warehouse_name,
          text(movement?.warehouse_code, 'Emplacement non renseigné'),
        );
        const jobId = movement?.job_id ? `Intervention #${movement.job_id}` : '';

        return (
          <article key={movement.id} className="st3-movement-card">
            <div className="st3-movement-card__topline">
              <span
                className={`st3-movement-type st3-movement-type--${String(
                  movement?.movement_type,
                ).toLocaleLowerCase('fr')}`}
              >
                {movementLabel(movement?.movement_type)}
              </span>
              <time>{formatDateTime(movement?.created_at)}</time>
            </div>

            <div className="st3-movement-card__amount">
              <strong>{Math.abs(quantity)}</strong>
              <span>{Math.abs(quantity) > 1 ? 'unités' : 'unité'} · {direction}</span>
              <small>
                Solde {numeric(movement?.quantity_before)} → {numeric(movement?.quantity_after)}
              </small>
            </div>

            <div className="st3-movement-card__context">
              <span>Emplacement</span>
              <strong>{warehouse}</strong>
              {movement?.warehouse_code ? <small>{movement.warehouse_code}</small> : null}
            </div>

            <div className="st3-movement-card__context">
              <span>Technicien</span>
              <strong>{technician || 'Aucun technicien lié'}</strong>
              {employeeId ? <small>{employeeId}</small> : null}
            </div>

            <div className="st3-movement-card__note">
              <span>Contexte</span>
              <strong>{jobId || text(movement?.notes, 'Mouvement hors intervention')}</strong>
              {jobId && movement?.notes ? <small>{movement.notes}</small> : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

const StockInspector = memo(function StockInspector({
  item,
  movements,
  canManageCatalog,
  canMoveStock,
  canReceive,
  canIssue = false,
  onEdit,
  onReceive,
  onIssue,
}) {
  const [tab, setTab] = useState('overview');
  const snapshotWritable = stockV3Api.isSnapshotWritable();

  if (!item) {
    return (
      <aside className="st3-inspector st3-inspector--empty">
        <BoxIcon />
        <strong>Sélectionnez un article</strong>
        <span>
          Consultez sa disponibilité, ses dépôts et sa traçabilité.
        </span>
      </aside>
    );
  }

  const hasAvailableStock = Number(item?.totals?.available ?? 0) > 0;
  const staleActionTitle = 'Snapshot stock non frais — actualisez avant modification';

  return (
    <aside className="st3-inspector">
      <header className="st3-inspector-header">
        <span className="st3-inspector-icon"><BoxIcon /></span>
        <div>
          <span>Fiche article</span>
          <strong>{text(item?.label, 'Article')}</strong>
          <small>{text(item?.reference, 'Référence inconnue')}</small>
        </div>
        {canManageCatalog ? (
          <button
            type="button"
            className="st3-icon-button"
            onClick={() => onEdit(item)}
            disabled={!snapshotWritable}
            title={snapshotWritable ? 'Modifier' : staleActionTitle}
            aria-label="Modifier l’article"
          >
            <EditIcon />
          </button>
        ) : null}
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
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="st3-inspector-body">
        {tab === 'overview' ? (
          <>
            <section>
              <div className="st3-section-title">Référentiel</div>
              <div className="st3-detail-grid">
                <div>
                  <span>Type</span>
                  <strong>{text(item?.equipment_type, '—')}</strong>
                </div>
                <div>
                  <span>Opérateur</span>
                  <strong>{text(item?.operator, '—')}</strong>
                </div>
                <div>
                  <span>Fabricant</span>
                  <strong>{text(item?.manufacturer, '—')}</strong>
                </div>
                <div>
                  <span>Modèle</span>
                  <strong>{text(item?.model, '—')}</strong>
                </div>
                <div>
                  <span>Catégorie</span>
                  <strong>{text(item?.category, '—')}</strong>
                </div>
                <div>
                  <span>Prix unitaire</span>
                  <strong>
                    {item?.unit_price === null || item?.unit_price === undefined
                      ? 'Non suivi'
                      : formatMoney(item.unit_price)}
                  </strong>
                </div>
              </div>
            </section>

            <section>
              <div className="st3-section-title">Situation du périmètre</div>
              <div className="st3-metrics-grid">
                <Metric label="Stock physique" value={item.totals.quantity} />
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
                <Metric label="Emplacements" value={item.warehouseCount} />
                <Metric
                  label="Seuil minimum"
                  value={item.threshold}
                  tone={item.lowStock ? 'warning' : 'neutral'}
                />
                <Metric
                  label="Valeur"
                  value={
                    item?.unit_price === null || item?.unit_price === undefined
                      ? 'Non suivie'
                      : formatMoney(
                          item.totals.quantity * numeric(item.unit_price),
                        )
                  }
                />
              </div>

              {item.lowStock ? (
                <div className="st3-alert-note">
                  <AlertIcon />
                  Le disponible est inférieur ou égal au seuil configuré.
                </div>
              ) : null}
            </section>
          </>
        ) : null}

        {tab === 'warehouses' ? (
          <section>
            <div className="st3-section-title">Répartition par emplacement</div>
            <WarehouseLines lines={item.lines} />
          </section>
        ) : null}

        {tab === 'history' ? (
          <section className="st3-history-section">
            <div className="st3-section-title">
              <HistoryIcon />
              Mouvements récents
            </div>
            <MovementList movements={movements} />
          </section>
        ) : null}
      </div>

      {canMoveStock ? (
        <footer className="st3-inspector-footer st3-inspector-footer--stacked">
          {canIssue ? (
            <button
              type="button"
              className="st3-primary-button"
              onClick={() => onIssue(item)}
              disabled={!snapshotWritable || !hasAvailableStock}
              title={
                !snapshotWritable
                  ? staleActionTitle
                  : hasAvailableStock
                    ? 'Affecter une quantité à un technicien'
                    : 'Aucun stock disponible à affecter'
              }
            >
              <BoxIcon />
              Affecter au technicien
            </button>
          ) : null}
          <button
            type="button"
            className="st3-secondary-button"
            onClick={() => onReceive(item)}
            disabled={!snapshotWritable || !canReceive}
            title={
              !snapshotWritable
                ? staleActionTitle
                : canReceive
                  ? 'Enregistrer une réception'
                  : 'Créez d’abord un dépôt'
            }
          >
            <ReceptionIcon />
            {canReceive ? 'Réception' : 'Aucun dépôt'}
          </button>
        </footer>
      ) : null}
    </aside>
  );
});

export default StockInspector;
