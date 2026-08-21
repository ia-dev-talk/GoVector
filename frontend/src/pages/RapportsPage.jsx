import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api/client';
import ExportCenter from '../components/export/ExportCenter';
import Toast from '../components/Toast';
import ReportsHeader from '../features/reports-v3/ReportsHeader';
import ReportsKpiStrip from '../features/reports-v3/ReportsKpiStrip';
import ReportsOverview from '../features/reports-v3/ReportsOverview';
import ReportsQualityPanel from '../features/reports-v3/ReportsQualityPanel';
import ReportsRankings from '../features/reports-v3/ReportsRankings';
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
  periodRange,
  previousRange,
  totalTechnicianCount,
} from '../features/reports-v3/reportUtils';
import { useWebSocket } from '../hooks/useWebSocket';
import '../styles/reports-v3.css';

const SEARCH_LIMIT = 1000;
const POLLING_INTERVAL_MS = 60_000;
const REALTIME_DELAY_MS = 700;
const TOAST_DURATION_MS = 3200;

export default function RapportsPage({ onNavigate }) {
  const [period, setPeriod] = useState('today');
  const [jobs, setJobs] = useState([]);
  const [previousJobs, setPreviousJobs] = useState([]);
  const [technicians, setTechnicians] = useState({});
  const [displayedRange, setDisplayedRange] = useState(() => periodRange('today'));
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [resultLimitReached, setResultLimitReached] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const requestRef = useRef(0);
  const realtimeTimerRef = useRef(null);
  const toastIdRef = useRef(0);
  const toastTimersRef = useRef(new Set());

  const range = useMemo(() => periodRange(period), [period]);
  const priorRange = useMemo(() => previousRange(range), [range]);
  const liveRelevant = reportIncludesCivilDate(range);
  const scopeMatches = reportScopesMatch(range, displayedRange);
  const scopeTransition = hasSnapshot && !scopeMatches;

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
    const requestId = ++requestRef.current;
    if (!silent) setRefreshing(true);
    setError('');

    const currentParams = {
      date_from: localDateKey(range.start),
      date_to: localDateKey(range.end),
      limit: SEARCH_LIMIT,
    };
    const previousParams = {
      date_from: localDateKey(priorRange.start),
      date_to: localDateKey(priorRange.end),
      limit: SEARCH_LIMIT,
    };
    const results = await Promise.allSettled([
      api.searchJobs(currentParams),
      api.searchJobs(previousParams),
      api.getDashboardTechnicians(),
    ]);
    if (requestId !== requestRef.current) return;

    const resolution = resolveReportSnapshot(results, {
      limit: SEARCH_LIMIT,
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
    setResultLimitReached(snapshot.resultLimitReached);
    setDisplayedRange({
      start: new Date(range.start),
      end: new Date(range.end),
    });
    setHasSnapshot(true);
    setLastUpdatedAt(new Date());
    setError('');
    setLoading(false);
    setRefreshing(false);
  }, [priorRange.end, priorRange.start, range.end, range.start]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadData(), 0);
    const interval = liveRelevant
      ? window.setInterval(() => loadData({ silent: true }), POLLING_INTERVAL_MS)
      : null;
    return () => {
      window.clearTimeout(timer);
      if (interval) window.clearInterval(interval);
      requestRef.current += 1;
    };
  }, [liveRelevant, loadData]);

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
      />

      {scopeTransition && refreshing && (
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
          <button type="button" onClick={() => loadData()} disabled={refreshing}>Réessayer</button>
        </div>
      )}

      {hasSnapshot && scopeMatches && (
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
            resultLimitReached={resultLimitReached}
            onExport={() => setExportOpen(true)}
          />
        </div>
      )}

      {exportOpen && hasSnapshot && scopeMatches && (
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
