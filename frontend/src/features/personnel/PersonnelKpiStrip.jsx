import { createElement } from 'react';
import {
  ActivityIcon,
  OfflineIcon,
  PauseIcon,
  PinIcon,
  RouteIcon,
  UserCheckIcon,
} from './PersonnelIcons';

const KPI_DEFINITIONS = Object.freeze([
  {
    key: 'disponible',
    label: 'Disponibles',
    tone: 'success',
    Icon: UserCheckIcon,
  },
  {
    key: 'en_route',
    label: 'En route',
    tone: 'info',
    Icon: RouteIcon,
  },
  {
    key: 'en_intervention',
    label: 'En intervention',
    tone: 'purple',
    Icon: ActivityIcon,
  },
  {
    key: 'pause',
    label: 'En pause',
    tone: 'warning',
    Icon: PauseIcon,
  },
  {
    key: 'hors_service',
    label: 'Hors ligne',
    tone: 'muted',
    Icon: OfflineIcon,
  },
  {
    key: 'gps_lost',
    label: 'GPS à vérifier',
    tone: 'danger',
    Icon: PinIcon,
  },
]);

export default function PersonnelKpiStrip({
  counts,
  activeFilter,
  onFilterChange,
}) {
  return (
    <section
      className="personnel-v3-kpis"
      aria-label="Indicateurs du personnel"
    >
      {KPI_DEFINITIONS.map(({ key, label, tone, Icon }) => {
        const active = activeFilter === key;
        const value = counts[key] ?? 0;

        return (
          <button
            key={key ?? 'total'}
            type="button"
            className={[
              'personnel-v3-kpi',
              `personnel-v3-kpi--${tone}`,
              active ? 'personnel-v3-kpi--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => onFilterChange?.(key)}
            aria-pressed={active}
          >
            <span className="personnel-v3-kpi-icon">
              {createElement(Icon)}
            </span>

            <span className="personnel-v3-kpi-copy">
              <strong>{value}</strong>
              <span>{label}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
