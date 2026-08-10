/**
 * Cinq indicateurs décisionnels du cockpit BlueVector.
 * Les valeurs proviennent du résumé backend ou d'un repli factuel calculé
 * depuis les interventions chargées par DashboardHome.
 */

import { createElement, memo } from 'react';

const OVERDUE_UNAVAILABLE_MESSAGE =
  'Règle métier du retard non configurée';

function displayCount(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : '—';
}

function storeNavigationIntent(intent) {
  try {
    if (intent) {
      sessionStorage.setItem('cockpit_filter', JSON.stringify(intent));
    } else {
      sessionStorage.removeItem('cockpit_filter');
    }
  } catch {
    // Le payload de navigation reste la source principale.
  }
}

function ClipboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="4.5" width="14" height="17" rx="2.5" />
      <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l2.2-5 4.1 10 2.2-5H21" />
    </svg>
  );
}

function ClockAlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2M18.5 4.5l1 1M5.5 4.5l-1 1" />
    </svg>
  );
}

function SirenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17v-5a5 5 0 0 1 10 0v5M5 20h14M12 3V1M4.2 6.2 2.8 4.8M19.8 6.2l1.4-1.4" />
    </svg>
  );
}

function UserMinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c.7-4.1 2.8-6.2 6-6.2s5.3 2.1 6 6.2M16 10h5" />
    </svg>
  );
}

const KpiCard = memo(function KpiCard({
  title,
  value,
  subtitle,
  tone,
  icon: Icon,
  onActivate,
  unavailableReason,
  ariaLabel,
}) {
  const actionable = typeof onActivate === 'function' && !unavailableReason;
  const className = [
    'cockpit-kpi-card',
    `cockpit-kpi-card--${tone}`,
    actionable ? 'cockpit-kpi-card--actionable' : 'cockpit-kpi-card--static',
  ].join(' ');

  const content = (
    <>
      <div className="cockpit-kpi-card-top">
        <span className="cockpit-kpi-icon" aria-hidden="true">{createElement(Icon)}</span>
        <span className="cockpit-kpi-state">{unavailableReason ? 'Non configuré' : 'Aujourd’hui'}</span>
      </div>

      <div className="cockpit-kpi-value">{value}</div>

      <div className="cockpit-kpi-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>

      {actionable ? <span className="cockpit-kpi-arrow" aria-hidden="true">→</span> : null}
    </>
  );

  if (!actionable) {
    return (
      <article
        className={className}
        aria-disabled="true"
        aria-label={unavailableReason ? `${ariaLabel}. ${unavailableReason}` : ariaLabel}
        title={unavailableReason || undefined}
      >
        {content}
      </article>
    );
  }

  return (
    <button type="button" className={className} onClick={onActivate} aria-label={ariaLabel}>
      {content}
    </button>
  );
});

const KpiGrid = memo(function KpiGrid({ summary, onNavigate }) {
  const total = displayCount(summary?.total);
  const inProgress = displayCount(summary?.in_progress);
  const urgent = displayCount(summary?.urgent);
  const unassigned = displayCount(summary?.unassigned);
  const canNavigate = typeof onNavigate === 'function';

  const navigate = (intent = null) => {
    if (!canNavigate) return;
    storeNavigationIntent(intent);
    onNavigate('interventions', intent);
  };

  const cards = [
    {
      key: 'total',
      title: 'Aujourd’hui',
      value: total,
      subtitle: 'Interventions planifiées',
      tone: total === '—' ? 'muted' : 'primary',
      icon: ClipboardIcon,
      onActivate: canNavigate ? () => navigate(null) : undefined,
      ariaLabel: `Aujourd’hui : ${total} intervention${total === 1 ? '' : 's'}`,
    },
    {
      key: 'in-progress',
      title: 'En cours',
      value: inProgress,
      subtitle: 'Activité terrain',
      tone: inProgress === '—' ? 'muted' : 'purple',
      icon: ActivityIcon,
      onActivate: canNavigate ? () => navigate({ status: 'in_progress' }) : undefined,
      ariaLabel: `En cours : ${inProgress} intervention${inProgress === 1 ? '' : 's'}`,
    },
    {
      key: 'overdue',
      title: 'En retard',
      value: '—',
      subtitle: 'Règle indisponible',
      tone: 'muted',
      icon: ClockAlertIcon,
      unavailableReason: OVERDUE_UNAVAILABLE_MESSAGE,
      ariaLabel: 'Interventions en retard indisponibles',
    },
    {
      key: 'urgent',
      title: 'Urgentes',
      value: urgent,
      subtitle: urgent === 0 ? 'Aucune urgence active' : 'À traiter en priorité',
      tone: urgent === '—' ? 'muted' : urgent === 0 ? 'success' : 'danger',
      icon: SirenIcon,
      onActivate: canNavigate ? () => navigate({ priority: 'URGENT' }) : undefined,
      ariaLabel: `Urgentes : ${urgent} intervention${urgent === 1 ? '' : 's'}`,
    },
    {
      key: 'unassigned',
      title: 'Non affectées',
      value: unassigned,
      subtitle: unassigned === 0 ? 'Aucune affectation requise' : 'Affectation nécessaire',
      tone: unassigned === '—' ? 'muted' : unassigned === 0 ? 'success' : 'warning',
      icon: UserMinusIcon,
      onActivate: canNavigate ? () => navigate({ unassigned: true }) : undefined,
      ariaLabel: `Non affectées : ${unassigned} intervention${unassigned === 1 ? '' : 's'}`,
    },
  ];

  return (
    <section className="cockpit-kpi-band cockpit-kpi-band--v3" aria-label="Indicateurs opérationnels">
      <div className="cockpit-kpi-grid cockpit-kpi-grid--v3">
        {cards.map((card) => <KpiCard key={card.key} {...card} />)}
      </div>
    </section>
  );
});

KpiGrid.displayName = 'KpiGrid';

export default KpiGrid;
