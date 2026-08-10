/**
 * KPICharts — répartitions analytiques du centre de supervision.
 *
 * Le composant utilise uniquement les séries fournies par le résumé backend.
 * Il ne dépend d'aucune bibliothèque graphique externe et conserve toutes
 * les classes historiques définies dans dashboard.css.
 */

import {
  memo,
  useMemo,
} from 'react';

import {
  getJobTypeLabel,
} from '../../lib/job-types';

const CHART_COLORS = Object.freeze([
  'var(--color-accent, #4a9eff)',
  'var(--color-success, #4caf6a)',
  'var(--color-warning, #e5a834)',
  'var(--color-danger, #e05555)',
  'var(--color-purple, #9b7ed8)',
  'var(--color-info, #5b9bd5)',
  'var(--text-secondary, #c3c7cf)',
  'var(--text-muted, #8d929c)',
]);

const PRIORITY_CONFIG = Object.freeze({
  URGENT: {
    label: 'Urgente',
    rank: 0,
    color:
      'var(--color-danger, #e05555)',
  },
  HAUTE: {
    label: 'Haute',
    rank: 1,
    color:
      'var(--color-warning, #e5a834)',
  },
  NORMALE: {
    label: 'Normale',
    rank: 2,
    color:
      'var(--color-info, #5b9bd5)',
  },
  FAIBLE: {
    label: 'Faible',
    rank: 3,
    color:
      'var(--text-muted, #8d929c)',
  },
});

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function text(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

function nonNegativeNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);

  return (
    Number.isFinite(parsed) &&
    parsed >= 0
  )
    ? parsed
    : null;
}

function stripEnumPrefix(value) {
  const normalized = text(value);

  if (!normalized) {
    return '';
  }

  const parts =
    normalized.split('.');

  return (
    parts[
      parts.length - 1
    ] || normalized
  ).trim();
}

function humanizeIdentifier(value) {
  const normalized =
    stripEnumPrefix(value)
      .replace(/[_-]+/g, ' ')
      .toLocaleLowerCase('fr');

  if (!normalized) {
    return '';
  }

  return normalized.replace(
    /^./,
    (character) =>
      character.toUpperCase(),
  );
}

function formatCount(value) {
  return new Intl.NumberFormat(
    'fr-FR',
    {
      maximumFractionDigits: 2,
    },
  ).format(value);
}

function formatPercentage(value) {
  return new Intl.NumberFormat(
    'fr-FR',
    {
      maximumFractionDigits: 1,
    },
  ).format(value);
}

function formatHour(value) {
  const parsed =
    nonNegativeNumber(value);

  if (
    parsed === null ||
    parsed > 23
  ) {
    return humanizeIdentifier(
      value,
    );
  }

  return `${String(
    Math.trunc(parsed),
  ).padStart(2, '0')}h`;
}

function formatJobType(value) {
  const identifier =
    stripEnumPrefix(value)
      .toLocaleUpperCase('fr');

  const fallback =
    humanizeIdentifier(
      identifier,
    );

  return (
    getJobTypeLabel(
      identifier,
      fallback,
    ) || fallback
  );
}

function priorityDetails(value) {
  const identifier =
    stripEnumPrefix(value)
      .toLocaleUpperCase('fr');

  return (
    PRIORITY_CONFIG[
      identifier
    ] || {
      label:
        humanizeIdentifier(
          identifier,
        ) ||
        'Non renseignée',
      rank: 99,
      color:
        'var(--text-muted, #8d929c)',
    }
  );
}

function defaultLabel(value) {
  return (
    humanizeIdentifier(
      value,
    ) ||
    'Non renseigné'
  );
}

