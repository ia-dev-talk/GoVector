import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { api } from '../api/client';
import '../styles/planning-pilot.css';

const ACTIVE_STATUSES = new Set([
  'in_progress',
  'en_intervention',
  'en_tache',
]);

const COMPLETED_STATUSES = new Set([
  'completed',
  'terminee',
  'termine',
]);

const WEEKDAY_SHORT = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
const WEEK_RANGE = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' });

function text(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
}

function records(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function normalizeStatus(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text(value));
  if (!match) return null;
  const result = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

function shiftDate(date, delta) {
  const result = new Date(date);
  result.setDate(result.getDate() + delta);
  return result;
}

function startOfWeek(date) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  const weekday = result.getDay();
  const distance = weekday === 0 ? -6 : 1 - weekday;
  result.setDate(result.getDate() + distance);
  return result;
}

function buildWeek(date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
}

function scheduledDateKey(job) {
  const raw = text(
    job?.scheduled_date ??
      job?.scheduled_at ??
      job?.appointment_date ??
      job?.date,
  );
  if (!raw) return '';
  const direct = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct) return direct[1];
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : dateKey(parsed);
}

function formatTime(job) {
  const direct = text(job?.time_slot_start);
  if (direct) return direct.slice(0, 5);

  const candidates = [
    job?.scheduled_start,
    job?.scheduled_at,
    job?.start_at,
    job?.start_time,
    job?.scheduled_time,
  ];

  for (const value of candidates) {
    const normalized = text(value);
    if (!normalized) continue;
    const match = normalized.match(/(?:T|\s)(\d{2}:\d{2})/) || normalized.match(/^(\d{2}:\d{2})/);
    if (match) return match[1];
  }

  return '—';
}

function formatEndTime(job) {
  const direct = text(job?.time_slot_end);
  return direct ? direct.slice(0, 5) : '';
}

function jobLabel(job) {
  return text(
    job?.job_number ??
      job?.reference ??
      job?.external_id ??
      job?.client_reference ??
      job?.title,
    job?.id ? `#${job.id}` : 'Intervention',
  );
}

function jobType(job) {
  return text(job?.job_type ?? job?.type ?? job?.activity, '—').replace(/_/g, ' ');
}

function jobClient(job) {
  return text(job?.customer_name ?? job?.client_name ?? job?.site_name, '');
}

function jobSector(job) {
  return text(
    job?.sector_name ??
      job?.sector_raw ??
      job?.sector ??
      job?.route_criteria ??
      job?.zone,
    '',
  );
}

function assignedTechnicianId(job) {
  return text(
    job?.assignment?.technician_id ??
      job?.assigned_tech_id ??
      job?.assigned_technician_id ??
      job?.technician_id,
  );
}

function technicianName(job, technicianById) {
  const inline = text(
    job?.assigned_tech_name ??
      job?.assigned_technician_name ??
      job?.technician_name ??
      job?.assignment?.technician?.name,
  );
  if (inline) return inline;

  const identifier = assignedTechnicianId(job);
  if (!identifier) return 'Non affecté';

  const technician = technicianById.get(identifier);
  return text(
    technician?.name ?? technician?.full_name ?? technician?.username,
    `Technicien #${identifier}`,
  );
}

function statusLabel(status) {
  const normalized = normalizeStatus(status);
  const labels = {
    pending: 'À affecter',
    en_attente: 'À affecter',
    assigned: 'Affectée',
    affectee: 'Affectée',
    in_progress: 'En cours',
    en_intervention: 'En intervention',
    en_tache: 'En tâche',
    completed: 'Terminée',
    terminee: 'Terminée',
    cancelled: 'Annulée',
    annulee: 'Annulée',
    on_hold: 'En pause',
    en_pause: 'En pause',
  };
  return labels[normalized] || text(status, '—').replace(/_/g, ' ');
}

function errorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  return text(error?.message, 'Le planning est momentanément indisponible.');
}

function isToday(date) {
  return dateKey(date) === dateKey(new Date());
}

function Card({ job, technicianById, onOpen }) {
  const start = formatTime(job);
  const end = formatEndTime(job);
  const status = normalizeStatus(job?.status) || 'unknown';
  const client = jobClient(job);
  const sector = jobSector(job);

  return (
    <button
      type="button"
      className={`bp-week-job bp-week-job--${status}`}
      onClick={() => onOpen(job)}
      title={`${jobLabel(job)} · ${technicianName(job, technicianById)}`}
    >
      <span className="bp-week-job-time">{start}{end ? `–${end}` : ''}</span>
      <strong>{jobLabel(job)}</strong>
      <span>{jobType(job)}</span>
      {(client || sector) && <small>{client || sector}</small>}
    </button>
  );
}

