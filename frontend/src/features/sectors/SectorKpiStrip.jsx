import { createElement, memo } from 'react';
import {
  AlertIcon,
  CheckIcon,
  ClipboardIcon,
  LocationIcon,
  SectorIcon,
  UsersIcon,
} from './SectorIcons';


const CARDS = Object.freeze([
  {
    key: 'all',
    label: 'Tous les secteurs',
    metric: 'total',
    tone: 'primary',
    Icon: SectorIcon,
  },
  {
    key: 'active',
    label: 'Secteurs actifs',
    metric: 'active',
    tone: 'success',
    Icon: CheckIcon,
  },
  {
    key: 'without-tech',
    label: 'Sans technicien',
    metric: 'withoutTechnicians',
    tone: 'warning',
    Icon: UsersIcon,
  },
  {
    key: 'jobs',
    label: 'Interventions du jour',
    metric: 'jobsToday',
    tone: 'info',
    Icon: ClipboardIcon,
  },
  {
    key: 'gps',
    label: 'GPS à vérifier',
    metric: 'gpsIssues',
    tone: 'danger',
    Icon: LocationIcon,
  },
]);


const SectorKpiStrip = memo(function SectorKpiStrip({
  summary,
  activeFilter,
  onFilter,
}) {
  return (
    <section
      className="sv3-kpis"
      aria-label="Indicateurs secteurs"
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
              'sv3-kpi',
              `sv3-kpi--${tone}`,
              activeFilter === key
                ? 'sv3-kpi--active'
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
            <span className="sv3-kpi-icon">
              {createElement(Icon)}
            </span>

            <span className="sv3-kpi-value">
              {summary?.[metric] ?? 0}
            </span>

            <span className="sv3-kpi-label">
              {label}
            </span>

            {key === 'without-tech' &&
            summary?.unlinkedTechnicians > 0 ? (
              <span className="sv3-kpi-note">
                {summary.unlinkedTechnicians}
                {' '}technicien
                {summary.unlinkedTechnicians > 1
                  ? 's'
                  : ''}
                {' '}non lié
                {summary.unlinkedTechnicians > 1
                  ? 's'
                  : ''}
              </span>
            ) : null}

            {key === 'gps' &&
            summary?.gpsIssues > 0 ? (
              <AlertIcon className="sv3-kpi-alert" />
            ) : null}
          </button>
        ),
      )}
    </section>
  );
});


export default SectorKpiStrip;
