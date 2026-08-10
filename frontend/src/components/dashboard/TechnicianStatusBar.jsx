/**
 * TechnicianStatusBar — répartition des techniciens actifs par statut.
 *
 * Les cinq catégories correspondent exactement au résumé backend :
 * available, on_job, en_route, on_break et off_duty.
 */

import { memo, useMemo } from 'react';

const STATUS_DEFINITIONS = Object.freeze([
  {
    key: 'available',
    label: 'Disponibles',
    color: 'var(--color-success, #4caf6a)',
  },
  {
    key: 'onJob',
    label: 'En intervention',
    color: 'var(--color-accent, #4a9eff)',
  },
  {
    key: 'enRoute',
    label: 'En route',
    color: 'var(--color-info, #5b9bd5)',
  },
  {
    key: 'onBreak',
    label: 'En pause',
    color: 'var(--color-warning, #e5a834)',
  },
  {
    key: 'offDuty',
    label: 'Hors service',
    color: 'var(--text-muted, #8d929c)',
  },
]);

const UNCLASSIFIED_STATUS = Object.freeze({
  key: 'unclassified',
  label: 'Non classés',
  color: 'var(--text-secondary, #c3c7cf)',
});

function normalizeCount(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : null;
}

function formatCount(value) {
  return new Intl.NumberFormat('fr-FR').format(value);
}

function formatPercentage(value) {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 1,
  }).format(value);
}

function pluralizeTechnician(value) {
  return value === 1 ? 'technicien' : 'techniciens';
}

const TechnicianStatusBar = memo(function TechnicianStatusBar({
  available,
  onJob,
  enRoute,
  onBreak,
  offDuty,
  total,
  className = '',
  style,
  ariaLabel = 'Répartition des techniciens par statut',
}) {
  const model = useMemo(() => {
    const rawValues = {
      available,
      onJob,
      enRoute,
      onBreak,
      offDuty,
    };

    const statuses = STATUS_DEFINITIONS.map((definition) => ({
      ...definition,
      value: normalizeCount(rawValues[definition.key]),
    }));

    const validStatuses = statuses.filter(
      (status) => status.value !== null,
    );

    const categorizedTotal = validStatuses.reduce(
      (sum, status) => sum + status.value,
      0,
    );

    const reportedTotal = normalizeCount(total);
    const hasAnyData =
      reportedTotal !== null || validStatuses.length > 0;

    if (!hasAnyData) {
      return {
        statuses,
        displayedStatuses: statuses,
        reportedTotal: null,
        displayedTotal: null,
        denominator: 0,
        categorizedTotal: 0,
        mismatch: false,
        summary: 'Données techniciens indisponibles',
      };
    }

    const displayedTotal =
      reportedTotal ?? categorizedTotal;

    const unclassified =
      reportedTotal !== null && reportedTotal > categorizedTotal
        ? reportedTotal - categorizedTotal
        : 0;

    const displayedStatuses =
      unclassified > 0
        ? [
            ...statuses,
            {
              ...UNCLASSIFIED_STATUS,
              value: unclassified,
            },
          ]
        : statuses;

    /*
     * Le total backend reste affiché tel quel. Si les catégories le
     * dépassent, la barre utilise leur somme pour éviter un débordement
     * visuel tout en signalant explicitement l'incohérence.
     */
    const denominator = Math.max(
      displayedTotal,
      categorizedTotal,
      0,
    );

    const mismatch =
      reportedTotal !== null &&
      reportedTotal < categorizedTotal;

    const summaryParts = displayedStatuses
      .filter((status) => status.value !== null)
      .map(
        (status) =>
          `${status.label} : ${formatCount(status.value)}`,
      );

    return {
      statuses,
      displayedStatuses,
      reportedTotal,
      displayedTotal,
      denominator,
      categorizedTotal,
      mismatch,
      summary:
        displayedTotal === 0
          ? 'Aucun technicien actif'
          : `${formatCount(displayedTotal)} ${pluralizeTechnician(
              displayedTotal,
            )}. ${summaryParts.join('. ')}`,
    };
  }, [
    available,
    enRoute,
    offDuty,
    onBreak,
    onJob,
    total,
  ]);

  const normalizedClassName = [
    'tech-status-bar',
    typeof className === 'string' ? className.trim() : '',
  ]
    .filter(Boolean)
    .join(' ');

  const totalText =
    model.displayedTotal === null
      ? '—'
      : formatCount(model.displayedTotal);

  const inconsistencyMessage = model.mismatch
    ? `Incohérence de données : ${formatCount(
        model.displayedTotal,
      )} au total, mais ${formatCount(
        model.categorizedTotal,
      )} répartis dans les statuts.`
    : '';

  return (
    <section
      className={normalizedClassName}
      style={
        style && typeof style === 'object'
          ? style
          : undefined
      }
      aria-label={ariaLabel}
      data-status-mismatch={model.mismatch ? 'true' : 'false'}
    >
      <div className="tech-status-header">
        <h3>
          <span aria-hidden="true">👥</span>
          {' '}
          Techniciens
        </h3>

        <span
          className="tech-status-total"
          title={inconsistencyMessage || undefined}
        >
          {totalText} au total
        </span>
      </div>

      <div
        className="tech-status-bar-track"
        role="img"
        aria-label={model.summary}
        title={inconsistencyMessage || model.summary}
      >
        {model.denominator > 0 &&
          model.displayedStatuses.map((status) => {
            const value = status.value ?? 0;
            const percentage =
              (value / model.denominator) * 100;

            if (value <= 0) {
              return null;
            }

            return (
              <div
                key={status.key}
                className="tech-status-bar-segment"
                aria-hidden="true"
                style={{
                  width: `${Math.min(100, percentage)}%`,
                  backgroundColor: status.color,
                }}
              />
            );
          })}
      </div>

      <div
        className="tech-status-labels"
        role="list"
        aria-label="Détail des statuts technicien"
      >
        {model.displayedStatuses.map((status) => {
          const value = status.value;
          const percentage =
            value !== null && model.denominator > 0
              ? (value / model.denominator) * 100
              : null;

          const detail =
            value === null
              ? `${status.label} : donnée indisponible`
              : `${status.label} : ${formatCount(value)} ${
                  pluralizeTechnician(value)
                }${
                  percentage !== null
                    ? `, ${formatPercentage(percentage)} %`
                    : ''
                }`;

          return (
            <div
              key={status.key}
              className="tech-status-label-item"
              role="listitem"
              title={detail}
            >
              <span
                className="tech-status-dot"
                aria-hidden="true"
                style={{
                  backgroundColor: status.color,
                  opacity: value === null ? 0.35 : 1,
                }}
              />

              <span className="tech-status-label">
                {status.label}
              </span>

              <span className="tech-status-count">
                {value === null ? '—' : formatCount(value)}
              </span>
            </div>
          );
        })}
      </div>

      {model.mismatch && (
        <p
          role="status"
          style={{
            margin: 'var(--space-3) 0 0',
            color: 'var(--color-warning)',
            fontSize: 'var(--font-size-xs)',
            lineHeight: 1.4,
          }}
        >
          {inconsistencyMessage}
        </p>
      )}
    </section>
  );
});

TechnicianStatusBar.displayName = 'TechnicianStatusBar';

export default TechnicianStatusBar;
