import { memo, useMemo } from 'react';
import {
  CalendarIcon,
  ExportIcon,
  RefreshIcon,
  ReportsIcon,
} from './ReportIcons';
import { resolveReportRealtimeStatus } from './reportRealtimeStatus';
import {
  PERIOD_OPTIONS,
  formatRange,
} from './reportUtils';


const ReportsHeader = memo(function ReportsHeader({
  period,
  onPeriodChange,
  range,
  connected,
  lastUpdatedAt,
  refreshing,
  onRefresh,
  onExport,
  exportDisabled = false,
}) {
  const realtimeStatus = useMemo(
    () => resolveReportRealtimeStatus(range, connected),
    [connected, range],
  );

  const realtimeClassName = [
    'rv3-live-pill',
    realtimeStatus.tone === 'connected'
      ? 'rv3-live-pill--connected'
      : realtimeStatus.tone === 'reconnecting'
        ? 'rv3-live-pill--reconnecting'
        : '',
  ].filter(Boolean).join(' ');

  return (
    <header className="rv3-header">
      <div className="rv3-header-identity">
        <span className="rv3-eyebrow">
          Analytique FTTH
        </span>

        <div className="rv3-title-row">
          <span className="rv3-title-icon">
            <ReportsIcon />
          </span>

          <div>
            <div className="rv3-title-line">
              <h1>Rapports</h1>

              <span
                className={realtimeClassName}
                title={realtimeStatus.liveRelevant
                  ? undefined
                  : 'Le statut du flux live ne s’applique pas à cette période.'}
              >
                <i />
                {realtimeStatus.label}
              </span>
            </div>

            <p>
              Performance, activité et qualité des données terrain
            </p>
          </div>
        </div>
      </div>

      <div className="rv3-period-controls">
        <label>
          <CalendarIcon />
          <select
            value={period}
            onChange={(event) =>
              onPeriodChange(
                event.target.value,
              )
            }
            aria-label="Période d’analyse"
          >
            {PERIOD_OPTIONS.map(
              (option) => (
                <option
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </option>
              ),
            )}
          </select>
        </label>

        <span className="rv3-range-pill">
          {formatRange(range)}
        </span>
      </div>

      <div className="rv3-header-actions">
        {lastUpdatedAt && (
          <span
            className="rv3-updated-at"
            title={lastUpdatedAt.toLocaleString(
              'fr-FR',
            )}
          >
            MAJ{' '}
            {lastUpdatedAt.toLocaleTimeString(
              'fr-FR',
              {
                hour: '2-digit',
                minute: '2-digit',
              },
            )}
          </span>
        )}

        <button
          type="button"
          className="rv3-icon-button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Actualiser les rapports"
          title="Actualiser"
        >
          <RefreshIcon
            spinning={refreshing}
          />
        </button>

        <button
          type="button"
          className="rv3-primary-button"
          onClick={onExport}
          disabled={exportDisabled}
          title={exportDisabled
            ? 'Attendez le chargement du périmètre demandé avant d’exporter.'
            : undefined}
        >
          <ExportIcon />
          Nouvel export
        </button>
      </div>
    </header>
  );
});


export default ReportsHeader;
