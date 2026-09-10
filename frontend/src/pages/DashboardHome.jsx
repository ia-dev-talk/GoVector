/**
 * DashboardHome — cockpit opérationnel BlueVector.
 *
 * La page orchestre les données du jour, les KPI, les priorités,
 * la carte partagée et le flux temps réel. Le rendu cartographique
 * est délégué à MapWindow afin de conserver un seul contrat Leaflet.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../api/client';
import CockpitHeader from '../components/cockpit/CockpitHeader';
import CockpitDataNotice from '../components/cockpit/CockpitDataNotice';
import CockpitPilotageWorkspace from '../components/cockpit/CockpitPilotageWorkspace';
import {
  cockpitJobSector,
  isCockpitInProgressStatus,
} from '../components/cockpit/cockpitPilotageSelectors';
import SimBar from '../components/SimBar';
import Toast from '../components/Toast';
import {
  civilDateFromKey,
  civilDateKeyInTimeZone,
  resolveOperationalTimeZone,
} from '../features/reports-v3/operationalTime';
import { useSimEvents } from '../hooks/useSimEvents';
import { useWebSocket } from '../hooks/useWebSocket';
import { useRuntimeSettings } from '../contexts/RuntimeSettingsContext';
import {
  statusMetadataFor,
  statusMetadataIndex,
} from '../lib/workflow-capabilities';
import '../styles/cockpit.css';
import '../styles/cockpit-v4.css';

const ASSIGNMENT_ROLES = new Set([
  'ADMIN',
  'CHEF_ORIENTEUR',
  'ORIENTEUR',
]);

const ON_JOB_STATUSES = new Set([
  'en_intervention',
  'en_tache',
]);

const OFFLINE_STATUSES = new Set([
  'hors_service',
  'deconnecte',
]);

const MAX_ACTIVITIES = 100;
const REFRESH_INTERVAL_MS = 30_000;
const REALTIME_REFRESH_DELAY_MS = 700;
const TOAST_DURATION_MS = 3_000;
const OPERATIONAL_TIME_ZONE = resolveOperationalTimeZone();
const OPERATIONAL_TIME_ZONE_LABEL = OPERATIONAL_TIME_ZONE
  .split('/')
  .at(-1)
  .replace(/_/g, ' ');

const ACTIVITY_CONFIG = Object.freeze({
  'job:created': {
    action: 'Intervention créée',
    status: 'Créée',
    statusColor: 'var(--color-info)',
    statusBg: 'var(--color-info-dim)',
  },
  'job:updated': {
    action: 'Intervention mise à jour',
    status: 'Mise à jour',
    statusColor: 'var(--color-info)',
    statusBg: 'var(--color-info-dim)',
  },
  'job:assigned': {
    action: 'Intervention affectée',
    status: 'Affectée',
    statusColor: 'var(--color-accent)',
    statusBg: 'var(--color-accent-dim)',
  },
  'job:started': {
    action: 'Intervention commencée',
    status: 'En cours',
    statusColor: 'var(--color-purple)',
    statusBg: 'var(--color-purple-dim)',
  },
  'job:completed': {
    action: 'Intervention terminée',
    status: 'Terminée',
    statusColor: 'var(--color-success)',
    statusBg: 'var(--color-success-dim)',
  },
  'job:cancelled': {
    action: 'Intervention annulée',
    status: 'Annulée',
    statusColor: 'var(--color-danger)',
    statusBg: 'var(--color-danger-dim)',
  },
  'tech:status_changed': {
    action: 'Statut technicien modifié',
    status: 'Statut',
    statusColor: 'var(--color-warning)',
    statusBg: 'var(--color-warning-dim)',
  },
  'tech:location_updated': {
    action: 'Position GPS mise à jour',
    status: 'GPS',
    statusColor: 'var(--color-info)',
    statusBg: 'var(--color-info-dim)',
  },
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecords(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function identifier(value) {
  return text(value) || null;
}

function comparable(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

function normalizeStatus(value) {
  return comparable(value).replace(/\s+/g, '_').replace(/-/g, '_');
}

function normalizeRole(value) {
  return text(value).toLocaleUpperCase('fr');
}

function formatClock(date = new Date(), { includeZone = false } = {}) {
  const value = new Intl.DateTimeFormat('fr-FR', {
    timeZone: OPERATIONAL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

  return includeZone ? `${value} · ${OPERATIONAL_TIME_ZONE_LABEL}` : value;
}

function currentOperationalDate(date = new Date()) {
  return civilDateFromKey(
    civilDateKeyInTimeZone(date, OPERATIONAL_TIME_ZONE),
  ) ?? date;
}

function apiError(error, fallback) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) return detail.trim();

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (isRecord(item) ? text(item.msg ?? item.message) : text(item)))
      .filter(Boolean);

    if (messages.length) return messages.join(' · ');
  }

  return (
    text(error?.response?.data?.message) ||
    text(error?.message) ||
    fallback
  );
}

function validCoordinate(value, minimum, maximum) {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function hasTechnicianPosition(technician) {
  const latitude = validCoordinate(technician?.current_latitude, -90, 90);
  const longitude = validCoordinate(technician?.current_longitude, -180, 180);

  return (
    latitude !== null &&
    longitude !== null &&
    !(latitude === 0 && longitude === 0)
  );
}

function hasJobPosition(job) {
  const latitude = validCoordinate(
    job?.latitude,
    -90,
    90,
  );
  const longitude = validCoordinate(
    job?.longitude,
    -180,
    180,
  );

  return (
    latitude !== null &&
    longitude !== null &&
    !(latitude === 0 && longitude === 0)
  );
}

function technicianName(technician) {
  const id = identifier(technician?.id ?? technician?.technician_id);

  return (
    text(technician?.name ?? technician?.full_name ?? technician?.username) ||
    (id ? `Technicien #${id}` : 'Technicien')
  );
}

function technicianSectors(technician) {
  const values = [
    technician?.route_criteria,
    technician?.sector_name,
    technician?.sector,
  ];

  if (Array.isArray(technician?.assigned_routes)) {
    values.push(...technician.assigned_routes);
  }

  return [...new Set(values.map(text).filter(Boolean))];
}

function assignedTechnicianName(job) {
  return text(
    job?.assigned_tech_name ??
      job?.assigned_technician_name ??
      job?.assignment?.technician?.name,
  );
}

function hasJobAssignment(job) {
  return Boolean(
    identifier(
      job?.assigned_tech_id ??
        job?.assigned_technician_id ??
        job?.technician_id ??
        job?.assignment?.technician_id ??
        job?.assignment?.technician?.id,
    ) || assignedTechnicianName(job),
  );
}

function summarizeJobs(jobs, statusMetadata) {
  const safeJobs = asRecords(jobs);
  const metadata = statusMetadataIndex(statusMetadata);
  const summary = {
    total: safeJobs.length,
    pending: 0,
    assigned: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    on_hold: 0,
    urgent: 0,
    unassigned: 0,
  };
  safeJobs.forEach((job) => {
    const status = normalizeStatus(job?.status);
    const lifecycle = statusMetadataFor(metadata, status);
    const assigned = hasJobAssignment(job);

    if (status === 'pending' || status === 'en_attente') {
      summary.pending += 1;
    }
    if (assigned) summary.assigned += 1;
    if (isCockpitInProgressStatus(status)) summary.in_progress += 1;
    if (lifecycle?.canonical === 'completed') {
      summary.completed += 1;
    }
    if (status === 'cancelled' || status === 'annulee') {
      summary.cancelled += 1;
    }
    if (status === 'on_hold' || status === 'en_pause') {
      summary.on_hold += 1;
    }
    if (text(job?.priority).toLocaleUpperCase('fr') === 'URGENT') {
      summary.urgent += 1;
    }
    if (!assigned && lifecycle?.order_open === true) summary.unassigned += 1;
  });

  return summary;
}

function matchesSearch(values, query) {
  const normalizedQuery = comparable(query);

  if (!normalizedQuery) return true;

  return values.some((value) => comparable(value).includes(normalizedQuery));
}

function buildActivityEvent(eventType, data = {}) {
  const configuration = ACTIVITY_CONFIG[eventType];

  if (!configuration) return null;

  const jobIdentifier = identifier(data?.job_id ?? data?.id);
  const technician =
    text(
      data?.name ??
        data?.technician_name ??
        data?.username ??
        data?.user,
    ) || 'Système';

  const location = text(
    data?.route_criteria ??
      data?.sector_name ??
      data?.sector ??
      data?.zone,
  );

  const status =
    eventType === 'tech:status_changed'
      ? text(data?.status ?? data?.live_status).replace(/_/g, ' ')
      : configuration.status;

  const action =
    eventType.startsWith('job:') && jobIdentifier
      ? `${configuration.action} #${jobIdentifier}`
      : configuration.action;

  return {
    id: `${eventType}-${jobIdentifier || identifier(data?.technician_id) || Date.now()}-${Date.now()}`,
    time: formatClock(),
    name: technician,
    team: text(data?.team),
    operator: text(data?.operator),
    location,
    action,
    status,
    statusColor: configuration.statusColor,
    statusBg: configuration.statusBg,
  };
}

function buildNotificationActivity(data) {
  const message = text(data?.message);

  if (!message) return null;

  return {
    id: `notification-${Date.now()}`,
    time: formatClock(),
    name: 'Système',
    team: '',
    operator: '',
    location: '',
    action: message,
    status: 'Info',
    statusColor: 'var(--color-accent)',
    statusBg: 'var(--color-accent-dim)',
  };
}

function buildSimulationActivity(event) {
  const eventMap = {
    job_assigned: 'job:assigned',
    job_started: 'job:started',
    job_completed: 'job:completed',
  };

  const mappedType = eventMap[event?.event_type];

  if (mappedType) {
    return {
      ...buildActivityEvent(mappedType, {
        job_id: event?.job_id,
        ...(isRecord(event?.details) ? event.details : {}),
      }),
      source: 'simulation',
      isSimulation: true,
    };
  }

  if (event?.event_type === 'scripted_beat') {
    return {
      id: `simulation-${Date.now()}`,
      time: formatClock(),
      name: 'Simulation',
      team: '',
      operator: '',
      location: '',
      action:
        text(event?.details?.description) ||
        'Événement simulé',
      status: 'Info',
      statusColor: 'var(--color-accent)',
      statusBg: 'var(--color-accent-dim)',
      source: 'simulation',
      isSimulation: true,
    };
  }

  if (event?.event_type === 'day_complete') {
    return {
      id: `simulation-complete-${Date.now()}`,
      time: formatClock(),
      name: 'Simulation',
      team: '',
      operator: '',
      location: '',
      action: 'Journée de simulation terminée',
      status: 'Terminée',
      statusColor: 'var(--color-success)',
      statusBg: 'var(--color-success-dim)',
      source: 'simulation',
      isSimulation: true,
    };
  }

  return null;
}

export default function DashboardHome({
  onNavigate,
  userRole,
}) {
  const { settings: runtimeSettings } = useRuntimeSettings();
  const workflowStatuses = runtimeSettings.workflow.statuses;
  const canAssign = ASSIGNMENT_ROLES.has(normalizeRole(userRole));

  const [technicians, setTechnicians] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataError, setDataError] = useState('');
  const [lastSync, setLastSync] = useState('--:--');
  const [userName, setUserName] = useState('Utilisateur');
  const [realClock, setRealClock] = useState(() => formatClock(new Date(), { includeZone: true }));
  const [searchQuery, setSearchQuery] = useState('');
  const [activities, setActivities] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [simElapsed, setSimElapsed] = useState(null);
  const [demoLocked, setDemoLocked] = useState(false);

  const requestSequenceRef = useRef(0);
  const refreshTimerRef = useRef(null);
  const loadDataRef = useRef(null);
  const toastSequenceRef = useRef(0);
  const toastTimersRef = useRef(new Set());

  useEffect(() => {
    const interval = window.setInterval(
      () => setRealClock(formatClock(new Date(), { includeZone: true })),
      10_000,
    );

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let active = true;

    api
      .getMe()
      .then((response) => {
        if (!active) return;

        const name = text(
          response?.data?.username ??
            response?.data?.name ??
            response?.data?.email,
        );

        if (name) setUserName(name);
      })
      .catch(() => {
        // L'identité de session est déjà gérée par App.
      });

    return () => {
      active = false;
    };
  }, []);

  const toast = useCallback((message, type = 'info') => {
    const normalizedMessage = text(message);

    if (!normalizedMessage) return;

    const id = ++toastSequenceRef.current;

    setToasts((current) => [
      ...current,
      {
        id,
        msg: normalizedMessage,
        type,
      },
    ]);

    const timer = window.setTimeout(() => {
      toastTimersRef.current.delete(timer);
      setToasts((current) => current.filter((item) => item.id !== id));
    }, TOAST_DURATION_MS);

    toastTimersRef.current.add(timer);
  }, []);

  useEffect(
    () => () => {
      toastTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      toastTimersRef.current.clear();
    },
    [],
  );

  const loadData = useCallback(
    async ({ manual = false, silent = false } = {}) => {
      const requestId = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestId;

      if (manual) setRefreshing(true);

      const date = civilDateKeyInTimeZone(new Date(), OPERATIONAL_TIME_ZONE);
      const results = await Promise.allSettled([
        api.getTechnicians(),
        api.getJobs({ scheduled_date: date }),
      ]);

      if (requestId !== requestSequenceRef.current) return;

      const failures = [];
      let successfulResources = 0;

      const techniciansResult = results[0];
      if (techniciansResult.status === 'fulfilled') {
        setTechnicians(asRecords(techniciansResult.value?.data));
        successfulResources += 1;
      } else {
        failures.push(
          `personnel : ${apiError(
            techniciansResult.reason,
            'chargement impossible',
          )}`,
        );
      }

      const jobsResult = results[1];
      if (jobsResult.status === 'fulfilled') {
        setJobs(asRecords(jobsResult.value?.data));
        successfulResources += 1;
      } else {
        failures.push(
          `interventions : ${apiError(
            jobsResult.reason,
            'chargement impossible',
          )}`,
        );
      }

      if (successfulResources > 0) {
        setLastSync(formatClock(new Date(), { includeZone: true }));
      }

      const nextError = failures.length
        ? `Données indisponibles — ${failures.join(' · ')}`
        : '';

      setDataError(nextError);

      if (failures.length && !silent) {
        toast('Certaines données du cockpit sont indisponibles.', 'error');
      }

      setLoading(false);
      setRefreshing(false);
    },
    [toast],
  );

  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();

    const interval = window.setInterval(
      () => loadDataRef.current?.({ silent: true }),
      REFRESH_INTERVAL_MS,
    );

    return () => {
      window.clearInterval(interval);
      requestSequenceRef.current += 1;

      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [loadData]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      window.clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      loadDataRef.current?.({ silent: true });
    }, REALTIME_REFRESH_DELAY_MS);
  }, []);

  const addActivity = useCallback((activity) => {
    if (!activity) return;

    setActivities((current) => [
      activity,
      ...current,
    ].slice(0, MAX_ACTIVITIES));
  }, []);

  const handleDashboardUpdate = useCallback(() => {
    scheduleRefresh();
  }, [scheduleRefresh]);

  const handleJobEvent = useCallback(
    (eventType, data) => {
      addActivity(buildActivityEvent(eventType, data));
      scheduleRefresh();
    },
    [addActivity, scheduleRefresh],
  );

  const handleTechEvent = useCallback(
    (eventType, data) => {
      addActivity(buildActivityEvent(eventType, data));
      scheduleRefresh();
    },
    [addActivity, scheduleRefresh],
  );

  const handleNotification = useCallback(
    (data) => {
      addActivity(buildNotificationActivity(data));
    },
    [addActivity],
  );

  const websocket = useWebSocket('dashboard', {
    onDashboardUpdate: handleDashboardUpdate,
    onJobEvent: handleJobEvent,
    onTechEvent: handleTechEvent,
    onNotification: handleNotification,
  });

  const handleSimEvent = useCallback(
    (event) => {
      if (event?.event_type === 'clock_tick') {
        setSimElapsed(event?.details?.elapsed_minutes ?? null);
        return;
      }

      const activity = buildSimulationActivity(event);
      if (activity) addActivity(activity);

      if (
        [
          'job_assigned',
          'job_started',
          'job_completed',
          'day_complete',
        ].includes(event?.event_type)
      ) {
        scheduleRefresh();
      }
    },
    [addActivity, scheduleRefresh],
  );

  useSimEvents(handleSimEvent);

  const normalizedSearch = comparable(searchQuery);

  const visibleTechnicians = useMemo(() => {
    if (!normalizedSearch) return technicians;

    return technicians.filter((technician) =>
      matchesSearch(
        [
          technician?.id,
          technicianName(technician),
          technician?.phone,
          technician?.email,
          technician?.team,
          technician?.vehicle,
          technician?.live_status,
          ...technicianSectors(technician),
        ],
        normalizedSearch,
      ),
    );
  }, [normalizedSearch, technicians]);

  const visibleJobs = useMemo(() => {
    if (!normalizedSearch) return jobs;

    return jobs.filter((job) =>
      matchesSearch(
        [
          job?.id,
          job?.job_number,
          job?.command_number,
          job?.customer_name,
          job?.customer_phone,
          job?.customer_email,
          job?.service_address,
          job?.service_city,
          job?.operator,
          job?.job_type,
          job?.status,
          job?.priority,
          job?.nro,
          job?.sro,
          job?.pbo,
          job?.pto,
          job?.ont_serial,
          job?.router_serial,
          assignedTechnicianName(job),
          cockpitJobSector(job),
        ],
        normalizedSearch,
      ),
    );
  }, [jobs, normalizedSearch]);

  const effectiveSummary = useMemo(
    () => summarizeJobs(jobs, workflowStatuses),
    [jobs, workflowStatuses],
  );

  const personnelSummary = useMemo(() => {
    const counts = {
      available: 0,
      onJob: 0,
      onBreak: 0,
      offline: 0,
    };

    technicians.forEach((technician) => {
      const status = normalizeStatus(
        technician?.live_status ?? technician?.status,
      );

      if (status === 'disponible') counts.available += 1;
      else if (ON_JOB_STATUSES.has(status)) counts.onJob += 1;
      else if (status === 'pause') counts.onBreak += 1;
      else if (OFFLINE_STATUSES.has(status)) counts.offline += 1;
    });

    return counts;
  }, [technicians]);

  const sectorLoad = useMemo(() => {
    const counts = new Map();

    jobs.forEach((job) => {
      const sector = cockpitJobSector(job);
      if (!sector) return;

      counts.set(sector, (counts.get(sector) || 0) + 1);
    });

    return [...counts.entries()]
      .map(([sector, count]) => ({ sector, count }))
      .sort(
        (first, second) =>
          second.count - first.count ||
          first.sector.localeCompare(second.sector, 'fr'),
      );
  }, [jobs]);

  const positionedCounts = useMemo(
    () => ({
      technicians: technicians.filter(hasTechnicianPosition).length,
      jobs: jobs.filter(hasJobPosition).length,
    }),
    [jobs, technicians],
  );

  const handleNavigate = useCallback(
    (page, payload = null) => {
      return typeof onNavigate === 'function'
        ? onNavigate(page, payload)
        : false;
    },
    [onNavigate],
  );

  const handleSearchSubmit = useCallback(() => {
    if (!normalizedSearch) return;

    const exactJob = visibleJobs.find((job) => {
      const query = comparable(searchQuery);

      return [
        job?.id,
        job?.job_number,
        job?.command_number,
      ].some((value) => comparable(value) === query);
    });

    if (exactJob?.id) {
      handleNavigate('interventions', {
        id: exactJob.id,
      });
      return;
    }

    if (visibleJobs.length === 0 && visibleTechnicians.length === 0) {
      toast('Aucun résultat pour cette recherche.', 'info');
    }
  }, [
    handleNavigate,
    normalizedSearch,
    searchQuery,
    toast,
    visibleJobs,
    visibleTechnicians,
  ]);

  if (loading) {
    return (
      <div className="loading-screen" role="status" aria-live="polite">
        <div className="loading-spinner" aria-hidden="true" />
        Chargement du cockpit GoVector…
      </div>
    );
  }

  return (
    <div className="cockpit">
      <CockpitHeader
        userName={userName}
        realClock={realClock}
        currentDate={currentOperationalDate()}
        liveConnected={websocket.connected}
        onRefresh={
          demoLocked
            ? undefined
            : () => loadData({ manual: true })
        }
        refreshing={refreshing}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={handleSearchSubmit}
        notifCount={null}
      />

      <SimBar
        elapsedMinutes={simElapsed}
        onToast={toast}
        onRunningChange={setDemoLocked}
      />

      <CockpitDataNotice
        message={dataError}
        lastSync={lastSync}
        retrying={refreshing}
        onRetry={() => loadData({ manual: true })}
      />

      <CockpitPilotageWorkspace
        summary={effectiveSummary}
        jobs={jobs}
        personnelSummary={personnelSummary}
        sectorLoad={sectorLoad}
        positionedCounts={positionedCounts}
        activities={activities}
        canAssign={canAssign}
        onNavigate={handleNavigate}
        statusMetadata={workflowStatuses}
      />

      <div className="toast-container" aria-live="polite">
        {toasts.map((item) => (
          <Toast
            key={item.id}
            message={item.msg}
            type={item.type}
          />
        ))}
      </div>
    </div>
  );
}
