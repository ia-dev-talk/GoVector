import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../api/client';
import ExportCenter from '../components/export/ExportCenter';
import Toast from '../components/Toast';
import ReportsHeader from '../features/reports-v3/ReportsHeader';
import ReportsKpiStrip from '../features/reports-v3/ReportsKpiStrip';
import ReportsOverview from '../features/reports-v3/ReportsOverview';
import ReportsQualityPanel from '../features/reports-v3/ReportsQualityPanel';
import ReportsRankings from '../features/reports-v3/ReportsRankings';
import { buildTrendAnalytics } from '../features/reports-v3/reportTrendUtils';
import {
  activeTechnicianCount,
  apiError,
  asRecords,
  buildAnalytics,
  compareAnalytics,
  isRecord,
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

    const failures = [];
    let successful = 0;
    const current = results[0];
    if (current.status === 'fulfilled' && Array.isArray(current.value?.data)) {
      const records = asRecords(current.value.data);
      setJobs(records);
      setResultLimitReached(records.length >= SEARCH_LIMIT);
      successful += 1;
    } else {
      failures.push(current.status === 'rejected'
        ? apiError(current.reason, 'Interventions indisponibles.')
        : 'Interventions : réponse invalide.');
    }

    const previous = results[1];
    if (previous.status === 'fulfilled' && Array.isArray(previous.value?.data)) {
      setPreviousJobs(asRecords(previous.value.data));
      successful += 1;
    } else {
      setPreviousJobs([]);
      failures.push(previous.status === 'rejected'
        ? apiError(previous.reason, 'Comparaison indisponible.')
        : 'Comparaison : réponse invalide.');
    }

    const tech = results[2];
    if (tech.status === 'fulfilled' && isRecord(tech.value?.data)) {
      setTechnicians(tech.value.data);
      successful += 1;
    } else {
      failures.push(tech.status === 'rejected'
        ? apiError(tech.reason, 'Techniciens indisponibles.')
        : 'Techniciens : réponse invalide.');
    }

    if (successful > 0) setLastUpdatedAt(new Date());
    setError(failures.join(' · '));
    setLoading(false);
    setRefreshing(false);
  }, [priorRange.end, priorRange.start, range.end, range.start]);

  useEffect(() => {
    const timer = window.setTimeout(() => loadData(), 0);
    const interval = window.setInterval(() => loadData({ silent: true }), POLLING_INTERVAL_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
      requestRef.current += 1;
    };
  }, [loadData]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (realtimeTimerRef.current) window.clearTimeout(realtimeTimerRef.current);
    realtimeTimerRef.current = window.setTimeout(() => {
      realtimeTimerRef.current = null;
      loadData({ silent: true });
    }, REALTIME_DELAY_MS);
  }, [loadData]);

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
    () => buildTrendAnalytics(jobs, range),
    [jobs, range],
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

  if (loading && jobs.length === 0 && Object.keys(technicians).length === 0) {
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
      />

      {error && (
        <div className="rv3-notice" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => loadData()} disabled={refreshing}>Réessayer</button>
        </div>
      )}

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

      {exportOpen && (
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
