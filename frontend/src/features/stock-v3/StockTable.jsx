import { memo } from 'react';
import {
  FilterIcon,
} from './StockIcons';
import {
  formatMoney,
  normalizeIdentifier,
  text,
} from './stockUtils';


function ItemRow({
  item,
  selected,
  onSelect,
}) {
  return (
    <button
      type="button"
      className={[
        'st3-item-row',
        selected
          ? 'st3-item-row--selected'
          : '',
        item.is_active === false
          ? 'st3-item-row--inactive'
          : '',
      ].join(' ')}
      onClick={() =>
        onSelect(
          normalizeIdentifier(
            item?.id,
          ),
        )
      }
    >
      <span className="st3-reference st3-col-reference">
        <strong>
          {text(item?.reference, '—')}
        </strong>
        <small>
          {text(item?.category, 'Sans catégorie')}
        </small>
      </span>

      <span className="st3-item-label st3-col-item">
        <strong>
          {text(item?.label, 'Article sans libellé')}
        </strong>
        <small>
          {[
            text(item?.manufacturer),
            text(item?.model),
          ].filter(Boolean).join(' · ') ||
            'Fabricant non renseigné'}
        </small>
      </span>

      <span className="st3-col-type">
        <strong>
          {text(item?.equipment_type, '—')}
        </strong>
        <small>type</small>
      </span>

      <span className="st3-col-operator">
        <strong>
          {text(item?.operator, '—')}
        </strong>
        <small>opérateur</small>
      </span>

      <span className="st3-col-physical">
        <strong>
          {item.totals.quantity}
        </strong>
        <small>{text(item?.unit, 'unité')}</small>
      </span>

      <span className="st3-col-available">
        <strong className="st3-success">
          {item.totals.available}
        </strong>
        <small>disponibles</small>
      </span>

      <span className="st3-col-reserved">
        <strong className={
          item.totals.reserved > 0
            ? 'st3-info'
            : ''
        }>
          {item.totals.reserved}
        </strong>
        <small>réservées</small>
      </span>

      <span className="st3-col-price">
        <strong>
          {formatMoney(item?.unit_price)}
        </strong>
        <small>prix unitaire</small>
      </span>

      <span
        className={[
          'st3-stock-state',
          'st3-col-state',
          item.empty
            ? 'st3-stock-state--danger'
            : item.lowStock
              ? 'st3-stock-state--warning'
              : 'st3-stock-state--success',
        ].join(' ')}
      >
        {item.empty
          ? 'Rupture'
          : item.lowStock
            ? 'Faible'
            : 'Disponible'}
      </span>
    </button>
  );
}


const StockTable = memo(function StockTable({
  items,
  totalCount,
  selectedId,
  onSelect,
  equipmentType,
  onEquipmentType,
  operator,
  onOperator,
  types,
  operators,
}) {
  return (
    <section className="st3-table-panel">
      <header className="st3-panel-header">
        <div>
          <span>Catalogue consolidé</span>
          <strong>Articles FTTH</strong>
        </div>

        <span className="st3-count-pill">
          {items.length}
          {' '}affiché
          {items.length > 1 ? 's' : ''}
          {' '}sur {totalCount}
        </span>
      </header>

      <div className="st3-table-toolbar">
        <label>
          <FilterIcon />
          <select
            value={equipmentType}
            onChange={(event) =>
              onEquipmentType(
                event.target.value,
              )
            }
          >
            <option value="">
              Tous les types
            </option>
            {types.map((value) => (
              <option
                key={value}
                value={value}
              >
                {value}
              </option>
            ))}
          </select>
        </label>

        <label>
          <FilterIcon />
          <select
            value={operator}
            onChange={(event) =>
              onOperator(
                event.target.value,
              )
            }
          >
            <option value="">
              Tous les opérateurs
            </option>
            {operators.map((value) => (
              <option
                key={value}
                value={value}
              >
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="st3-table-head">
        <span className="st3-col-reference">Référence</span>
        <span className="st3-col-item">Article</span>
        <span className="st3-col-type">Type</span>
        <span className="st3-col-operator">Opérateur</span>
        <span className="st3-col-physical">Physique</span>
        <span className="st3-col-available">Disponible</span>
        <span className="st3-col-reserved">Réservé</span>
        <span className="st3-col-price">Prix</span>
        <span className="st3-col-state">État</span>
      </div>

      <div className="st3-table-body">
        {items.length === 0 ? (
          <div className="st3-empty">
            <strong>
              Aucun article correspondant
            </strong>
            <span>
              Modifiez la recherche, le dépôt ou les filtres.
            </span>
          </div>
        ) : (
          items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              selected={
                selectedId ===
                normalizeIdentifier(
                  item?.id,
                )
              }
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </section>
  );
});


export default StockTable;
