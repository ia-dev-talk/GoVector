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


function StatusRow({
  label,
  value,
  total,
  tone,
}) {
  const percentage =
    total > 0
      ? value / total * 100
      : 0;

  return (
    <div className="rv3-status-row">
      <span className="rv3-status-label">
        <i className={`rv3-dot rv3-dot--${tone}`} />
        {label}
      </span>

      <span className="rv3-status-track">
        <i
          className={`rv3-status-fill rv3-status-fill--${tone}`}
          style={{
            width:
              `${Math.max(
                0,
                Math.min(
                  100,
                  percentage,
                ),
              )}%`,
          }}
        />
      </span>

      <strong>
        {formatCount(value)}
      </strong>
    </div>
  );
}


function HourlyChart({
  items,
}) {
  const max =
    Math.max(
      1,
      ...items.map(
        (item) =>
          item.count,
      ),
    );

  if (items.length === 0) {
    return (
      <div className="rv3-empty">
        Aucun créneau horaire exploitable sur la période.
      </div>
    );
  }

  return (
    <div className="rv3-hourly-chart">
      {items.map((item) => (
        <div
          key={item.hour}
          className="rv3-hour-column"
          title={`${String(
            item.hour,
          ).padStart(2, '0')}:00 — ${item.count} intervention${item.count > 1 ? 's' : ''}`}
        >
          <span>
            {item.count}
          </span>

          <i
            style={{
              height:
                `${Math.max(
                  8,
                  item.count /
                    max *
                    100,
                )}%`,
            }}
          />

          <small>
            {String(
              item.hour,
            ).padStart(2, '0')}h
          </small>
        </div>
      ))}
    </div>
  );
}


const ReportsOverview = memo(function ReportsOverview({
  analytics,
  activeTechnicians,
  totalTechnicians,
}) {
  const rate =
    Math.max(
      0,
      Math.min(
        100,
        Number(
          analytics?.successRate,
        ) || 0,
      ),
    );

  return (
    <section className="rv3-overview-grid">
      <article className="rv3-panel rv3-performance-panel">
        <header className="rv3-panel-header">
          <span className="rv3-panel-icon rv3-panel-icon--success">
            <CheckIcon />
          </span>

          <div>
            <span>Performance opérationnelle</span>
            <strong>
              Résultat de la période
            </strong>
          </div>
        </header>

        <div className="rv3-performance-body">
          <div
            className="rv3-rate-ring"
            style={{
              '--rv3-rate':
                `${rate * 3.6}deg`,
            }}
          >
            <div>
              <strong>
                {formatPercentage(
                  analytics?.successRate,
                )}
              </strong>
              <span>réussite</span>
            </div>
          </div>

          <div className="rv3-performance-metrics">
            <div>
              <span>Terminées</span>
              <strong>
                {formatCount(
                  analytics?.completed,
                )}
              </strong>
            </div>

            <div>
              <span>Annulées</span>
              <strong>
                {formatCount(
                  analytics?.cancelled,
                )}
              </strong>
            </div>

            <div>
              <span>Échecs</span>
              <strong>
                {formatCount(
                  analytics?.failed,
                )}
              </strong>
            </div>

            <div>
              <span>Affectation</span>
              <strong>
                {formatPercentage(
                  analytics?.assignmentRate,
                )}
              </strong>
            </div>
          </div>
        </div>
      </article>

      <article className="rv3-panel rv3-status-panel">
        <header className="rv3-panel-header">
          <span className="rv3-panel-icon rv3-panel-icon--primary">
            <SignalIcon />
          </span>

          <div>
            <span>Flux des interventions</span>
            <strong>
              Répartition des statuts
            </strong>
          </div>
        </header>

        <div className="rv3-status-list">
          {analytics.statusDistribution.map(
            (item) => (
              <StatusRow
                key={item.key}
                label={item.label}
                value={item.value}
                total={analytics.total}
                tone={item.tone}
              />
            ),
          )}
        </div>

        <footer className="rv3-field-capacity">
          <span>
            Techniciens actifs maintenant
          </span>

          <strong>
            {activeTechnicians === null
              ? '—'
              : formatCount(
                  activeTechnicians,
                )}
            {totalTechnicians !== null && (
              <small>
                {' '}/ {formatCount(
                  totalTechnicians,
                )}
              </small>
            )}
          </strong>
        </footer>
      </article>

      <article className="rv3-panel rv3-activity-panel">
        <header className="rv3-panel-header">
          <span className="rv3-panel-icon rv3-panel-icon--purple">
            <ActivityIcon />
          </span>

          <div>
            <span>Cadence terrain</span>
            <strong>
              Distribution horaire
            </strong>
          </div>
        </header>

        <HourlyChart
          items={
            analytics.hourlyDistribution
          }
        />
      </article>
    </section>
  );
});


export default ReportsOverview;
