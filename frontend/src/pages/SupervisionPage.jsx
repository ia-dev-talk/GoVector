/**
 * SupervisionPage — console opérationnelle FTTH BlueVector.
 *
 * La page orchestre les techniciens, interventions, filtres, événements
 * temps réel et simulation. MapWindow, TechGrid et JobGrid conservent
 * la responsabilité de leurs rendus spécialisés.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../api/client';
import { RefreshIcon } from '../components/DashboardIcons';
import JobGrid from '../components/JobGrid';
import MapWindow from '../components/MapWindow';
import SimBar from '../components/SimBar';
import TechGrid from '../components/TechGrid';
import Toast from '../components/Toast';
import Button from '../components/ui/Button';
import { useSimEvents } from '../hooks/useSimEvents';
import { useWebSocket } from '../hooks/useWebSocket';
import { getJobTypeLabel } from '../lib/job-types';

const REFRESH_INTERVAL_MS = 30_000;
const REALTIME_REFRESH_DELAY_MS = 700;
const TOAST_DURATION_MS = 3_000;
const MAX_TIMELINE_EVENTS = 100;

const EMPTY_FILTERS = Object.freeze({
  sector: '',
  team: '',
  status: '',
});

const TECH_STATUS = Object.freeze({
  disponible: {
    label: 'Disponible',
    color: 'var(--color-success)',
    icon: '🟢',
  },
  en_route: {
    label: 'En route',
    color: 'var(--color-info)',
    icon: '🔵',
  },
  en_intervention: {
    label: 'En intervention',
    color: 'var(--color-warning)',
    icon: '🟠',
  },
  en_tache: {
    label: 'En intervention',
    color: 'var(--color-warning)',
    icon: '🟠',
  },
  pause: {
    label: 'En pause',
    color: 'var(--color-warning)',
    icon: '🟡',
  },
  hors_service: {
    label: 'Hors service',
    color: 'var(--color-danger)',
    icon: '🔴',
  },
  deconnecte: {
    label: 'Déconnecté',
    color: 'var(--text-muted)',
    icon: '⚫',
  },
});

const JOB_STATUS = Object.freeze({
  pending: 'En attente',
  assigned: 'Affectée',
  en_route: 'En route',
  on_site: 'Sur site',
  work_in_progress: 'Travail en cours',
  in_progress: 'En cours',
  installation_done: 'Installation terminée',
  client_validation: 'Validation client',
  en_attente_validation: 'En attente de validation',
  completed: 'Terminée',
  cancelled: 'Annulée',
  on_hold: 'En attente',
  failed: 'Échec',
  client_absent: 'Client absent',
  postponed: 'Reportée',
  suspended: 'Suspendue',
});

const JOB_EVENT_CONFIG = Object.freeze({
  'job:created': {
    label: 'créée',
    status: null,
  },
  'job:updated': {
    label: 'mise à jour',
    status: null,
  },
  'job:assigned': {
    label: 'affectée',
    status: 'assigned',
  },
  'job:unassigned': {
    label: 'désaffectée',
    status: 'pending',
  },
  'job:started': {
    label: 'commencée',
    status: 'in_progress',
  },
  'job:arrived': {
    label: 'arrivée sur site',
    status: 'on_site',
  },
  'job:work_started': {
    label: 'travail commencé',
    status: 'work_in_progress',
  },
  'job:completed': {
    label: 'terminée',
    status: 'completed',
  },
  'job:cancelled': {
    label: 'annulée',
    status: 'cancelled',
  },
});

const TERMINAL_JOB_STATUSES = new Set([
  'completed',
  'cancelled',
  'failed',
]);

const OFFLINE_TECH_STATUSES = new Set([
  'hors_service',
  'deconnecte',
]);

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

function normalizePriority(value) {
  return text(value).toLocaleUpperCase('fr');
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString('fr-FR');
}

function localDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function validCoordinate(value, minimum, maximum) {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function validTechCoordinates(technician) {
  const latitude = validCoordinate(technician?.current_latitude, -90, 90);
  const longitude = validCoordinate(technician?.current_longitude, -180, 180);

  return (
    latitude !== null &&
    longitude !== null &&
    !(latitude === 0 && longitude === 0)
  );
}

function technicianId(technician) {
  return identifier(technician?.id ?? technician?.technician_id);
}

function technicianName(technician) {
  const id = technicianId(technician);

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

function primaryTechnicianSector(technician) {
  return technicianSectors(technician)[0] || '';
}

function technicianStatusDetails(value) {
  const normalized = normalizeStatus(value);

  return (
    TECH_STATUS[normalized] || {
      label:
        normalized.replace(/_/g, ' ').replace(/^./, (character) =>
          character.toUpperCase(),
        ) || 'Statut inconnu',
      color: 'var(--text-muted)',
      icon: '⚪',
    }
  );
}

function isOnJobTechnician(technician) {
  return ['en_intervention', 'en_tache'].includes(
    normalizeStatus(technician?.live_status ?? technician?.status),
  );
}

function isOfflineTechnician(technician) {
  return OFFLINE_TECH_STATUSES.has(
    normalizeStatus(technician?.live_status ?? technician?.status),
  );
}

function jobId(job) {
  return identifier(
    job?.id ?? job?.job_id ?? job?.job_number ?? job?.command_number,
  );
}

function jobSector(job) {
  return text(
    job?.sector_name ??
      job?.route_criteria ??
      job?.sector_raw ??
      job?.sector,
  );
}

function jobStatusLabel(value) {
  const normalized = normalizeStatus(value);

  return (
    JOB_STATUS[normalized] ||
    normalized.replace(/_/g, ' ').replace(/^./, (character) =>
      character.toUpperCase(),
    ) ||
    '—'
  );
}

function jobTypeLabel(value) {
  const fallback = text(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

  return getJobTypeLabel(value, fallback) || 'Intervention';
}

function assignedTechnicianName(job) {
  return text(
    job?.assigned_tech_name ??
      job?.assigned_technician_name ??
      job?.assignment?.technician_name ??
      job?.assignment?.technician?.name,
  );
}

function isAssignedJob(job) {
  return Boolean(
    identifier(
      job?.assigned_tech_id ??
        job?.assigned_technician_id ??
        job?.technician_id ??
        job?.assignment?.technician_id,
    ),
  );
}

function isUrgentJob(job) {
  return normalizePriority(job?.priority) === 'URGENT';
}

function isTerminalJob(job) {
  return TERMINAL_JOB_STATUSES.has(normalizeStatus(job?.status));
}

function sortedUnique(values) {
  return [...new Set(values.map(text).filter(Boolean))].sort((first, second) =>
    first.localeCompare(second, 'fr', {
      sensitivity: 'base',
    }),
  );
}

function matchesSearch(values, query) {
  const normalizedQuery = comparable(query);

  return (
    !normalizedQuery ||
    values.some((value) => comparable(value).includes(normalizedQuery))
  );
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

function mergeTechnicianEvent(technician, data) {
  const next = { ...technician };

  if (data?.name !== undefined) next.name = data.name;
  if (data?.status !== undefined) next.live_status = data.status;
  if (data?.live_status !== undefined) next.live_status = data.live_status;

  const latitude = data?.current_latitude ?? data?.latitude;
  const longitude = data?.current_longitude ?? data?.longitude;

  if (latitude !== undefined) next.current_latitude = latitude;
  if (longitude !== undefined) next.current_longitude = longitude;

  const liveTelemetry = [
    ['current_speed', 'speed'],
    ['current_heading', 'heading'],
    ['current_accuracy', 'accuracy'],
    ['current_battery', 'battery_level'],
  ];
  liveTelemetry.forEach(([target, source]) => {
    if (data?.[target] !== undefined) {
      next[target] = data[target];
    } else if (data?.[source] !== undefined) {
      next[target] = data[source];
    }
  });

  if (data?.last_location_update !== undefined) {
    next.last_location_update = data.last_location_update;
  } else if (data?.timestamp !== undefined) {
    next.last_location_update = data.timestamp;
  }

  if (data?.current_job_id !== undefined) {
    next.current_job_id = data.current_job_id;
  } else if (data?.job_id !== undefined) {
    next.current_job_id = data.job_id;
  }

  return next;
}

function KPI({
  label,
  value,
  icon,
  color,
  active = false,
  onClick,
}) {
  const content = (
    <>
      <span className="sv-kpi-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="sv-kpi-value">{value}</span>
      <span className="sv-kpi-label">{label}</span>
    </>
  );

  if (typeof onClick !== 'function') {
    return (
      <div
        className="sv-kpi"
        style={{
          '--kpi-color': color || 'var(--text-muted)',
        }}
        aria-label={`${label} : ${value}`}
      >
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`sv-kpi${active ? ' sv-kpi--active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
      style={{
        '--kpi-color': color || 'var(--text-muted)',
      }}
    >
      {content}
    </button>
  );
}

function TimelineEvent({ event }) {
  const iconMap = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    danger: '❌',
    tech: '👤',
    job: '📋',
    gps: '📍',
    stock: '📦',
  };

  return (
    <div
      className={`sv-tl-event sv-tl-event--${event.type || 'info'}`}
      role="listitem"
    >
      <time className="sv-tl-time" dateTime={event.isoTime}>
        {event.time}
      </time>
      <span className="sv-tl-icon" aria-hidden="true">
        {iconMap[event.type] || 'ℹ️'}
      </span>
      {event.tech && <span className="sv-tl-tech">{event.tech}</span>}
      <span className="sv-tl-msg">{event.message}</span>
    </div>
  );
}

function AlertRow({ alert, onClick }) {
  const content = (
    <>
      <span className="sv-alert-icon" aria-hidden="true">
        {alert.icon}
      </span>
      <span className="sv-alert-count">{alert.count}</span>
      <span className="sv-alert-label">{alert.label}</span>
    </>
  );

  const style = {
    borderLeft: `3px solid ${alert.color}`,
  };

  if (typeof onClick !== 'function') {
    return (
      <div className="sv-alert" style={style}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="sv-alert"
      style={{
        ...style,
        width: '100%',
        textAlign: 'left',
      }}
      onClick={onClick}
      aria-label={`${alert.label} : ${alert.count}`}
    >
      {content}
    </button>
  );
}

function FilterPanel({
  filters,
  onChange,
  onClear,
  technicians,
  jobs,
}) {
  const sectors = useMemo(
    () =>
      sortedUnique([
        ...technicians.flatMap(technicianSectors),
        ...jobs.map(jobSector),
      ]),
    [jobs, technicians],
  );

  const teams = useMemo(
    () => sortedUnique(technicians.map((technician) => technician?.team)),
    [technicians],
  );

  const statuses = useMemo(
    () =>
      sortedUnique([
        ...Object.keys(TECH_STATUS),
        ...technicians.map(
          (technician) => technician?.live_status ?? technician?.status,
        ),
      ]),
    [technicians],
  );

  const active = Object.values(filters).some(Boolean);

  return (
    <div className="sv-filters" aria-label="Filtres de supervision">
      {active && (
        <button type="button" className="sv-filter-clear" onClick={onClear}>
          ✕ Effacer tout
        </button>
      )}

      <select
        value={filters.sector}
        onChange={(event) => onChange('sector', event.target.value)}
        aria-label="Filtrer par secteur"
      >
        <option value="">Tous les secteurs</option>
        {sectors.map((sector) => (
          <option key={sector} value={sector}>
            {sector}
          </option>
        ))}
      </select>

      <select
        value={filters.team}
        onChange={(event) => onChange('team', event.target.value)}
        aria-label="Filtrer par équipe"
      >
        <option value="">Toutes les équipes</option>
        {teams.map((team) => (
          <option key={team} value={team}>
            {team}
          </option>
        ))}
      </select>

      <select
        value={filters.status}
        onChange={(event) => onChange('status', event.target.value)}
        aria-label="Filtrer les techniciens par statut"
      >
        <option value="">Tous les statuts</option>
        {statuses.map((status) => (
          <option key={status} value={status}>
            {technicianStatusDetails(status).label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="sv-detail-row">
      <span>{label}</span>
      <span
        style={{
          fontFamily: mono ? 'var(--font-mono)' : undefined,
          overflowWrap: 'anywhere',
        }}
      >
        {text(value) || '—'}
      </span>
    </div>
  );
}

function DetailPanel({
  selected,
  onClose,
  onNavigate,
}) {
  if (!selected) return null;

  if (selected.type === 'tech') {
    const technician = selected.data;
    const status = technicianStatusDetails(
      technician?.live_status ?? technician?.status,
    );
    const name = technicianName(technician);
    const hasGps = validTechCoordinates(technician);
    const lastUpdate =
      technician?.last_location_update ?? technician?.last_gps_update;
    const accuracy = validCoordinate(
      technician?.current_accuracy,
      0,
      Number.MAX_SAFE_INTEGER,
    );

    return (
      <section className="sv-detail" aria-label={`Détails de ${name}`}>
        <div className="sv-detail-header">
          <div
            style={{
              width: 36,
              height: 36,
              display: 'grid',
              flexShrink: 0,
              placeItems: 'center',
              color: status.color,
              background: 'var(--surface-input)',
              border: `2px solid ${status.color}`,
              borderRadius: 8,
            }}
            aria-hidden="true"
          >
            {name.charAt(0).toUpperCase() || '?'}
          </div>

          <div>
            <strong>{name}</strong>
            <span style={{ color: status.color, fontSize: 11 }}>
              {status.icon} {status.label}
            </span>
          </div>

          <button
            type="button"
            className="sv-detail-close"
            onClick={onClose}
            aria-label="Fermer les détails du technicien"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="sv-detail-body">
          <DetailRow label="Téléphone" value={technician?.phone} />
          <DetailRow label="Équipe" value={technician?.team} />
          <DetailRow
            label="Secteur"
            value={primaryTechnicianSector(technician)}
          />
          <DetailRow label="Véhicule" value={technician?.vehicle} />
          <DetailRow
            label="GPS"
            mono
            value={
              hasGps
                ? `${Number(technician.current_latitude).toFixed(5)}, ${Number(
                    technician.current_longitude,
                  ).toFixed(5)}`
                : ''
            }
          />
          <DetailRow
            label="Dernière MAJ"
            value={
              lastUpdate
                ? new Date(lastUpdate).toLocaleString('fr-FR')
                : ''
            }
          />
          <DetailRow
            label="Précision"
            value={accuracy === null ? '' : `${accuracy.toFixed(1)} m`}
          />
          <DetailRow
            label="Intervention"
            value={
              technician?.current_job_id
                ? `#${technician.current_job_id}`
                : ''
            }
          />
        </div>
      </section>
    );
  }

  if (selected.type === 'job') {
    const job = selected.data;
    const id = jobId(job);

    return (
      <section
        className="sv-detail"
        aria-label={`Détails de l’intervention ${id || ''}`}
      >
        <div className="sv-detail-header">
          <div
            style={{
              width: 36,
              height: 36,
              display: 'grid',
              flexShrink: 0,
              placeItems: 'center',
              color: 'var(--color-accent)',
              background: 'var(--surface-input)',
              border: '2px solid var(--color-accent)',
              borderRadius: 8,
            }}
            aria-hidden="true"
          >
            📋
          </div>

          <div>
            <strong>#{job?.job_number || job?.id}</strong>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {text(job?.customer_name) || 'Client non renseigné'}
            </span>
          </div>

          <button
            type="button"
            className="sv-detail-close"
            onClick={onClose}
            aria-label="Fermer les détails de l’intervention"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        <div className="sv-detail-body">
          <DetailRow label="Client" value={job?.customer_name} />
          <DetailRow label="Type" value={jobTypeLabel(job?.job_type)} />
          <DetailRow label="Adresse" value={job?.service_address} />
          <DetailRow label="Secteur" value={jobSector(job)} />
          <DetailRow label="PBO" value={job?.pbo} mono />
          <DetailRow label="PTO" value={job?.pto} mono />
          <DetailRow label="Statut" value={jobStatusLabel(job?.status)} />
          <DetailRow
            label="Priorité"
            value={normalizePriority(job?.priority)}
          />
          <DetailRow
            label="Technicien"
            value={assignedTechnicianName(job)}
          />

          {typeof onNavigate === 'function' && id && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                onNavigate('interventions', {
                  id: Number(id) || id,
                })
              }
              style={{ marginTop: 8 }}
            >
              Ouvrir la fiche
            </Button>
          )}
        </div>
      </section>
    );
  }

  return null;
}

export default function SupervisionPage({ onNavigate }) {
  const [technicians, setTechnicians] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const [demoLocked, setDemoLocked] = useState(false);
  const [simElapsed, setSimElapsed] = useState(null);

  const [timeline, setTimeline] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS }));
  const [kpiFilter, setKpiFilter] = useState(null);

  const [showAlerts, setShowAlerts] = useState(true);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showMap, setShowMap] = useState(true);
  const [showTechs, setShowTechs] = useState(true);
  const [showJobs, setShowJobs] = useState(true);
  const [mapLayers, setMapLayers] = useState({
    techs: true,
    jobs: true,
  });

  const [realClock, setRealClock] = useState(() => formatTime());

  const requestSequenceRef = useRef(0);
  const refreshTimerRef = useRef(null);
  const loadDataRef = useRef(null);
  const toastSequenceRef = useRef(0);
  const timelineSequenceRef = useRef(0);
  const toastTimersRef = useRef(new Set());

  useEffect(() => {
    const interval = window.setInterval(
      () => setRealClock(formatTime()),
      10_000,
    );

    return () => window.clearInterval(interval);
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

  const addEvent = useCallback((technician, message, type = 'info') => {
    const normalizedMessage = text(message);
    if (!normalizedMessage) return;

    const now = new Date();

    setTimeline((current) =>
      [
        {
          id: ++timelineSequenceRef.current,
          time: formatTime(now),
          isoTime: now.toISOString(),
          tech: text(technician),
          message: normalizedMessage,
          type,
        },
        ...current,
      ].slice(0, MAX_TIMELINE_EVENTS),
    );
  }, []);

  const loadData = useCallback(
    async ({ silent = false } = {}) => {
      const requestId = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestId;

      if (!silent) setRefreshing(true);
      setLoadError('');

      const results = await Promise.allSettled([
        api.getTechnicians(),
        api.getJobs({
          scheduled_date: localDateKey(),
        }),
      ]);

      if (requestId !== requestSequenceRef.current) return;

      const failures = [];
      let successfulResources = 0;

      const technicianResult = results[0];

      if (technicianResult.status === 'fulfilled') {
        if (Array.isArray(technicianResult.value?.data)) {
          setTechnicians(asRecords(technicianResult.value.data));
          successfulResources += 1;
        } else {
          failures.push('Techniciens : réponse invalide.');
        }
      } else {
        failures.push(
          apiError(
            technicianResult.reason,
            'Impossible de charger les techniciens.',
          ),
        );
      }

      const jobResult = results[1];

      if (jobResult.status === 'fulfilled') {
        if (Array.isArray(jobResult.value?.data)) {
          setJobs(asRecords(jobResult.value.data));
          successfulResources += 1;
        } else {
          failures.push('Interventions : réponse invalide.');
        }
      } else {
        failures.push(
          apiError(
            jobResult.reason,
            'Impossible de charger les interventions.',
          ),
        );
      }

      if (successfulResources > 0) {
        setLastUpdatedAt(new Date());
      }

      setLoadError(failures.join(' '));

      if (failures.length && !silent) {
        toast('Certaines données de supervision sont indisponibles.', 'error');
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
    const frameId = window.requestAnimationFrame(() => {
      void loadData();
    });

    const interval = window.setInterval(
      () => loadDataRef.current?.({ silent: true }),
      REFRESH_INTERVAL_MS,
    );

    return () => {
      window.cancelAnimationFrame(frameId);
      requestSequenceRef.current += 1;
      window.clearInterval(interval);

      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
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

  const handleJobEvent = useCallback(
    (eventType, data) => {
      const configuration = JOB_EVENT_CONFIG[eventType];
      const eventJobId = identifier(data?.job_id ?? data?.id);

      addEvent(
        text(data?.tech_name ?? data?.technician_name),
        `Intervention${eventJobId ? ` #${eventJobId}` : ''} ${
          configuration?.label ||
          eventType.replace('job:', '').replace(/_/g, ' ')
        }`,
        eventType === 'job:completed'
          ? 'success'
          : eventType === 'job:cancelled'
            ? 'danger'
            : 'job',
      );

      if (eventJobId) {
        setJobs((current) =>
          current.map((job) =>
            jobId(job) === eventJobId
              ? {
                  ...job,
                  ...(configuration?.status
                    ? {
                        status: configuration.status,
                      }
                    : {}),
                  ...(isRecord(data) ? data : {}),
                }
              : job,
          ),
        );
      }

      scheduleRefresh();
    },
    [addEvent, scheduleRefresh],
  );

  const handleTechEvent = useCallback(
    (eventType, data) => {
      if (
        eventType !== 'tech:status_changed' &&
        eventType !== 'tech:location_updated'
      ) {
        return;
      }

      const eventTechnicianId = identifier(
        data?.technician_id ?? data?.id,
      );

      const name =
        text(data?.name) ||
        (eventTechnicianId ? `#${eventTechnicianId}` : '');

      addEvent(
        name,
        eventType === 'tech:status_changed'
          ? `Statut : ${technicianStatusDetails(
              data?.status ?? data?.live_status,
            ).label}`
          : 'Position GPS mise à jour',
        eventType === 'tech:status_changed' ? 'tech' : 'gps',
      );

      if (eventTechnicianId) {
        setTechnicians((current) =>
          current.map((technician) =>
            technicianId(technician) === eventTechnicianId
              ? mergeTechnicianEvent(technician, data)
              : technician,
          ),
        );
      }

      scheduleRefresh();
    },
    [addEvent, scheduleRefresh],
  );

  const handleNotification = useCallback(
    (data) => {
      if (data?.message) addEvent('', data.message, 'warning');
    },
    [addEvent],
  );

  const handleDashboardUpdate = useCallback(() => {
    scheduleRefresh();
  }, [scheduleRefresh]);

  const websocket = useWebSocket('dashboard', {
    onDashboardUpdate: handleDashboardUpdate,
    onJobEvent: handleJobEvent,
    onTechEvent: handleTechEvent,
    onNotification: handleNotification,
  });

  const handleSimulationEvent = useCallback(
    (event) => {
      if (event?.event_type === 'clock_tick') {
        setSimElapsed(event?.details?.elapsed_minutes ?? null);
        return;
      }

      if (
        [
          'job_assigned',
          'job_started',
          'job_completed',
          'scripted_beat',
          'day_complete',
        ].includes(event?.event_type)
      ) {
        addEvent(
          '',
          text(event?.details?.description) ||
            (event?.job_id
              ? `Intervention #${event.job_id} ${text(
                  event.event_type,
                ).replace('job_', '')}`
              : 'Événement de simulation'),
          event?.event_type === 'job_completed' ? 'success' : 'job',
        );

        scheduleRefresh();
      }
    },
    [addEvent, scheduleRefresh],
  );

  useSimEvents(handleSimulationEvent);

  useEffect(() => {
    if (!selected) return;

    const source = selected.type === 'tech' ? technicians : jobs;
    const selectedId =
      selected.type === 'tech'
        ? technicianId(selected.data)
        : jobId(selected.data);

    const updated = source.find((item) =>
      selected.type === 'tech'
        ? technicianId(item) === selectedId
        : jobId(item) === selectedId,
    );

    if (!updated || updated === selected.data) return undefined;
    const frameId = window.requestAnimationFrame(() => {
      setSelected({
        type: selected.type,
        data: updated,
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [jobs, selected, technicians]);

  const counters = useMemo(() => {
    const technicianCounters = {
      available: 0,
      enRoute: 0,
      onJob: 0,
      onBreak: 0,
      offline: 0,
      gpsActive: 0,
      gpsMissing: 0,
    };

    technicians.forEach((technician) => {
      const status = normalizeStatus(
        technician?.live_status ?? technician?.status,
      );

      if (status === 'disponible') technicianCounters.available += 1;
      if (status === 'en_route') technicianCounters.enRoute += 1;
      if (isOnJobTechnician(technician)) technicianCounters.onJob += 1;
      if (status === 'pause') technicianCounters.onBreak += 1;
      if (isOfflineTechnician(technician)) technicianCounters.offline += 1;

      if (validTechCoordinates(technician)) {
        technicianCounters.gpsActive += 1;
      } else {
        technicianCounters.gpsMissing += 1;
      }
    });

    const jobCounters = {
      total: jobs.length,
      inProgress: 0,
      assigned: 0,
      completed: 0,
      urgent: 0,
      unassigned: 0,
    };

    jobs.forEach((job) => {
      const status = normalizeStatus(job?.status);

      if (['in_progress', 'work_in_progress', 'on_site'].includes(status)) {
        jobCounters.inProgress += 1;
      }

      if (isAssignedJob(job) && !isTerminalJob(job)) {
        jobCounters.assigned += 1;
      }

      if (status === 'completed') jobCounters.completed += 1;
      if (isUrgentJob(job) && !isTerminalJob(job)) jobCounters.urgent += 1;
      if (!isAssignedJob(job) && !isTerminalJob(job)) {
        jobCounters.unassigned += 1;
      }
    });

    return {
      technicians: technicianCounters,
      jobs: jobCounters,
    };
  }, [jobs, technicians]);

  const alerts = useMemo(
    () =>
      [
        counters.jobs.urgent > 0 && {
          id: 'urgent',
          icon: '🚨',
          label: 'Interventions urgentes',
          count: counters.jobs.urgent,
          color: 'var(--color-danger)',
          intent: {
            priority: 'URGENT',
          },
        },
        counters.jobs.unassigned > 0 && {
          id: 'unassigned',
          icon: '📋',
          label: 'Non affectées',
          count: counters.jobs.unassigned,
          color: 'var(--color-warning)',
          intent: {
            unassigned: true,
          },
        },
        counters.technicians.offline > 0 && {
          id: 'offline',
          icon: '⚫',
          label: 'Hors ligne',
          count: counters.technicians.offline,
          color: 'var(--color-warning)',
        },
        counters.technicians.gpsMissing > 0 && {
          id: 'gps-missing',
          icon: '📍',
          label: 'GPS indisponibles',
          count: counters.technicians.gpsMissing,
          color: 'var(--color-danger)',
        },
      ].filter(Boolean),
    [counters],
  );

  const filteredTechnicians = useMemo(() => {
    let result = technicians;

    if (filters.sector) {
      result = result.filter((technician) =>
        technicianSectors(technician).includes(filters.sector),
      );
    }

    if (filters.team) {
      result = result.filter(
        (technician) => text(technician?.team) === filters.team,
      );
    }

    if (filters.status) {
      result = result.filter(
        (technician) =>
          normalizeStatus(technician?.live_status ?? technician?.status) ===
          normalizeStatus(filters.status),
      );
    }

    if (kpiFilter?.scope === 'tech') {
      const key = kpiFilter.key;

      result = result.filter((technician) => {
        const status = normalizeStatus(
          technician?.live_status ?? technician?.status,
        );

        if (key === 'available') return status === 'disponible';
        if (key === 'enRoute') return status === 'en_route';
        if (key === 'onJob') return isOnJobTechnician(technician);
        if (key === 'onBreak') return status === 'pause';
        if (key === 'offline') return isOfflineTechnician(technician);
        if (key === 'gpsActive') return validTechCoordinates(technician);
        if (key === 'gpsMissing') return !validTechCoordinates(technician);

        return true;
      });
    }

    if (searchQuery) {
      result = result.filter((technician) =>
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
          searchQuery,
        ),
      );
    }

    return result;
  }, [
    filters,
    kpiFilter,
    searchQuery,
    technicians,
  ]);

  const filteredJobs = useMemo(() => {
    let result = jobs;

    if (filters.sector) {
      result = result.filter((job) => jobSector(job) === filters.sector);
    }

    if (kpiFilter?.scope === 'job') {
      const key = kpiFilter.key;

      result = result.filter((job) => {
        const status = normalizeStatus(job?.status);

        if (key === 'total') return true;
        if (key === 'inProgress') {
          return ['in_progress', 'work_in_progress', 'on_site'].includes(status);
        }
        if (key === 'assigned') return isAssignedJob(job) && !isTerminalJob(job);
        if (key === 'completed') return status === 'completed';
        if (key === 'urgent') return isUrgentJob(job) && !isTerminalJob(job);
        if (key === 'unassigned') {
          return !isAssignedJob(job) && !isTerminalJob(job);
        }

        return true;
      });
    }

    if (searchQuery) {
      result = result.filter((job) =>
        matchesSearch(
          [
            job?.id,
            job?.job_number,
            job?.command_number,
            job?.customer_name,
            job?.customer_phone,
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
            jobSector(job),
          ],
          searchQuery,
        ),
      );
    }

    return result;
  }, [
    filters.sector,
    jobs,
    kpiFilter,
    searchQuery,
  ]);

  const toggleKpiFilter = useCallback((scope, key) => {
    setKpiFilter((current) =>
      current?.scope === scope && current?.key === key
        ? null
        : {
            scope,
            key,
          },
    );
  }, []);

  const navigateToInterventions = useCallback(
    (intent = null) => {
      if (typeof onNavigate !== 'function') return;

      try {
        if (intent) {
          sessionStorage.setItem(
            'cockpit_filter',
            JSON.stringify(intent),
          );
        } else {
          sessionStorage.removeItem('cockpit_filter');
        }
      } catch {
        // Le payload direct reste disponible.
      }

      onNavigate('interventions', intent);
    },
    [onNavigate],
  );

  const selectTechnician = useCallback((technician) => {
    setSelected({
      type: 'tech',
      data: technician,
    });
  }, []);

  const selectJob = useCallback((job) => {
    setSelected({
      type: 'job',
      data: job,
    });
  }, []);

  if (loading && !technicians.length && !jobs.length) {
    return (
      <div className="loading-screen" role="status" aria-live="polite">
        <div className="loading-spinner" aria-hidden="true" />
        Chargement du centre de supervision…
      </div>
    );
  }

  return (
    <div className="sv-page">
      <header className="sv-header">
        <div className="sv-header-left">
          <h1>🖥️ Centre de supervision</h1>

          <span
            className="sv-live-badge"
            style={{
              color: websocket.connected
                ? 'var(--color-success)'
                : 'var(--color-warning)',
            }}
            title={
              websocket.connected
                ? 'Connexion temps réel active'
                : 'Reconnexion temps réel en cours'
            }
          >
            {websocket.connected ? '● LIVE' : '○ RECONNEXION'}
          </span>

          <span className="sv-header-date">{formatDate()}</span>
          <span className="sv-header-clock">{realClock}</span>
        </div>

        <div className="sv-header-center">
          <span className="sv-header-count">
            👷 {technicians.length} technicien
            {technicians.length > 1 ? 's' : ''}
          </span>
          <span className="sv-header-count">
            📋 {jobs.length} intervention{jobs.length > 1 ? 's' : ''}
          </span>
          <span className="sv-header-count">
            🔗 {technicians.length - counters.technicians.offline} actifs
          </span>
        </div>

        <div className="sv-header-right">
          <label className="sv-search">
            <span className="sv-search-icon" aria-hidden="true">
              🔍
            </span>
            <input
              className="sv-search-input"
              type="search"
              placeholder="Intervention, client, adresse…"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              aria-label="Rechercher dans la supervision"
            />
          </label>

          {lastUpdatedAt && (
            <span
              className="sv-header-count"
              title={lastUpdatedAt.toLocaleString('fr-FR')}
            >
              MAJ {formatTime(lastUpdatedAt)}
            </span>
          )}

          <Button
            type="button"
            variant="secondary"
            onClick={() => loadData()}
            loading={refreshing}
            disabled={refreshing || demoLocked}
            aria-label="Actualiser la supervision"
            title="Actualiser"
          >
            <RefreshIcon />
          </Button>
        </div>
      </header>

      <SimBar
        elapsedMinutes={simElapsed}
        onToast={toast}
        onRunningChange={setDemoLocked}
      />

      {loadError && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '7px 12px',
            color: 'var(--color-danger)',
            background: 'var(--color-danger-dim)',
            borderBottom: '1px solid var(--color-danger)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          <span>{loadError}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => loadData()}
            disabled={refreshing}
          >
            Réessayer
          </Button>
        </div>
      )}

      <div className="sv-kpi-row" aria-label="Indicateurs de supervision">
        <KPI
          label="Disponibles"
          value={counters.technicians.available}
          icon="🟢"
          color="var(--color-success)"
          active={kpiFilter?.scope === 'tech' && kpiFilter.key === 'available'}
          onClick={() => toggleKpiFilter('tech', 'available')}
        />
        <KPI
          label="En route"
          value={counters.technicians.enRoute}
          icon="🚗"
          color="var(--color-info)"
          active={kpiFilter?.scope === 'tech' && kpiFilter.key === 'enRoute'}
          onClick={() => toggleKpiFilter('tech', 'enRoute')}
        />
        <KPI
          label="En intervention"
          value={counters.technicians.onJob}
          icon="🔧"
          color="var(--color-warning)"
          active={kpiFilter?.scope === 'tech' && kpiFilter.key === 'onJob'}
          onClick={() => toggleKpiFilter('tech', 'onJob')}
        />
        <KPI
          label="Pause"
          value={counters.technicians.onBreak}
          icon="☕"
          color="var(--color-warning)"
          active={kpiFilter?.scope === 'tech' && kpiFilter.key === 'onBreak'}
          onClick={() => toggleKpiFilter('tech', 'onBreak')}
        />
        <KPI
          label="Hors ligne"
          value={counters.technicians.offline}
          icon="🔴"
          color={
            counters.technicians.offline > 0
              ? 'var(--color-danger)'
              : 'var(--text-muted)'
          }
          active={kpiFilter?.scope === 'tech' && kpiFilter.key === 'offline'}
          onClick={() => toggleKpiFilter('tech', 'offline')}
        />
        <KPI
          label="GPS actifs"
          value={counters.technicians.gpsActive}
          icon="📍"
          color="var(--color-success)"
          active={kpiFilter?.scope === 'tech' && kpiFilter.key === 'gpsActive'}
          onClick={() => toggleKpiFilter('tech', 'gpsActive')}
        />
        <KPI
          label="GPS indisponibles"
          value={counters.technicians.gpsMissing}
          icon="📍"
          color={
            counters.technicians.gpsMissing > 0
              ? 'var(--color-danger)'
              : 'var(--text-muted)'
          }
          active={kpiFilter?.scope === 'tech' && kpiFilter.key === 'gpsMissing'}
          onClick={() => toggleKpiFilter('tech', 'gpsMissing')}
        />

        <div className="sv-kpi-sep" aria-hidden="true" />

        <KPI
          label="Total"
          value={counters.jobs.total}
          icon="📋"
          color="var(--color-accent)"
          active={kpiFilter?.scope === 'job' && kpiFilter.key === 'total'}
          onClick={() => toggleKpiFilter('job', 'total')}
        />
        <KPI
          label="En cours"
          value={counters.jobs.inProgress}
          icon="⚡"
          color="var(--color-purple)"
          active={kpiFilter?.scope === 'job' && kpiFilter.key === 'inProgress'}
          onClick={() => toggleKpiFilter('job', 'inProgress')}
        />
        <KPI
          label="Affectées"
          value={counters.jobs.assigned}
          icon="👤"
          color="var(--color-info)"
          active={kpiFilter?.scope === 'job' && kpiFilter.key === 'assigned'}
          onClick={() => toggleKpiFilter('job', 'assigned')}
        />
        <KPI
          label="Terminées"
          value={counters.jobs.completed}
          icon="✅"
          color="var(--color-success)"
          active={kpiFilter?.scope === 'job' && kpiFilter.key === 'completed'}
          onClick={() => toggleKpiFilter('job', 'completed')}
        />
        <KPI
          label="Urgentes"
          value={counters.jobs.urgent}
          icon="🚨"
          color={
            counters.jobs.urgent > 0
              ? 'var(--color-danger)'
              : 'var(--text-muted)'
          }
          active={kpiFilter?.scope === 'job' && kpiFilter.key === 'urgent'}
          onClick={() => toggleKpiFilter('job', 'urgent')}
        />
        <KPI
          label="Non affectées"
          value={counters.jobs.unassigned}
          icon="📋"
          color={
            counters.jobs.unassigned > 0
              ? 'var(--color-warning)'
              : 'var(--text-muted)'
          }
          active={kpiFilter?.scope === 'job' && kpiFilter.key === 'unassigned'}
          onClick={() => toggleKpiFilter('job', 'unassigned')}
        />
      </div>

      <div className="sv-toolbar">
        <FilterPanel
          filters={filters}
          onChange={(key, value) =>
            setFilters((current) => ({
              ...current,
              [key]: value,
            }))
          }
          onClear={() => {
            setFilters({ ...EMPTY_FILTERS });
            setKpiFilter(null);
          }}
          technicians={technicians}
          jobs={jobs}
        />

        <div className="sv-toolbar-right">
          <button
            type="button"
            className={`sv-toggle${showMap ? ' sv-toggle--on' : ''}`}
            onClick={() => setShowMap((current) => !current)}
            aria-pressed={showMap}
          >
            🗺️ Carte
          </button>
          <button
            type="button"
            className={`sv-toggle${showAlerts ? ' sv-toggle--on' : ''}`}
            onClick={() => setShowAlerts((current) => !current)}
            aria-pressed={showAlerts}
          >
            🔔 Alertes
          </button>
          <button
            type="button"
            className={`sv-toggle${showTimeline ? ' sv-toggle--on' : ''}`}
            onClick={() => setShowTimeline((current) => !current)}
            aria-pressed={showTimeline}
          >
            📜 Timeline
          </button>
          <button
            type="button"
            className={`sv-toggle${mapLayers.techs ? ' sv-toggle--on' : ''}`}
            onClick={() =>
              setMapLayers((current) => ({
                ...current,
                techs: !current.techs,
              }))
            }
            aria-pressed={mapLayers.techs}
          >
            👷 Couche techniciens
          </button>
          <button
            type="button"
            className={`sv-toggle${mapLayers.jobs ? ' sv-toggle--on' : ''}`}
            onClick={() =>
              setMapLayers((current) => ({
                ...current,
                jobs: !current.jobs,
              }))
            }
            aria-pressed={mapLayers.jobs}
          >
            📋 Couche interventions
          </button>
        </div>
      </div>

      <div className="sv-main">
        <div className="sv-left">
          <section className="sv-panel">
            <div className="sv-panel-header">
              <span>👷 Techniciens ({filteredTechnicians.length})</span>
              <div className="sv-panel-actions">
                <button
                  type="button"
                  className={`sv-toggle-sm${showTechs ? ' sv-toggle-sm--on' : ''}`}
                  onClick={() => setShowTechs((current) => !current)}
                  aria-pressed={showTechs}
                >
                  {showTechs ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </div>

            <div
              className="sv-panel-body"
              style={{
                height: showTechs ? 280 : 0,
                overflow: 'hidden',
              }}
            >
              {showTechs && (
                <TechGrid
                  technicians={filteredTechnicians}
                  selectedIds={
                    selected?.type === 'tech'
                      ? [selected.data?.id]
                      : []
                  }
                  onRowDoubleClicked={selectTechnician}
                />
              )}
            </div>
          </section>

          <section className="sv-panel">
            <div className="sv-panel-header">
              <span>📋 Interventions ({filteredJobs.length})</span>
              <div className="sv-panel-actions">
                <button
                  type="button"
                  className={`sv-toggle-sm${showJobs ? ' sv-toggle-sm--on' : ''}`}
                  onClick={() => setShowJobs((current) => !current)}
                  aria-pressed={showJobs}
                >
                  {showJobs ? 'Masquer' : 'Afficher'}
                </button>
              </div>
            </div>

            <div
              className="sv-panel-body"
              style={{
                height: showJobs ? 280 : 0,
                overflow: 'hidden',
              }}
            >
              {showJobs && (
                <JobGrid
                  jobs={filteredJobs}
                  simElapsed={simElapsed}
                  selectedIds={
                    selected?.type === 'job'
                      ? [selected.data?.id]
                      : []
                  }
                  onRowDoubleClicked={selectJob}
                />
              )}
            </div>
          </section>

          {showAlerts && (
            <section className="sv-panel">
              <div className="sv-panel-header">
                <span>🔔 Alertes ({alerts.length})</span>
              </div>

              <div className="sv-panel-body">
                {alerts.length === 0 && (
                  <div className="sv-tl-empty" role="status">
                    Aucune alerte opérationnelle.
                  </div>
                )}

                {alerts.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    onClick={
                      alert.intent
                        ? () => navigateToInterventions(alert.intent)
                        : alert.id === 'offline'
                          ? () => setKpiFilter({ scope: 'tech', key: 'offline' })
                          : alert.id === 'gps-missing'
                            ? () =>
                                setKpiFilter({
                                  scope: 'tech',
                                  key: 'gpsMissing',
                                })
                            : undefined
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="sv-center">
          {showMap && (
            <div className="sv-map-container">
              <MapWindow
                floating={false}
                technicians={
                  mapLayers.techs ? filteredTechnicians : []
                }
                jobs={mapLayers.jobs ? filteredJobs : []}
                onTechClick={selectTechnician}
                onJobClick={selectJob}
                onDoubleClickTech={selectTechnician}
                onDoubleClickJob={selectJob}
                showFullscreenBtn
                showLegend
              />
            </div>
          )}

          {showTimeline && (
            <section className="sv-panel">
              <div className="sv-panel-header">
                <span>📜 Activité temps réel ({timeline.length})</span>
              </div>

              <div
                className="sv-panel-body sv-timeline-body"
                role="list"
                aria-label="Activité temps réel"
              >
                {timeline.length === 0 && (
                  <div className="sv-tl-empty" role="status">
                    En attente d’événements…
                  </div>
                )}

                {timeline.map((event) => (
                  <TimelineEvent key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="sv-right" aria-label="Détails de la sélection">
          {selected ? (
            <DetailPanel
              selected={selected}
              onClose={() => setSelected(null)}
              onNavigate={onNavigate}
            />
          ) : (
            <div className="sv-right-empty">
              <div className="sv-right-empty-icon" aria-hidden="true">
                🖥️
              </div>
              <p>
                Sélectionnez un technicien
                <br />
                ou une intervention
              </p>
            </div>
          )}
        </aside>
      </div>

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
