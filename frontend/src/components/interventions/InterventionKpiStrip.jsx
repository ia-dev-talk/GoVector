import { memo, useMemo } from 'react';


function IconBase({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}


function ClipboardIcon() {
  return (
    <IconBase>
      <rect x="5" y="4.5" width="14" height="17" rx="2.5" />
      <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" />
    </IconBase>
  );
}


function PendingIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2M8.5 2.5h7" />
    </IconBase>
  );
}


function AssignedIcon() {
  return (
    <IconBase>
      <path d="M3 16.5V8.8c0-1 .8-1.8 1.8-1.8h11.7c.8 0 1.5.4 1.9 1.1l2 3.4c.4.6.6 1.3.6 2v3" />
      <path d="M3 13h18M7 7l1.5-3h6L16 7" />
      <circle cx="7" cy="17.5" r="2" />
      <circle cx="18" cy="17.5" r="2" />
    </IconBase>
  );
}


function ActivityIcon() {
  return (
    <IconBase>
      <path d="M3 12h4l2.2-5 4.1 10 2.2-5H21" />
    </IconBase>
  );
}


function CompletedIcon() {
  return (
    <IconBase>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8 12 2.6 2.7L16.5 9" />
    </IconBase>
  );
}


function TeamIcon() {
  return (
    <IconBase>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M3 20c.7-4 2.8-6 6-6s5.3 2 6 6M14.5 14.5c3.2-.4 5.4 1.3 6.1 4.5" />
    </IconBase>
  );
}


function KpiCard({
  label,
  value,
  subtitle,
  tone,
  icon,
  active,
  onClick,
}) {
  const actionable =
    typeof onClick === 'function';

  const className = [
    'intervention-kpi-card',
    'intervention-kpi-card--v4',
    `intervention-kpi-card--${tone}`,
    active
      ? 'intervention-kpi-card--active'
      : '',
    actionable
      ? 'intervention-kpi-card--actionable'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span
        className="intervention-kpi-icon"
        aria-hidden="true"
      >
        {icon}
      </span>

      <span className="intervention-kpi-copy">
        <strong>{value}</strong>
        <span>{label}</span>
        <small>{subtitle}</small>
      </span>
    </>
  );

  if (!actionable) {
    return (
      <article className={className}>
        {content}
      </article>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label} : ${value}`}
    >
      {content}
    </button>
  );
}


const InterventionKpiStrip = memo(
  function InterventionKpiStrip({
    total = 0,
    metrics,
    activeJobFilter,
    onReset,
    onToggleJobFilter,
    availableTechnicians = 0,
    offlineTechnicians = 0,
    technicianCount = 0,
  }) {
    const cards = useMemo(
      () => [
        {
          key: 'total',
          label: 'Total',
          value: total,
          subtitle: 'Interventions du jour',
          tone: 'primary',
          icon: <ClipboardIcon />,
          active: activeJobFilter === null,
          onClick: onReset,
        },
        {
          key: 'pending',
          label: 'Non affectées',
          value: metrics?.pending ?? 0,
          subtitle: 'À planifier',
          tone: 'warning',
          icon: <PendingIcon />,
          active: activeJobFilter === 'pending',
          onClick: () =>
            onToggleJobFilter?.('pending'),
        },
        {
          key: 'assigned',
          label: 'Affectées',
          value: metrics?.assigned ?? 0,
          subtitle: 'Planifiées',
          tone: 'info',
          icon: <AssignedIcon />,
          active: activeJobFilter === 'assigned',
          onClick: () =>
            onToggleJobFilter?.('assigned'),
        },
        {
          key: 'in-progress',
          label: 'En cours',
          value: metrics?.inProgress ?? 0,
          subtitle: 'Terrain',
          tone: 'purple',
          icon: <ActivityIcon />,
          active: activeJobFilter === 'in_progress',
          onClick: () =>
            onToggleJobFilter?.('in_progress'),
        },
        {
          key: 'completed',
          label: 'Terminées',
          value: metrics?.completed ?? 0,
          subtitle: 'Clôturées',
          tone: 'success',
          icon: <CompletedIcon />,
          active: activeJobFilter === 'completed',
          onClick: () =>
            onToggleJobFilter?.('completed'),
        },
      ],
      [
        activeJobFilter,
        metrics,
        onReset,
        onToggleJobFilter,
        total,
      ],
    );

    return (
      <section
        className="intervention-kpi-section intervention-kpi-section--v4"
        aria-label="Indicateurs des interventions"
      >
        <div className="intervention-kpi-grid">
          {cards.map((card) => (
            <KpiCard
              key={card.key}
              {...card}
            />
          ))}
        </div>

        <aside className="intervention-workforce-summary intervention-workforce-summary--v4">
          <span className="intervention-workforce-icon">
            <TeamIcon />
          </span>

          <span className="intervention-workforce-total">
            <small>Capacité terrain</small>
            <strong>{technicianCount}</strong>
          </span>

          <span className="intervention-workforce-metric">
            <i className="intervention-status-dot intervention-status-dot--available" />
            <small>Disponibles</small>
            <strong>{availableTechnicians}</strong>
          </span>

          <span className="intervention-workforce-metric">
            <i className="intervention-status-dot intervention-status-dot--offline" />
            <small>Hors ligne</small>
            <strong>{offlineTechnicians}</strong>
          </span>
        </aside>
      </section>
    );
  },
);


InterventionKpiStrip.displayName =
  'InterventionKpiStrip';


export default InterventionKpiStrip;
