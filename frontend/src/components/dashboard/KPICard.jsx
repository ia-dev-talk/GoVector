/**
 * KPICard — carte de présentation d'un indicateur BlueVector.
 *
 * Le composant reste volontairement non interactif : la navigation,
 * les boutons et les permissions appartiennent au composant parent.
 */

import { memo } from 'react';

const COLOR_MAP = Object.freeze({
  primary:
    'var(--color-accent, #4a9eff)',
  success:
    'var(--color-success, #4caf6a)',
  warning:
    'var(--color-warning, #e5a834)',
  danger:
    'var(--color-danger, #e05555)',
  info:
    'var(--color-info, #5b9bd5)',
  purple:
    'var(--color-purple, #9b7ed8)',
  muted:
    'var(--text-muted, #6b6f78)',
});

const TREND_CONFIG = Object.freeze({
  up: {
    symbol: '↑',
    label: 'Hausse',
  },
  down: {
    symbol: '↓',
    label: 'Baisse',
  },
});

function hasContent(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== false &&
    value !== ''
  );
}

function displayValue(value) {
  if (
    value === null ||
    value === undefined ||
    (
      typeof value === 'string' &&
      value.trim() === ''
    )
  ) {
    return '—';
  }

  return value;
}

function accessibleText(value) {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint'
  ) {
    return String(value).trim();
  }

  return '';
}

function resolveColor(value) {
  return (
    COLOR_MAP[value] ||
    COLOR_MAP.primary
  );
}

function resolveTrendDirection(value) {
  return Object.prototype.hasOwnProperty.call(
    TREND_CONFIG,
    value,
  )
    ? value
    : null;
}

const KPICard = memo(
  function KPICard({
    title,
    value,
    subtitle,
    color = 'primary',
    icon,
    trend,
    trendDirection,
    className = '',
    style,
    ariaLabel,
  }) {
    const shownValue =
      displayValue(value);

    const hasSubtitle =
      hasContent(subtitle);

    const hasIcon =
      hasContent(icon);

    const hasTrend =
      hasContent(trend);

    const direction =
      resolveTrendDirection(
        trendDirection,
      );

    const trendConfiguration =
      direction
        ? TREND_CONFIG[
            direction
          ]
        : null;

    const titleText =
      accessibleText(title);

    const valueText =
      accessibleText(
        shownValue,
      );

    const subtitleText =
      hasSubtitle
        ? accessibleText(
            subtitle,
          )
        : '';

    const tooltip = [
      titleText,
      valueText,
      subtitleText,
    ]
      .filter(Boolean)
      .join(' · ');

    const normalizedClassName = [
      'kpi-card',
      typeof className ===
        'string'
        ? className.trim()
        : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        className={
          normalizedClassName
        }
        style={{
          ...(style &&
          typeof style ===
            'object'
            ? style
            : {}),
          '--kpi-color':
            resolveColor(color),
        }}
        title={
          tooltip || undefined
        }
        aria-label={
          accessibleText(
            ariaLabel,
          ) || undefined
        }
        data-kpi-color={
          COLOR_MAP[color]
            ? color
            : 'primary'
        }
      >
        <div className="kpi-card-header">
          {hasIcon && (
            <span
              className="kpi-card-icon"
              aria-hidden="true"
            >
              {icon}
            </span>
          )}

          <span className="kpi-card-title">
            {title}
          </span>
        </div>

        <div className="kpi-card-value">
          {shownValue}
        </div>

        {hasSubtitle && (
          <div className="kpi-card-subtitle">
            {subtitle}
          </div>
        )}

        {hasTrend && (
          <div
            className={[
              'kpi-card-trend',
              direction
                ? `kpi-card-trend--${direction}`
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={
              trendConfiguration
                ? `${trendConfiguration.label} : ${
                    accessibleText(
                      trend,
                    ) ||
                    'valeur indiquée'
                  }`
                : undefined
            }
          >
            {trendConfiguration && (
              <span aria-hidden="true">
                {
                  trendConfiguration.symbol
                }
              </span>
            )}

            <span>{trend}</span>
          </div>
        )}
      </div>
    );
  },
);

KPICard.displayName =
  'KPICard';

export default KPICard;