export default function PlanningPage({ onNavigate }) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [jobs, setJobs] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('');

  const week = useMemo(() => buildWeek(viewDate), [viewDate]);
  const weekStart = week[0];
  const weekEnd = week[6];

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    setError('');

    try {
      const [techniciansResponse, jobsResponse] = await Promise.all([
        api.getTechnicians(),
        api.getJobs({
          scheduled_from: dateKey(weekStart),
          scheduled_to: dateKey(weekEnd),
          limit: 500,
        }),
      ]);

      setTechnicians(records(techniciansResponse?.data));
      setJobs(records(jobsResponse?.data));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [weekEnd, weekStart]);

  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const technicianById = useMemo(
    () => new Map(
      technicians.map((technician) => [text(technician?.id), technician]),
    ),
    [technicians],
  );

  const technicianOptions = useMemo(
    () => [...technicians].sort((left, right) =>
      text(left?.name ?? left?.full_name)
        .localeCompare(text(right?.name ?? right?.full_name), 'fr'),
    ),
    [technicians],
  );

  const visibleJobs = useMemo(() => {
    const query = text(search).toLocaleLowerCase('fr');

    return jobs.filter((job) => {
      const technicianId = assignedTechnicianId(job);
      if (technicianFilter && technicianId !== technicianFilter) return false;
      if (!query) return true;

      const haystack = [
        jobLabel(job),
        jobType(job),
        jobClient(job),
        jobSector(job),
        technicianName(job, technicianById),
        statusLabel(job?.status),
        text(job?.operator),
        text(job?.service_address ?? job?.address),
      ].join(' ').toLocaleLowerCase('fr');

      return haystack.includes(query);
    });
  }, [jobs, search, technicianById, technicianFilter]);

  const jobsByTechnicianAndDay = useMemo(() => {
    const result = new Map();

    visibleJobs.forEach((job) => {
      const technicianId = assignedTechnicianId(job) || 'unassigned';
      const day = scheduledDateKey(job);
      const key = `${technicianId}|${day}`;
      const current = result.get(key) || [];
      current.push(job);
      current.sort((left, right) => formatTime(left).localeCompare(formatTime(right)));
      result.set(key, current);
    });

    return result;
  }, [visibleJobs]);

  const unassignedJobs = useMemo(
    () => visibleJobs.filter((job) => !assignedTechnicianId(job)),
    [visibleJobs],
  );

  const visibleTechnicians = useMemo(() => {
    const base = technicianFilter
      ? technicianOptions.filter((technician) => text(technician?.id) === technicianFilter)
      : technicianOptions;

    if (!search.trim()) return base;
    const idsWithJobs = new Set(
      visibleJobs.map((job) => assignedTechnicianId(job)).filter(Boolean),
    );
    return base.filter((technician) => idsWithJobs.has(text(technician?.id)));
  }, [search, technicianFilter, technicianOptions, visibleJobs]);

  const summary = useMemo(() => {
    let active = 0;
    let completed = 0;
    jobs.forEach((job) => {
      const status = normalizeStatus(job?.status);
      if (ACTIVE_STATUSES.has(status)) active += 1;
      if (COMPLETED_STATUSES.has(status)) completed += 1;
    });
    return {
      total: jobs.length,
      unassigned: jobs.filter((job) => !assignedTechnicianId(job)).length,
      active,
      completed,
    };
  }, [jobs]);

  const openJob = useCallback((job) => {
    if (typeof onNavigate !== 'function') return;
    const parsedId = Number(job?.id);
    const scheduledDate = scheduledDateKey(job);
    onNavigate(
      'interventions',
      Number.isInteger(parsedId) && parsedId > 0
        ? {
            id: parsedId,
            ...(scheduledDate ? { scheduled_date: scheduledDate } : {}),
          }
        : null,
    );
  }, [onNavigate]);

  const weekLabel = `${WEEK_RANGE.format(weekStart)} – ${WEEK_RANGE.format(weekEnd)} ${weekEnd.getFullYear()}`;

  return (
    <div className="bp-planning-page">
      <header className="bp-planning-header">
        <div>
          <span className="bp-planning-eyebrow">ORIENTATION FTTH</span>
          <h1>Planning</h1>
          <p>Semaine du {weekLabel}</p>
        </div>

        <div className="bp-planning-date-controls" aria-label="Navigation du planning">
          <button type="button" onClick={() => setViewDate((date) => shiftDate(date, -7))}>‹ Semaine</button>
          <button type="button" onClick={() => setViewDate(new Date())}>Aujourd’hui</button>
          <input
            type="date"
            value={dateKey(viewDate)}
            onChange={(event) => {
              const nextDate = dateFromKey(event.target.value);
              if (nextDate) setViewDate(nextDate);
            }}
            aria-label="Date du planning"
          />
          <button type="button" onClick={() => setViewDate((date) => shiftDate(date, 7))}>Semaine ›</button>
          <button type="button" onClick={() => load()} disabled={refreshing}>
            {refreshing ? 'Actualisation…' : 'Actualiser'}
          </button>
        </div>
      </header>

      <section className="bp-planning-kpis" aria-label="Synthèse du planning">
        <div><span>Interventions</span><strong>{summary.total}</strong></div>
        <div><span>Non affectées</span><strong>{summary.unassigned}</strong></div>
        <div><span>En cours</span><strong>{summary.active}</strong></div>
        <div><span>Terminées</span><strong>{summary.completed}</strong></div>
      </section>

      <section className="bp-planning-toolbar" aria-label="Filtres du planning">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher une intervention, un client, un secteur…"
          aria-label="Rechercher dans le planning"
        />
        <select
          value={technicianFilter}
          onChange={(event) => setTechnicianFilter(event.target.value)}
          aria-label="Filtrer par technicien"
        >
          <option value="">Tous les techniciens</option>
          {technicianOptions.map((technician) => (
            <option key={text(technician?.id)} value={text(technician?.id)}>
              {text(technician?.name ?? technician?.full_name ?? technician?.username, `Technicien #${technician?.id ?? '—'}`)}
            </option>
          ))}
        </select>
        <span>{visibleJobs.length} intervention{visibleJobs.length !== 1 ? 's' : ''}</span>
      </section>

      {error && (
        <div className="bp-planning-notice" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => load()}>Réessayer</button>
        </div>
      )}

      {unassignedJobs.length > 0 && (
        <section className="bp-planning-unassigned-strip" aria-label="Interventions non affectées">
          <div>
            <strong>Non affectées</strong>
            <span>{unassignedJobs.length} à planifier</span>
          </div>
          <div className="bp-planning-unassigned-cards">
            {unassignedJobs.map((job) => (
              <Card key={text(job?.id, jobLabel(job))} job={job} technicianById={technicianById} onOpen={openJob} />
            ))}
          </div>
        </section>
      )}

      <section className="bp-week-board" aria-label="Planning hebdomadaire par technicien">
        <div className="bp-week-scroll">
          <div className="bp-week-grid bp-week-grid--header">
            <div className="bp-week-resource-header">Ressources</div>
            {week.map((day) => (
              <div key={dateKey(day)} className={`bp-week-day-header ${isToday(day) ? 'is-today' : ''}`}>
                <span>{WEEKDAY_SHORT.format(day).replace('.', '')}</span>
                <strong>{DAY_MONTH.format(day)}</strong>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="bp-planning-empty" role="status">Chargement du planning…</div>
          ) : visibleTechnicians.length === 0 ? (
            <div className="bp-planning-empty">Aucun technicien ne correspond à ces filtres.</div>
          ) : (
            visibleTechnicians.map((technician) => {
              const technicianId = text(technician?.id);
              const name = text(technician?.name ?? technician?.full_name ?? technician?.username, `Technicien #${technicianId}`);
              const status = text(
                technician?.live_status ?? technician?.status,
                '—',
              ).replace(/_/g, ' ');

              return (
                <div className="bp-week-grid bp-week-resource-row" key={technicianId}>
                  <div className="bp-week-resource">
                    <span className="bp-week-avatar">{name.slice(0, 1).toUpperCase()}</span>
                    <div><strong>{name}</strong><small>{status}</small></div>
                  </div>
                  {week.map((day) => {
                    const dayJobs = jobsByTechnicianAndDay.get(`${technicianId}|${dateKey(day)}`) || [];
                    return (
                      <div key={dateKey(day)} className={`bp-week-cell ${isToday(day) ? 'is-today' : ''}`}>
                        {dayJobs.map((job) => (
                          <Card key={text(job?.id, jobLabel(job))} job={job} technicianById={technicianById} onOpen={openJob} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
