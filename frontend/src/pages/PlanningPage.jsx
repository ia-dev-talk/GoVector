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

function formatDisplayDate(date) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatTime(job) {
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

    const direct = normalized.match(/(?:T|\s)(\d{2}:\d{2})/);
    if (direct) return direct[1];

    const timeOnly = normalized.match(/^(\d{2}:\d{2})/);
    if (timeOnly) return timeOnly[1];
  }

  return '—';
}

function jobLabel(job) {
  return text(
    job?.reference ??
      job?.external_id ??
      job?.client_reference ??
      job?.title,
    job?.id ? `#${job.id}` : 'Intervention',
  );
}

function jobType(job) {
  return text(job?.job_type ?? job?.type ?? job?.activity, '—');
}

function jobSector(job) {
  return text(
    job?.sector_name ??
      job?.sector ??
      job?.route_criteria ??
      job?.zone,
    '—',
  );
}

function technicianName(job, technicianById) {
  const inline = text(
    job?.assigned_tech_name ??
      job?.assigned_technician_name ??
      job?.technician_name,
  );
  if (inline) return inline;

  const identifier = text(
    job?.assigned_tech_id ??
      job?.assigned_technician_id ??
      job?.technician_id,
  );
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

export default function PlanningPage({ onNavigate }) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const [jobs, setJobs] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    setError('');

    try {
      const [techniciansResponse, jobsResponse] = await Promise.all([
        api.getTechnicians(),
        api.getJobs({ scheduled_date: dateKey(viewDate) }),
      ]);

      setTechnicians(records(techniciansResponse?.data));
      setJobs(records(jobsResponse?.data));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [viewDate]);

  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const technicianById = useMemo(
    () => new Map(
      technicians.map((technician) => [
        text(technician?.id),
        technician,
      ]),
    ),
    [technicians],
  );

  const technicianOptions = useMemo(
    () => [...technicians]
      .sort((left, right) =>
        text(left?.name ?? left?.full_name)
          .localeCompare(text(right?.name ?? right?.full_name), 'fr'),
      ),
    [technicians],
  );

  const filteredJobs = useMemo(() => {
    const query = text(search).toLocaleLowerCase('fr');

    return jobs
      .filter((job) => {
        const technicianId = text(
          job?.assigned_tech_id ??
            job?.assigned_technician_id ??
            job?.technician_id,
        );

        if (technicianFilter && technicianId !== technicianFilter) return false;
        if (!query) return true;

        const haystack = [
          jobLabel(job),
          jobType(job),
          jobSector(job),
          technicianName(job, technicianById),
          statusLabel(job?.status),
          text(job?.operator),
          text(job?.client_name),
          text(job?.address),
        ]
          .join(' ')
          .toLocaleLowerCase('fr');

        return haystack.includes(query);
      })
      .sort((left, right) => {
        const leftTime = formatTime(left);
        const rightTime = formatTime(right);
        if (leftTime === '—' && rightTime !== '—') return 1;
        if (rightTime === '—' && leftTime !== '—') return -1;
        return leftTime.localeCompare(rightTime);
      });
  }, [jobs, search, technicianById, technicianFilter]);

  const summary = useMemo(() => {
    let unassigned = 0;
    let active = 0;
    let completed = 0;

    jobs.forEach((job) => {
      const assigned = text(
        job?.assigned_tech_id ??
          job?.assigned_technician_id ??
          job?.technician_id ??
          job?.assigned_tech_name ??
          job?.assigned_technician_name,
      );
      const status = normalizeStatus(job?.status);

      if (!assigned) unassigned += 1;
      if (ACTIVE_STATUSES.has(status)) active += 1;
      if (COMPLETED_STATUSES.has(status)) completed += 1;
    });

    return {
      total: jobs.length,
      unassigned,
      active,
      completed,
    };
  }, [jobs]);

  const openJob = useCallback((job) => {
    if (typeof onNavigate !== 'function') return;
    const parsedId = Number(job?.id);
    onNavigate(
      'interventions',
      Number.isInteger(parsedId) && parsedId > 0
        ? { id: parsedId }
        : null,
    );
  }, [onNavigate]);

  return (
    <div className="bp-planning-page">
      <header className="bp-planning-header">
        <div>
          <span className="bp-planning-eyebrow">ORIENTATION FTTH</span>
          <h1>Planning</h1>
          <p>{formatDisplayDate(viewDate)}</p>
        </div>

        <div className="bp-planning-date-controls" aria-label="Navigation du planning">
          <button type="button" onClick={() => setViewDate((date) => shiftDate(date, -1))}>
            ‹ Jour précédent
          </button>
          <button type="button" onClick={() => setViewDate(new Date())}>
            Aujourd’hui
          </button>
          <input
            type="date"
            value={dateKey(viewDate)}
            onChange={(event) => {
              const nextDate = dateFromKey(event.target.value);
              if (nextDate) setViewDate(nextDate);
            }}
            aria-label="Date du planning"
          />
          <button type="button" onClick={() => setViewDate((date) => shiftDate(date, 1))}>
            Jour suivant ›
          </button>
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
          placeholder="Rechercher une intervention, un secteur, un technicien…"
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
              {text(
                technician?.name ?? technician?.full_name ?? technician?.username,
                `Technicien #${technician?.id ?? '—'}`,
              )}
            </option>
          ))}
        </select>
        <span>{filteredJobs.length} affichée{filteredJobs.length !== 1 ? 's' : ''}</span>
      </section>

      {error && (
        <div className="bp-planning-notice" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => load()}>Réessayer</button>
        </div>
      )}

      <section className="bp-planning-table-card" aria-label="Interventions planifiées">
        {loading ? (
          <div className="bp-planning-empty" role="status">Chargement du planning…</div>
        ) : filteredJobs.length === 0 ? (
          <div className="bp-planning-empty">
            Aucune intervention ne correspond à cette journée et à ces filtres.
          </div>
        ) : (
          <div className="bp-planning-table-scroll">
            <table className="bp-planning-table">
              <thead>
                <tr>
                  <th>Heure</th>
                  <th>Intervention</th>
                  <th>Type</th>
                  <th>Secteur</th>
                  <th>Technicien</th>
                  <th>Statut</th>
                  <th>Priorité</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job, index) => {
                  const rowKey = text(job?.id, `${jobLabel(job)}-${index}`);
                  const assignedTechnician = technicianName(job, technicianById);
                  const unassigned = assignedTechnician === 'Non affecté';

                  return (
                    <tr
                      key={rowKey}
                      tabIndex={0}
                      onClick={() => openJob(job)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openJob(job);
                        }
                      }}
                      title="Ouvrir l’intervention"
                    >
                      <td className="bp-planning-time">{formatTime(job)}</td>
                      <td>
                        <strong>{jobLabel(job)}</strong>
                        <small>{text(job?.client_name ?? job?.customer_name)}</small>
                      </td>
                      <td>{jobType(job)}</td>
                      <td>{jobSector(job)}</td>
                      <td className={unassigned ? 'bp-planning-unassigned' : ''}>
                        {assignedTechnician}
                      </td>
                      <td>
                        <span className={`bp-planning-status bp-planning-status--${normalizeStatus(job?.status) || 'unknown'}`}>
                          {statusLabel(job?.status)}
                        </span>
                      </td>
                      <td>{text(job?.priority, '—')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