function normalizeSeries(
  source,
  {
    labelKey,
    valueKey = 'count',
    labelFormatter =
      defaultLabel,
    metadataFormatter,
    sorter,
  },
) {
  if (!Array.isArray(source)) {
    return [];
  }

  const aggregated =
    new Map();

  source.forEach(
    (item, sourceIndex) => {
      if (!isRecord(item)) {
        return;
      }

      const value =
        nonNegativeNumber(
          item[valueKey],
        );

      if (value === null) {
        return;
      }

      const label =
        text(
          labelFormatter(
            item[labelKey],
            item,
          ),
        ) ||
        'Non renseigné';

      const current =
        aggregated.get(label);

      const metadata =
        typeof metadataFormatter ===
        'function'
          ? metadataFormatter(
              item,
              label,
            )
          : {};

      if (current) {
        current.value += value;
        current.sourceCount += 1;
        return;
      }

      aggregated.set(label, {
        key:
          `${label}:${sourceIndex}`,
        label,
        value,
        sourceIndex,
        sourceCount: 1,
        ...(
          isRecord(metadata)
            ? metadata
            : {}
        ),
      });
    },
  );

  const result =
    [...aggregated.values()];

  if (
    typeof sorter ===
    'function'
  ) {
    result.sort(sorter);
  }

  return result;
}

function descendingCountSorter(
  first,
  second,
) {
  return (
    second.value -
      first.value ||
    first.label.localeCompare(
      second.label,
      'fr',
      {
        sensitivity: 'base',
      },
    )
  );
}

function BarChart({
  data,
  title,
  color,
  colorForItem,
}) {
  if (!data.length) {
    return null;
  }

  const maximum =
    Math.max(
      ...data.map(
        (item) =>
          item.value,
      ),
      1,
    );

  return (
    <section
      className="chart-container"
      aria-label={title}
    >
      <h4 className="chart-title">
        {title}
      </h4>

      <div
        className="chart-bars"
        role="list"
      >
        {data.map(
          (item, index) => {
            const percentage =
              maximum > 0
                ? (
                    item.value /
                    maximum
                  ) * 100
                : 0;

            const itemColor =
              typeof colorForItem ===
              'function'
                ? colorForItem(
                    item,
                    index,
                  )
                : (
                    color ||
                    item.color ||
                    CHART_COLORS[
                      index %
                        CHART_COLORS.length
                    ]
                  );

            const valueText =
              formatCount(
                item.value,
              );

            const accessibleLabel =
              `${item.label} : ${valueText} intervention` +
              `${
                item.value === 1
                  ? ''
                  : 's'
              }`;

            return (
              <div
                key={item.key}
                className="chart-bar-item"
                role="listitem"
                title={
                  accessibleLabel
                }
              >
                <div
                  className="chart-bar-label"
                  title={item.label}
                >
                  {item.label}
                </div>

                <div
                  className="chart-bar-track"
                  role="progressbar"
                  aria-label={
                    accessibleLabel
                  }
                  aria-valuemin={0}
                  aria-valuemax={
                    maximum
                  }
                  aria-valuenow={
                    item.value
                  }
                >
                  <div
                    className="chart-bar-fill"
                    aria-hidden="true"
                    style={{
                      width:
                        `${Math.max(
                          0,
                          Math.min(
                            100,
                            percentage,
                          ),
                        )}%`,
                      minWidth:
                        item.value > 0
                          ? 2
                          : 0,
                      backgroundColor:
                        itemColor,
                    }}
                  />
                </div>

                <div className="chart-bar-value">
                  {valueText}
                </div>
              </div>
            );
          },
        )}
      </div>
    </section>
  );
}

