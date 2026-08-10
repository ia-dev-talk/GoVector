import { createElement, memo } from 'react';
import {
  AlertIcon,
  BoxIcon,
  EmptyIcon,
  MoneyIcon,
  ReservedIcon,
} from './StockIcons';
import { formatMoney } from './stockUtils';


const CARDS = Object.freeze([
  {
    key: 'all',
    label: 'Catalogue',
    metric: 'catalog',
    tone: 'primary',
    Icon: BoxIcon,
  },
  {
    key: 'available',
    label: 'Disponibles',
    metric: 'available',
    tone: 'success',
    Icon: BoxIcon,
  },
  {
    key: 'reserved',
    label: 'Réservées',
    metric: 'reserved',
    tone: 'info',
    Icon: ReservedIcon,
  },
  {
    key: 'low',
    label: 'Stock faible',
    metric: 'lowStock',
    tone: 'warning',
    Icon: AlertIcon,
  },
  {
    key: 'empty',
    label: 'Ruptures',
    metric: 'empty',
    tone: 'danger',
    Icon: EmptyIcon,
  },
]);


const StockKpiStrip = memo(function StockKpiStrip({
  summary,
  activeFilter,
  onFilter,
}) {
  return (
    <section
      className="st3-kpis"
      aria-label="Indicateurs de stock"
    >
      {CARDS.map(
        ({
          key,
          label,
          metric,
          tone,
          Icon,
        }) => (
          <button
            type="button"
            key={key}
            className={[
              'st3-kpi',
              `st3-kpi--${tone}`,
              activeFilter === key
                ? 'st3-kpi--active'
                : '',
            ].join(' ')}
            onClick={() =>
              onFilter(
                activeFilter === key &&
                key !== 'all'
                  ? 'all'
                  : key,
              )
            }
          >
            <span className="st3-kpi-icon">
              {createElement(Icon)}
            </span>

            <span className="st3-kpi-value">
              {summary?.[metric] ?? 0}
            </span>

            <span className="st3-kpi-label">
              {label}
            </span>
          </button>
        ),
      )}

      <div className="st3-value-card">
        <span className="st3-kpi-icon">
          <MoneyIcon />
        </span>

        <span>
          <small>Valeur théorique</small>
          <strong>
            {formatMoney(
              summary?.value,
            )}
          </strong>
        </span>
      </div>
    </section>
  );
});


export default StockKpiStrip;
