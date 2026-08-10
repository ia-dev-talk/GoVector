import { createElement, memo } from 'react';
import {
  MapIcon,
  SignalIcon,
  UserIcon,
} from './ReportIcons';
import {
  formatCount,
} from './reportUtils';


function RankingPanel({
  eyebrow,
  title,
  items,
  tone,
  Icon,
  emptyMessage,
}) {
  const max =
    Math.max(
      1,
      ...items.map(
        (item) =>
          item.count,
      ),
    );

  return (
    <article
      className={[
        'rv3-panel',
        'rv3-ranking-panel',
        items.length === 0
          ? 'rv3-ranking-panel--empty'
          : '',
      ].filter(Boolean).join(' ')}
    >
      <header className="rv3-panel-header">
        <span className={`rv3-panel-icon rv3-panel-icon--${tone}`}>
          {createElement(Icon)}
        </span>

        <div>
          <span>{eyebrow}</span>
          <strong>{title}</strong>
        </div>
      </header>

      <div className="rv3-ranking-list">
        {items.length === 0 ? (
          <div className="rv3-empty">
            {emptyMessage}
          </div>
        ) : (
          items.map(
            (item, index) => (
              <div
                key={`${item.label}-${index}`}
                className="rv3-ranking-row"
              >
                <span className="rv3-ranking-rank">
                  {index + 1}
                </span>

                <span className="rv3-ranking-name">
                  <strong>
                    {item.label}
                  </strong>

                  <i>
                    <b
                      style={{
                        width:
                          `${Math.max(
                            4,
                            item.count /
                              max *
                              100,
                          )}%`,
                      }}
                    />
                  </i>
                </span>

                <span className="rv3-ranking-value">
                  <strong>
                    {formatCount(
                      item.count,
                    )}
                  </strong>
                  <small>
                    intervention
                    {item.count > 1
                      ? 's'
                      : ''}
                  </small>
                </span>
              </div>
            ),
          )
        )}
      </div>
    </article>
  );
}


const ReportsRankings = memo(function ReportsRankings({
  analytics,
}) {
  return (
    <section className="rv3-rankings-grid">
      <RankingPanel
        eyebrow="Charge par ressource"
        title="Techniciens"
        items={
          analytics.technicianRanking
        }
        tone="primary"
        Icon={UserIcon}
        emptyMessage="Aucune affectation technicien sur la période."
      />

      <RankingPanel
        eyebrow="Répartition territoriale"
        title="Secteurs"
        items={
          analytics.sectorRanking
        }
        tone="success"
        Icon={MapIcon}
        emptyMessage="Aucune donnée secteur sur la période."
      />

      <RankingPanel
        eyebrow="Volumes contractuels"
        title="Opérateurs"
        items={
          analytics.operatorRanking
        }
        tone="warning"
        Icon={SignalIcon}
        emptyMessage="Aucune donnée opérateur sur la période."
      />
    </section>
  );
});


export default ReportsRankings;
