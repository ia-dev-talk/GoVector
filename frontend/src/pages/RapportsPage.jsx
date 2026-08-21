import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api/client';
import ExportCenter from '../components/export/ExportCenter';
import Toast from '../components/Toast';
import ReportsHeader from '../features/reports-v3/ReportsHeader';
import ReportsKpiStrip from '../features/reports-v3/ReportsKpiStrip';
import ReportsOverview from '../features/reports-v3/ReportsOverview';
import ReportsQualityPanel from '../features/reports-v3/ReportsQualityPanel';
import ReportsRankings from '../features/reports-v3/ReportsRankings';
import { fetchCompleteReportJobs } from '../features/reports-v3/reportJobLoader';
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

export default function RapportsPage({ onNavigate }) {
  const todayKey = useMemo(() => localDateKey(), []);
  const [period, setPeriod] = useState('today');
  const [exactDate, setExactDate] = useState(todayKey);
  const [customStart, setCustomStart] = useState(todayKey);
  const [customEnd, setCustomEnd] = useState(todayKey);
  const [jobs, setJobs] = useState([]);
  const [previousJobs, setPreviousJobs] = useState([]);
  const [technicians, setTechnicians] = useState({});
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
  const priorRange = useMemo(
    () => previousRange(range),
    [range],
  );
  const liveRelevant = periodSelection.ok && reportIncludesCivilDate(range);
  const scopeMatches = periodSelection.ok && reportScopesMatch(range, displayedRange);
  const scopeTransition = !periodSelection.ok || (hasSnapshot && !scopeMatches);

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
    if (!periodSelection.ok) {
      setError(periodSelection.error);
      setLoading(false);
      setRefreshing(false);
      return undefined;
    }

    const timer = window.setTimeout(() => loadData(), 0);
    const interval = liveRelevant
      ? window.setInterval(() => loadData({ silent: true }), POLLING_INTERVAL_MS)
      : null;
    return () => {
      window.clearTimeout(timer);
      if (interval) window.clearInterval(interval);
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

  const analytics = useMemo(() => buildAnalytics(jobs), [jobs]);
  const previousAnalytics = useMemo(() => buildAnalytics(previousJobs), [previousJobs]);
  const comparison = useMemo(
    () => compareAnalytics(analytics, previousAnalytics),
    [analytics, previousAnalytics],
  );
  const trendAnalytics = useMemo(
    () => buildTrendAnalytics(jobs, displayedRange),
    [displayedRange, jobs],
  );
  const activeTechnicians = activeTechnicianCount(technicians);
  const totalTechnicians = totalTechnicianCount(technicians);

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

      {exportOpen && hasSnapshot && scopeMatches && !periodSelection.error && (
        <ExportCenter
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
