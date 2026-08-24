import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api/client';
import ExportCenter from '../components/export/ExportCenter';
import { buildReportExportFilters } from '../components/export/exportScope';
import Toast from '../components/Toast';
import { useRuntimeSettings } from '../contexts/RuntimeSettingsContext';
import ReportsHeader from '../features/reports-v3/ReportsHeader';
import ReportsKpiStrip from '../features/reports-v3/ReportsKpiStrip';
import ReportsOverview from '../features/reports-v3/ReportsOverview';
import ReportsQualityPanel from '../features/reports-v3/ReportsQualityPanel';
import ReportsRankings from '../features/reports-v3/ReportsRankings';
import {
  buildReportBusinessFilterOptions,
  filterReportJobs,
  normalizeReportBusinessFilters,
  reportBusinessFilterCount,
} from '../features/reports-v3/reportBusinessScope';
import { fetchCompleteReportJobs } from '../features/reports-v3/reportJobLoader';
import { civilDateKeyInTimeZone } from '../features/reports-v3/operationalTime';
import { resolveReportPeriodSelection } from '../features/reports-v3/reportPeriodSelection';
import {
  reportScopesMatch,
  resolveReportSnapshot,
} from '../features/reports-v3/reportSnapshot';
import { reportIncludesCivilDate } from '../features/reports-v3/reportRealtimeStatus';
import { buildTrendAnalytics } from '../features/reports-v3/reportTrendUtils';
import {
  activeTechnicianCount,
  buildAnalytics,
  compareAnalytics,
  formatRange,
  localDateKey,
  previousRange,
  totalTechnicianCount,
} from '../features/reports-v3/reportUtils';
import { useWebSocket } from '../hooks/useWebSocket';
import '../styles/reports-v3.css';

const REPORT_PAGE_SIZE = 500;
const POLLING_INTERVAL_MS = 60_000;
const REALTIME_DELAY_MS = 700;
const TOAST_DURATION_MS = 3200;
const EMPTY_STATUS_CAPABILITIES = Object.freeze([]);

function hasOption(options, value) {
  if (!value) return true;
  return options.some((option) => String(option.value) === String(value));
}