function DistributionLegend({
  data,
  title,
}) {
  if (!data.length) {
    return null;
  }

  const total =
    data.reduce(
      (sum, item) =>
        sum + item.value,
      0,
    );

  return (
    <section
      className="chart-container"
      aria-label={title}
    >
      <h4 className="chart-title">
        {title}
      </h4>

      <div
        className="chart-pie-legend"
        role="list"
      >
        {data.map(
          (item, index) => {
            const percentage =
              total > 0
                ? (
                    item.value /
                    total
                  ) * 100
                : 0;

            const color =
              item.color ||
              CHART_COLORS[
                index %
                  CHART_COLORS.length
              ];

            const countText =
              formatCount(
                item.value,
              );

            const percentageText =
              formatPercentage(
                percentage,
              );

            return (
              <div
                key={item.key}
                className="chart-legend-item"
                role="listitem"
                title={
                  `${item.label} : ${countText} (${percentageText} %)`
                }
              >
                <span
                  className="chart-legend-dot"
                  aria-hidden="true"
                  style={{
                    backgroundColor:
                      color,
                  }}
                />

                <span className="chart-legend-label">
                  {item.label}
                </span>

                <span className="chart-legend-value">
                  {countText}
                  {' '}
                  ({percentageText} %)
                </span>
              </div>
            );
          },
        )}
      </div>
    </section>
  );
}

const KPICharts = memo(
  function KPICharts({
    byOperator = [],
    byType = [],
    priorityBreakdown = [],
    hourlyDistribution = [],
  }) {
    const operatorData =
      useMemo(
        () =>
          normalizeSeries(
            byOperator,
            {
              labelKey:
                'operator',
              labelFormatter:
                (value) =>
                  text(value) ||
                  'Non renseigné',
              sorter:
                descendingCountSorter,
            },
          ),
        [byOperator],
      );

    const typeData =
      useMemo(
        () =>
          normalizeSeries(
            byType,
            {
              labelKey: 'type',
              labelFormatter:
                formatJobType,
              sorter:
                descendingCountSorter,
            },
          ),
        [byType],
      );

    const priorityData =
      useMemo(
        () =>
          normalizeSeries(
            priorityBreakdown,
            {
              labelKey:
                'priority',
              labelFormatter:
                (value) =>
                  priorityDetails(
                    value,
                  ).label,
              metadataFormatter:
                (item) => {
                  const details =
                    priorityDetails(
                      item.priority,
                    );

                  return {
                    rank:
                      details.rank,
                    color:
                      details.color,
                  };
                },
              sorter:
                (
                  first,
                  second,
                ) =>
                  (
                    first.rank ??
                    99
                  ) -
                    (
                      second.rank ??
                      99
                    ) ||
                  descendingCountSorter(
                    first,
                    second,
                  ),
            },
          ),
        [priorityBreakdown],
      );

    const hourlyData =
      useMemo(
        () =>
          normalizeSeries(
            hourlyDistribution,
            {
              labelKey: 'hour',
              labelFormatter:
                formatHour,
              metadataFormatter:
                (item) => ({
                  hour:
                    nonNegativeNumber(
                      item.hour,
                    ),
                }),
              sorter:
                (
                  first,
                  second,
                ) =>
                  (
                    first.hour ??
                    99
                  ) -
                    (
                      second.hour ??
                      99
                    ) ||
                  first.label.localeCompare(
                    second.label,
                    'fr',
                  ),
            },
          ),
        [hourlyDistribution],
      );

    const hasData =
      operatorData.length > 0 ||
      typeData.length > 0 ||
      priorityData.length >
        0 ||
      hourlyData.length > 0;

    if (!hasData) {
      return (
        <div
          className="charts-empty"
          role="status"
        >
          <p>
            Aucune donnée analytique disponible pour le périmètre du jour.
          </p>
        </div>
      );
    }

    return (
      <div
        className="kpi-charts"
        aria-label="Répartitions des interventions du jour"
      >
        <div className="charts-grid">
          <BarChart
            data={operatorData}
            title="Par opérateur"
          />

          <DistributionLegend
            data={typeData}
            title="Répartition par type"
          />

          <BarChart
            data={priorityData}
            title="Par priorité"
            colorForItem={(
              item,
            ) =>
              item.color
            }
          />

          <BarChart
            data={hourlyData}
            title="Départs par heure"
            color="var(--color-accent, #4a9eff)"
          />
        </div>
      </div>
    );
  },
);

KPICharts.displayName =
  'KPICharts';

export default KPICharts;
