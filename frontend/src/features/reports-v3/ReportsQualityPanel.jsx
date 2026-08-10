import { memo } from 'react';
import {
  DatabaseIcon,
  ExportIcon,
} from './ReportIcons';
import {
  formatPercentage,
} from './reportUtils';


function QualityRow({
  label,
  value,
}) {
  const normalized =
    Math.max(
      0,
      Math.min(
        100,
        Number(value) || 0,
      ),
    );

  const tone =
    normalized >= 90
      ? 'success'
      : normalized >= 70
        ? 'warning'
        : 'danger';

  return (
    <div className="rv3-quality-row">
      <span>
        {label}
      </span>

      <i>
        <b
          className={`rv3-quality-fill rv3-quality-fill--${tone}`}
          style={{
            width:
              `${normalized}%`,
          }}
        />
      </i>

      <strong>
        {formatPercentage(
          normalized,
        )}
      </strong>
    </div>
  );
}


const ReportsQualityPanel = memo(function ReportsQualityPanel({
  analytics,
  resultLimitReached,
  onExport,
}) {
  const average =
    analytics.quality.length
      ? analytics.quality.reduce(
          (sum, item) =>
            sum + item.value,
          0,
        ) /
        analytics.quality.length
      : 0;

  return (
    <section className="rv3-bottom-grid">
      <article className="rv3-panel rv3-quality-panel">
        <header className="rv3-panel-header">
          <span className="rv3-panel-icon rv3-panel-icon--info">
            <DatabaseIcon />
          </span>

          <div>
            <span>Qualité des données</span>
            <strong>
              Complétude opérationnelle
            </strong>
          </div>

          <span className="rv3-quality-score">
            {formatPercentage(
              average,
            )}
          </span>
        </header>

        <div className="rv3-quality-list">
          {analytics.quality.map(
            (item) => (
              <QualityRow
                key={item.key}
                label={item.label}
                value={item.value}
              />
            ),
          )}
        </div>

        {resultLimitReached && (
          <div className="rv3-limit-notice">
            La période atteint la limite de 1 000 interventions. Les indicateurs portent sur les premiers résultats retournés.
          </div>
        )}
      </article>

      <article className="rv3-export-card">
        <span className="rv3-export-icon">
          <ExportIcon />
        </span>

        <div>
          <span>Centre d’export FTTH</span>
          <strong>
            Excel, CSV, PDF et ZIP
          </strong>
          <p>
            Générez un export, utilisez les modèles existants et consultez l’historique depuis le workflow sécurisé BlueVector.
          </p>
        </div>

        <button
          type="button"
          className="rv3-primary-button"
          onClick={onExport}
        >
          <ExportIcon />
          Ouvrir le centre
        </button>
      </article>
    </section>
  );
});


export default ReportsQualityPanel;