function ReportFilterSelect({ label, value, options, onChange, emptyLabel }) {
  return (
    <label>
      <span>{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">{emptyLabel}</option>
        {value && !hasOption(options, value) && (
          <option value={String(value)}>Sélection active · aucune donnée</option>
        )}
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function RapportsPage({ onNavigate }) {
  const { settings: runtimeSettings } = useRuntimeSettings();
  const todayKey = useMemo(() => civilDateKeyInTimeZone(), []);
  const [period, setPeriod] = useState('today');
  const [exactDate, setExactDate] = useState(todayKey);
  const [customStart, setCustomStart] = useState(todayKey);
  const [customEnd, setCustomEnd] = useState(todayKey);
  const [jobs, setJobs] = useState([]);
  const [previousJobs, setPreviousJobs] = useState([]);
  const [technicians, setTechnicians] = useState({});
  const [businessFilters, setBusinessFilters] = useState({});
  const [displayedRange, setDisplayedRange] = useState(() => ({
    start: new Date(),
    end: new Date(),
  }));
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const requestRef = useRef(0);
  const realtimeTimerRef = useRef(null);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef(new Set());

  const periodSelection = useMemo(() => resolveReportPeriodSelection({
    period,
    exactDate,
    customStart,
    customEnd,
  }), [customEnd, customStart, exactDate, period]);
  const range = periodSelection.range ?? displayedRange;
  const liveRelevant = periodSelection.ok && reportIncludesCivilDate(range);
  const scopeMatches = periodSelection.ok && reportScopesMatch(range, displayedRange);
  const scopeTransition = !periodSelection.ok || (hasSnapshot && !scopeMatches);
  const normalizedBusinessFilters = useMemo(
    () => normalizeReportBusinessFilters(businessFilters),
    [businessFilters],
  );
  const activeBusinessFilterCount = useMemo(
    () => reportBusinessFilterCount(normalizedBusinessFilters),
    [normalizedBusinessFilters],
  );
  const businessFilterOptions = useMemo(
    () => buildReportBusinessFilterOptions(jobs),
    [jobs],
  );
  const filteredJobs = useMemo(
    () => filterReportJobs(jobs, normalizedBusinessFilters),
    [jobs, normalizedBusinessFilters],
  );
  const filteredPreviousJobs = useMemo(
    () => filterReportJobs(previousJobs, normalizedBusinessFilters),
    [normalizedBusinessFilters, previousJobs],
  );
  const exportScopeFilters = useMemo(() => {
    if (!hasSnapshot || !scopeMatches || periodSelection.error) return null;

    return buildReportExportFilters({
      startDate: localDateKey(displayedRange.start),
      endDate: localDateKey(displayedRange.end),
      filters: normalizedBusinessFilters,
    });
  }, [
    displayedRange,
    hasSnapshot,
    normalizedBusinessFilters,
    periodSelection.error,
    scopeMatches,
  ]);

  const toast = useCallback((message, type = 'info') => {
    const id = ++toastIdRef.current;
    setToasts((current) => [...current, { id, message, type }]);
    const timer = window.setTimeout(() => {
      toastTimersRef.current.delete(timer);
      setToasts((current) => current.filter((item) => item.id !== id));
    }, TOAST_DURATION_MS);
    toastTimersRef.current.add(timer);
  }, []);

  useEffect(() => () => {
    toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    toastTimersRef.current.clear();
    if (realtimeTimerRef.current) window.clearTimeout(realtimeTimerRef.current);
  }, []);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!periodSelection.ok || !periodSelection.range) {
      setError(periodSelection.error);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const requestedRange = periodSelection.range;
    const requestedPriorRange = previousRange(requestedRange);
    const requestId = ++requestRef.current;
    if (!silent) setRefreshing(true);
    setError('');

    const currentRange = {
      dateFrom: localDateKey(requestedRange.start),
      dateTo: localDateKey(requestedRange.end),
    };
    const previousRangeParams = {
      dateFrom: localDateKey(requestedPriorRange.start),
      dateTo: localDateKey(requestedPriorRange.end),
    };
    const fetchJobs = ({ dateFrom, dateTo }) => fetchCompleteReportJobs({
      fetchPage: (params) => api.getJobs(params),
      dateFrom,
      dateTo,
      pageSize: REPORT_PAGE_SIZE,
    });
    const results = await Promise.allSettled([
      fetchJobs(currentRange).then((data) => ({ data })),
      fetchJobs(previousRangeParams).then((data) => ({ data })),
      api.getDashboardTechnicians(),
    ]);
    if (requestId !== requestRef.current) return;

    const resolution = resolveReportSnapshot(results, {
      limit: Number.MAX_SAFE_INTEGER,
    });

    if (!resolution.ok) {
      setError([
        ...resolution.errors,
        'Le dernier snapshot cohérent est conservé et n’est pas présenté comme mis à jour.',
      ].join(' · '));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const snapshot = resolution.snapshot;
    setJobs(snapshot.jobs);
    setPreviousJobs(snapshot.previousJobs);
    setTechnicians(snapshot.technicians);
    setDisplayedRange({
      start: new Date(requestedRange.start),
      end: new Date(requestedRange.end),
    });
    setHasSnapshot(true);
    setLastUpdatedAt(new Date());
    setError('');
    setLoading(false);
    setRefreshing(false);
  }, [periodSelection]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!periodSelection.ok) {
        setError(periodSelection.error);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      loadData();
    }, 0);
    const interval = liveRelevant && periodSelection.ok
      ? window.setInterval(() => loadData({ silent: true }), POLLING_INTERVAL_MS)
      : null;
    return () => {
      window.clearTimeout(timer);
      if (interval) window.clearInterval(interval);
      if (realtimeTimerRef.current) {
        window.clearTimeout(realtimeTimerRef.current);
        realtimeTimerRef.current = null;
      }
      requestRef.current += 1;
    };
  }, [liveRelevant, loadData, periodSelection.error, periodSelection.ok]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (!liveRelevant) return;
    if (realtimeTimerRef.current) window.clearTimeout(realtimeTimerRef.current);
    realtimeTimerRef.current = window.setTimeout(() => {
      realtimeTimerRef.current = null;
      loadData({ silent: true });
    }, REALTIME_DELAY_MS);
  }, [liveRelevant, loadData]);

  const websocket = useWebSocket('dashboard', {
    onDashboardUpdate: scheduleRealtimeRefresh,
    onJobEvent: scheduleRealtimeRefresh,
    onTechEvent: scheduleRealtimeRefresh,
  });

  const statusCapabilities = runtimeSettings?.workflow?.statuses
    ?? EMPTY_STATUS_CAPABILITIES;
  const analytics = useMemo(
    () => buildAnalytics(filteredJobs, { statusCapabilities }),
    [filteredJobs, statusCapabilities],
  );
  const previousAnalytics = useMemo(
    () => buildAnalytics(filteredPreviousJobs, { statusCapabilities }),
    [filteredPreviousJobs, statusCapabilities],
  );
  const comparison = useMemo(
    () => compareAnalytics(analytics, previousAnalytics),
    [analytics, previousAnalytics],
  );
  const trendAnalytics = useMemo(
    () => buildTrendAnalytics(filteredJobs, displayedRange),
    [displayedRange, filteredJobs],
  );
  const activeTechnicians = activeTechnicianCount(technicians);
  const totalTechnicians = totalTechnicianCount(technicians);

  const updateBusinessFilter = useCallback((key, value) => {
    setBusinessFilters((current) => ({
      ...current,
      [key]: value,
    }));
  }, []);

  const clearBusinessFilters = useCallback(() => {
    setBusinessFilters({});
  }, []);

  const openInterventions = useCallback((intent = null) => {
    if (typeof onNavigate !== 'function') return;
    try {
      if (intent) sessionStorage.setItem('cockpit_filter', JSON.stringify(intent));
      else sessionStorage.removeItem('cockpit_filter');
    } catch {
      // Navigation remains available when browser storage is blocked.
    }
    onNavigate('interventions', intent);
  }, [onNavigate]);

  if (loading && !hasSnapshot) {
    return (
      <div className="rv3-loading-screen" role="status" aria-live="polite">
        <div className="rv3-loading-spinner" />
        Chargement du centre analytique…
      </div>
    );
  }

  return (
    <div className="rv3-page">
      <ReportsHeader
        period={period}
        onPeriodChange={setPeriod}
        range={range}
        connected={websocket.connected}
        lastUpdatedAt={lastUpdatedAt}
        refreshing={refreshing}
        onRefresh={() => loadData()}
        onExport={() => setExportOpen(true)}
        exportDisabled={!hasSnapshot || scopeTransition}
        exactDate={exactDate}
        onExactDateChange={setExactDate}
        customStart={customStart}
        onCustomStartChange={setCustomStart}
        customEnd={customEnd}
        onCustomEndChange={setCustomEnd}
        periodError={periodSelection.error}
      />

      {hasSnapshot && scopeMatches && !periodSelection.error && (
        <div
          className="rv3-period-controls"
          aria-label="Filtres analytiques"
          style={{
            padding: '8px 18px',
            justifyContent: 'flex-start',
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--border-light)',
            background: 'var(--surface-panel-alt)',
          }}
        >
          <ReportFilterSelect
            label="Secteur"
            value={businessFilters.sector_id}
            options={businessFilterOptions.sectors}
            emptyLabel="Tous les secteurs"
            onChange={(value) => updateBusinessFilter('sector_id', value)}
          />
          <ReportFilterSelect
            label="Technicien"
            value={businessFilters.technician_id}
            options={businessFilterOptions.technicians}
            emptyLabel="Tous les techniciens"
            onChange={(value) => updateBusinessFilter('technician_id', value)}
          />
          <ReportFilterSelect
            label="Type"
            value={businessFilters.job_type}
            options={businessFilterOptions.jobTypes}
            emptyLabel="Tous les types"
            onChange={(value) => updateBusinessFilter('job_type', value)}
          />
          <ReportFilterSelect
            label="Opérateur"
            value={businessFilters.operator}
            options={businessFilterOptions.operators}
            emptyLabel="Tous les opérateurs"
            onChange={(value) => updateBusinessFilter('operator', value)}
          />
          <ReportFilterSelect
            label="Statut"
            value={businessFilters.status}
            options={businessFilterOptions.statuses}
            emptyLabel="Tous les statuts"
            onChange={(value) => updateBusinessFilter('status', value)}
          />
          <span className="rv3-range-pill" aria-live="polite">
            {filteredJobs.length} / {jobs.length} interventions · {activeBusinessFilterCount} filtre(s)
          </span>
          <button
            type="button"
            className="rv3-icon-button"
            onClick={clearBusinessFilters}
            disabled={activeBusinessFilterCount === 0}
            aria-label="Réinitialiser les filtres analytiques"
            title="Réinitialiser les filtres"
          >
            ×
          </button>
        </div>
      )}

      {scopeTransition && refreshing && periodSelection.ok && (
        <div className="rv3-notice" role="status" aria-live="polite">
          <span>
            Chargement de {formatRange(range)}… Les chiffres du dernier snapshot
            sont temporairement masqués pour éviter de mélanger deux périodes.
          </span>
        </div>
      )}

      {error && (
        <div className="rv3-notice" role="alert">
          <span>{error}</span>
          {periodSelection.ok && (
            <button type="button" onClick={() => loadData()} disabled={refreshing}>Réessayer</button>
          )}
        </div>
      )}

      {hasSnapshot && scopeMatches && !periodSelection.error && (
        <div className="rv3-content">
          <ReportsKpiStrip
            analytics={analytics}
            comparison={comparison}
            onOpenInterventions={openInterventions}
          />
          <ReportsOverview
            analytics={analytics}
            trendAnalytics={trendAnalytics}
            activeTechnicians={activeTechnicians}
            totalTechnicians={totalTechnicians}
          />
          <ReportsRankings analytics={analytics} />
          <ReportsQualityPanel
            analytics={analytics}
            resultLimitReached={false}
            onExport={() => setExportOpen(true)}
          />
        </div>
      )}

      {exportOpen && exportScopeFilters && (
        <ExportCenter
          fixedFilters={exportScopeFilters}
          fixedFiltersLabel={`Périmètre Rapports verrouillé : ${formatRange(displayedRange)} · ${activeBusinessFilterCount} filtre(s) métier. Les profils et modèles ne peuvent pas remplacer ce scope.`}
          onClose={() => setExportOpen(false)}
          onGenerated={({ filename }) => toast(
            filename ? `Export généré : ${filename}` : 'Export généré avec succès.',
            'success',
          )}
        />
      )}

      <div className="toast-container">
        {toasts.map((item) => (
          <Toast key={item.id} message={item.message} type={item.type} />
        ))}
      </div>
    </div>
  );
}
