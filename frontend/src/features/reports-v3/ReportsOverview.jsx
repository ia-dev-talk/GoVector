import { memo } from 'react';
import {
  ActivityIcon,
  CheckIcon,
  SignalIcon,
} from './ReportIcons';
import {
  formatCount,
  formatPercentage,
} from './reportUtils';
import { trendExplanation } from './reportTrendUtils';


function StatusRow({
  label,
  value,
  total,
  tone,
}) {
  const percentage = total > 0 ? value / total * 100 : 0;

  return (
    <div className="rv3-status-row">
      <span className="rv3-status-label">
        <i className={`rv3-dot rv3-dot--${tone}`} />
        {label}
      </span>
      <span className="rv3-status-track">
        <i
          className={`rv3-status-fill rv3-status-fill--${tone}`}
          style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
        />
      </span>
      <strong>{formatCount(value)}</strong>
    </div>
  );
}


function HourlyChart({ items }) {
  const max = Math.max(1, ...items.map((item) => item.count));

  if (items.length === 0) {
    return <div className="rv3-empty">Aucun créneau horaire exploitable sur la période.</div>;
  }

  return (
    <div className="rv3-hourly-chart">
      {items.map((item) => (
        <div
          key={item.hour}
          className="rv3-hour-column"
          title={`${String(item.hour).padStart(2, '0')}:00 — ${item.count} intervention${item.count > 1 ? 's' : ''}`}
        >
          <span>{item.count}</span>
          <i style={{ height: `${Math.max(8, item.count / max * 100)}%` }} />
          <small>{String(item.hour).padStart(2, '0')}h</small>
        </div>
      ))}
    </div>
  );
}


function RegressionPanel({ analytics }) {
  if (!analytics || analytics.daily.length < 2) {
    return (
      <article className="rv3-panel rv3-activity-panel">
        <header className="rv3-panel-header">
          <span className="rv3-panel-icon rv3-panel-icon--purple"><ActivityIcon /></span>
          <div><span>Tendance & régression</span><strong>Évolution quotidienne</strong></div>
        </header>
        <div className="rv3-empty">Sélectionnez une période de plusieurs jours pour calculer une tendance.</div>
      </article>
    );
  }

  const r2 = Number.isFinite(analytics.volume.r2)
    ? new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(analytics.volume.r2)
    : '—';
  const slope = new Intl.NumberFormat('fr-FR', {
    signDisplay: 'always',
    maximumFractionDigits: 2,
  }).format(analytics.volume.slope);

  return (
    <article className="rv3-panel rv3-performance-panel">
      <header className="rv3-panel-header">
        <span className="rv3-panel-icon rv3-panel-icon--purple"><ActivityIcon /></span>
        <div>
          <span>Tendance & régression</span>
          <strong>Évolution quotidienne</strong>
        </div>
      </header>

      <div className="rv3-performance-metrics">
        <div><span>Pente volume</span><strong>{slope}</strong><small> / jour</small></div>
        <div><span>R²</span><strong>{r2}</strong></div>
        <div><span>Jours actifs</span><strong>{analytics.nonEmptyDays}</strong></div>
        <div><span>Observations</span><strong>{analytics.daily.length}</strong></div>
      </div>

      <div className="rv3-empty">
        {trendExplanation(analytics.volume, 'volume')}
        {!analytics.canInterpret
          ? ' Interprétation prudente : période ou activité encore insuffisante pour une décision de capacité.'
          : ''}
      </div>
    </article>
  );
}


const ReportsOverview = memo(function ReportsOverview({
  analytics,
  trendAnalytics,
  activeTechnicians,
  totalTechnicians,
}) {
  const rate = Math.max(0, Math.min(100, Number(analytics?.successRate) || 0));
  const distributedStatusTotal = analytics.statusDistribution.reduce(
    (sum, item) => sum + item.value,
    0,
  );

  return (
    <section className="rv3-overview-grid">
      <article className="rv3-panel rv3-performance-panel">
        <header className="rv3-panel-header">
          <span className="rv3-panel-icon rv3-panel-icon--success"><CheckIcon /></span>
          <div><span>Performance opérationnelle</span><strong>Résultat de la période</strong></div>
        </header>

        <div className="rv3-performance-body">
          <div className="rv3-rate-ring" style={{ '--rv3-rate': `${rate * 3.6}deg` }}>
            <div><strong>{formatPercentage(analytics?.successRate)}</strong><span>réussite</span></div>
          </div>
          <div className="rv3-performance-metrics">
            <div><span>Terminées</span><strong>{formatCount(analytics?.completed)}</strong></div>
            <div><span>Annulées</span><strong>{formatCount(analytics?.cancelled)}</strong></div>
            <div><span>Échecs</span><strong>{formatCount(analytics?.failed)}</strong></div>
            <div><span>Affectation</span><strong>{formatPercentage(analytics?.assignmentRate)}</strong></div>
          </div>
        </div>
      </article>

      <article className="rv3-panel rv3-status-panel">
        <header className="rv3-panel-header">
          <span className="rv3-panel-icon rv3-panel-icon--primary"><SignalIcon /></span>
          <div><span>Flux des interventions</span><strong>Répartition des statuts</strong></div>
        </header>

        <div className="rv3-status-list">
          {analytics.statusDistribution.length ? (
            analytics.statusDistribution.map((item) => (
              <StatusRow key={item.key} label={item.label} value={item.value} total={analytics.total} tone={item.tone} />
            ))
          ) : (
            <div className="rv3-empty">Aucune intervention sur la période.</div>
          )}
        </div>

        <footer className="rv3-status-reconciliation">
          <span>Statuts représentés</span>
          <strong>{formatCount(distributedStatusTotal)} / {formatCount(analytics.total)}</strong>
        </footer>
      </article>

      <article
        className="rv3-panel rv3-status-panel"
        aria-label="Contexte live hors périmètre analytique"
      >
        <header className="rv3-panel-header">
          <span className="rv3-panel-icon rv3-panel-icon--primary"><SignalIcon /></span>
          <div><span>Contexte live</span><strong>Capacité terrain actuelle</strong></div>
        </header>

        <div className="rv3-empty">
          Instantané courant selon votre périmètre d’accès. Cette capacité n’est pas filtrée par la période ni les filtres analytiques.
        </div>

        <footer className="rv3-field-capacity">
          <span>Techniciens actifs maintenant</span>
          <strong>
            {activeTechnicians === null ? '—' : formatCount(activeTechnicians)}
            {totalTechnicians !== null && <small>{' '}/ {formatCount(totalTechnicians)}</small>}
          </strong>
        </footer>
      </article>

      <article className="rv3-panel rv3-activity-panel">
        <header className="rv3-panel-header">
          <span className="rv3-panel-icon rv3-panel-icon--purple"><ActivityIcon /></span>
          <div><span>Cadence terrain</span><strong>Distribution horaire</strong></div>
        </header>
        <HourlyChart items={analytics.hourlyDistribution} />
      </article>

      <RegressionPanel analytics={trendAnalytics} />
    </section>
  );
});


export default ReportsOverview;
