import { createElement, memo } from 'react';
import {
  ActivityIcon,
  AlertIcon,
  CheckIcon,
  ClipboardIcon,
  ClockIcon,
  TrendDownIcon,
  TrendUpIcon,
  UserIcon,
} from './ReportIcons';
import {
  formatCount,
  formatPercentage,
  reportHasAnalyticalData,
} from './reportUtils';


const DEFINITIONS = Object.freeze([
  {
    key: 'total',
    label: 'Interventions',
    metric: 'total',
    tone: 'primary',
    Icon: ClipboardIcon,
    intent: null,
  },
  {
    key: 'completed',
    label: 'Terminées',
    metric: 'completed',
    tone: 'success',
    Icon: CheckIcon,
    intent: null,
  },
  {
    key: 'inProgress',
    label: 'En cours',
    metric: 'inProgress',
    tone: 'purple',
    Icon: ActivityIcon,
    intent: {
      status: 'in_progress',
    },
  },
  {
    key: 'pending',
    label: 'En attente',
    metric: 'pending',
    tone: 'warning',
    Icon: ClockIcon,
    intent: null,
  },
  {
    key: 'urgent',
    label: 'Urgentes',
    metric: 'urgent',
    tone: 'danger',
    Icon: AlertIcon,
    intent: {
      priority: 'URGENT',
    },
  },
  {
    key: 'unassigned',
    label: 'Non affectées',
    metric: 'unassigned',
    tone: 'info',
    Icon: UserIcon,
    intent: {
      unassigned: true,
    },
  },
]);


function Trend({
  value,
  direction,
}) {
  if (
    value === null ||
    value === undefined
  ) {
    return (
      <span className="rv3-kpi-trend rv3-kpi-trend--neutral">
        nouvelle base
      </span>
    );
  }

  const absolute =
    Math.abs(value);

  const Icon =
    direction === 'down'
      ? TrendDownIcon
      : TrendUpIcon;

  return (
    <span
      className={[
        'rv3-kpi-trend',
        `rv3-kpi-trend--${direction}`,
      ].join(' ')}
    >
      {direction !== 'neutral' && (
        <Icon />
      )}
      {direction === 'neutral'
        ? 'stable'
        : `${new Intl.NumberFormat(
            'fr-FR',
            {
              maximumFractionDigits: 1,
            },
          ).format(absolute)} %`}
    </span>
  );
}


const ReportsKpiStrip = memo(function ReportsKpiStrip({
  analytics,
  comparison,
  onOpenInterventions,
}) {
  const showComparison = reportHasAnalyticalData(analytics);

  return (
    <section
      className="rv3-kpis"
      aria-label="Indicateurs de la période"
    >
      {DEFINITIONS.map(
        ({
          key,
          label,
          metric,
          tone,
          Icon,
          intent,
        }) => {
          const trend = (
            showComparison &&
            comparison?.[key]
          ) || null;

          const content = (
            <>
              <span className="rv3-kpi-icon">
                {createElement(Icon)}
              </span>

              <span className="rv3-kpi-main">
                <strong>
                  {formatCount(
                    analytics?.[metric],
                  )}
                </strong>
                <small>{label}</small>
              </span>

              {trend && (
                <Trend
                  value={trend.value}
                  direction={
                    trend.direction
                  }
                />
              )}
            </>
          );

          if (
            !intent ||
            typeof onOpenInterventions !==
              'function'
          ) {
            return (
              <div
                key={key}
                className={`rv3-kpi rv3-kpi--${tone}`}
              >
                {content}
              </div>
            );
          }

          return (
            <button
              type="button"
              key={key}
              className={`rv3-kpi rv3-kpi--${tone}`}
              onClick={() =>
                onOpenInterventions(
                  intent,
                )
              }
              title={`Ouvrir les interventions : ${label}`}
            >
              {content}
            </button>
          );
        },
      )}

      <div className="rv3-kpi rv3-kpi--success rv3-kpi--rate">
        <span className="rv3-kpi-icon">
          <CheckIcon />
        </span>

        <span className="rv3-kpi-main">
          <strong>
            {formatPercentage(
              analytics?.successRate,
            )}
          </strong>
          <small>Taux de réussite</small>
        </span>

        {showComparison && (
          <Trend
            value={
              comparison?.successRate
                ?.value
            }
            direction={
              comparison?.successRate
                ?.direction ||
              'neutral'
            }
          />
        )}
      </div>
    </section>
  );
});


export default ReportsKpiStrip;
