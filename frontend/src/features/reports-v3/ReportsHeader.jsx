import {
  memo,
  useMemo,
  useRef,
  useState,
} from 'react';
import { apiClient } from '../../api/client';
import {
  CalendarIcon,
  ExportIcon,
  RefreshIcon,
  ReportsIcon,
} from './ReportIcons';
import { resolveReportRealtimeStatus } from './reportRealtimeStatus';
import {
  formatFrenchCivilDate,
  parseFrenchCivilDate,
  sanitizeFrenchDateDraft,
} from './reportDateInput';
import {
  PERIOD_OPTIONS,
  formatRange,
} from './reportUtils';

const RANGE_OPTIONS = Object.freeze([
  ...PERIOD_OPTIONS,
  { value: 'exact', label: 'Jour exact' },
  { value: 'custom', label: 'Période personnalisée' },
]);

function civilDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function FrenchCivilDateField({
  value,
  onChange,
  label,
  invalid = false,
}) {
  const [draft, setDraft] = useState(() => formatFrenchCivilDate(value));
  const nativeDateRef = useRef(null);

  const commit = (nextDraft) => {
    const parsed = parseFrenchCivilDate(nextDraft);
    onChange?.(parsed ?? '');
    return parsed;
  };

  const handleCalendarChange = (event) => {
    const nextValue = event.target.value;
    setDraft(formatFrenchCivilDate(nextValue));
    onChange?.(nextValue);
  };

  return (
    <div className="rv3-date-field">
      <input
        className="rv3-date-text-input"
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={draft}
        placeholder="jj/mm/aaaa"
        aria-label={label}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          const nextDraft = sanitizeFrenchDateDraft(event.target.value);
          setDraft(nextDraft);

          if (!nextDraft || nextDraft.length === 10) {
            commit(nextDraft);
          }
        }}
        onBlur={() => {
          const parsed = commit(draft);
          if (parsed) setDraft(formatFrenchCivilDate(parsed));
        }}
      />

      <div className="rv3-date-picker">
        <button
          type="button"
          className="rv3-date-picker-button"
          title="Choisir dans le calendrier"
          aria-label={`Ouvrir le calendrier pour ${label}`}
          onClick={() => {
            const input = nativeDateRef.current;
            if (!input) return;

            input.focus({ preventScroll: true });

            if (typeof input.showPicker === 'function') {
              try {
                input.showPicker();
                return;
              } catch {
                // Fallback navigateur ci-dessous.
              }
            }

            input.click();
          }}
        >
          <CalendarIcon />
        </button>

        <input
          ref={nativeDateRef}
          className="rv3-date-native-input"
          type="date"
          value={value || ''}
          tabIndex={-1}
          aria-label={`${label} via calendrier`}
          aria-invalid={invalid || undefined}
          onChange={handleCalendarChange}
        />
      </div>
    </div>
  );
}

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
  exactDate = '',
  onExactDateChange,
  customStart = '',
  onCustomStartChange,
  customEnd = '',
  onCustomEndChange,
  periodError = '',
}) {
  const [magillanBusy, setMagillanBusy] = useState(false);
  const [magillanError, setMagillanError] = useState('');

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

  const exportMagillan = async () => {
    if (magillanBusy || exportDisabled || periodError) return;

    const startDate = civilDateKey(range?.start);
    const endDate = civilDateKey(range?.end);
    if (!startDate || !endDate) {
      setMagillanError('Période invalide pour le rapport Magillan.');
      return;
    }

    setMagillanBusy(true);
    setMagillanError('');

    try {
      const response = await apiClient.post(
        '/export/magillan-daily',
        {
          filters: {
            start_date: startDate,
            end_date: endDate,
          },
        },
        { responseType: 'blob' },
      );

      const filename = startDate === endDate
        ? `RAPPORT_JOURNALIER_MAGILLAN_${startDate}.pdf`
        : `RAPPORT_JOURNALIER_MAGILLAN_${startDate}_${endDate}.pdf`;
      downloadBlob(
        new Blob([response.data], { type: 'application/pdf' }),
        filename,
      );
    } catch (error) {
      setMagillanError(
        error?.response?.data?.detail ||
        'Impossible de générer le rapport journalier Magillan.',
      );
    } finally {
      setMagillanBusy(false);
    }
  };

  return (
    <header className="rv3-header">
      <div className="rv3-header-identity">
        <span className="rv3-eyebrow">Analytique FTTH</span>

        <div className="rv3-title-row">
          <span className="rv3-title-icon"><ReportsIcon /></span>

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
            <p>Performance, activité et qualité des données terrain</p>
          </div>
        </div>
      </div>

      <div className="rv3-period-controls">
        <label>
          <CalendarIcon />
          <select
            value={period}
            onChange={(event) => onPeriodChange(event.target.value)}
            aria-label="Période d’analyse"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        {period === 'exact' && (
          <div className="rv3-period-field">
            <span>Jour</span>
            <FrenchCivilDateField
              value={exactDate}
              onChange={onExactDateChange}
              label="Jour exact analysé au format jj/mm/aaaa"
              invalid={Boolean(periodError)}
            />
          </div>
        )}

        {period === 'custom' && (
          <>
            <div className="rv3-period-field">
              <span>Début</span>
              <FrenchCivilDateField
                value={customStart}
                onChange={onCustomStartChange}
                label="Début de la période personnalisée au format jj/mm/aaaa"
                invalid={Boolean(periodError)}
              />
            </div>

            <div className="rv3-period-field">
              <span>Fin</span>
              <FrenchCivilDateField
                value={customEnd}
                onChange={onCustomEndChange}
                label="Fin de la période personnalisée au format jj/mm/aaaa"
                invalid={Boolean(periodError)}
              />
            </div>
          </>
        )}

        <span className="rv3-range-pill">{formatRange(range)}</span>
        {periodError && (
          <span className="rv3-period-error" role="alert">{periodError}</span>
        )}
        {magillanError && (
          <span className="rv3-period-error" role="alert">{magillanError}</span>
        )}
      </div>

      <div className="rv3-header-actions">
        {lastUpdatedAt && (
          <span
            className="rv3-updated-at"
            title={lastUpdatedAt.toLocaleString('fr-FR')}
          >
            MAJ{' '}
            {lastUpdatedAt.toLocaleTimeString('fr-FR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}

        <button
          type="button"
          className="rv3-icon-button"
          onClick={onRefresh}
          disabled={refreshing || Boolean(periodError)}
          aria-label="Actualiser les rapports"
          title={periodError ? 'Corrigez la période avant d’actualiser.' : 'Actualiser'}
        >
          <RefreshIcon spinning={refreshing} />
        </button>

        <button
          type="button"
          className="rv3-primary-button rv3-magillan-button"
          onClick={exportMagillan}
          disabled={magillanBusy || exportDisabled || Boolean(periodError)}
          title="Générer le modèle RAPPORT JOURNALIER Magillan fourni"
        >
          <ExportIcon />
          {magillanBusy ? 'Magillan…' : 'Rapport Magillan'}
        </button>

        <button
          type="button"
          className="rv3-primary-button"
          onClick={onExport}
          disabled={exportDisabled || Boolean(periodError)}
          title={exportDisabled || periodError
            ? 'Attendez un périmètre valide et chargé avant d’exporter.'
            : undefined}
        >
          <ExportIcon />
          Autre export
        </button>
      </div>
    </header>
  );
});

export default ReportsHeader;
