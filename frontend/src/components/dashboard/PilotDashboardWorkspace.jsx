import { memo, useMemo } from 'react';

import MapWindow from '../MapWindow';
import { getJobTypeLabel } from '../../lib/job-types.js';

const STATUS_LABELS = Object.freeze({
  PENDING: 'À assigner',
  ASSIGNED: 'Affectée',
  ACCEPTED: 'Acceptée',
  EN_ROUTE: 'En route',
  ON_SITE: 'Sur site',
  IN_PROGRESS: 'En cours',
  WORK_IN_PROGRESS: 'En cours',
  INSTALLATION_DONE: 'Installation terminée',
  CLIENT_VALIDATION: 'Validation client',
  EN_ATTENTE_VALIDATION: 'À contrôler',
  COMPLETED: 'Terminée',
  FAILED: 'Échec',
  POSTPONED: 'Reportée',
  CANCELLED: 'Annulée',
});

function text(value, fallback = '—') {
  if (value === null || value === undefined || typeof value === 'boolean') {
    return fallback;
  }
  return String(value).trim() || fallback;
}

function statusKey(job) {
  return text(job?.status, 'PENDING').toUpperCase();
}

function statusTone(status) {
  if (status === 'COMPLETED') return 'success';
  if (['PENDING', 'EN_ATTENTE_VALIDATION', 'POSTPONED'].includes(status)) return 'warning';
  if (['FAILED', 'CANCELLED'].includes(status)) return 'danger';
  return 'info';
}

function jobNumber(job) {
  return text(job?.job_number ?? job?.command_number ?? job?.id);
}

function customer(job) {
  return text(job?.customer_name ?? job?.client_name ?? job?.service_address);
}

function jobType(job) {
  const raw = job?.job_type ?? job?.activity ?? job?.type;
  return getJobTypeLabel(raw, text(raw, 'Intervention'));
}

function technician(job) {
  return text(
    job?.assigned_technician_name ??
      job?.technician_name ??
      job?.assignment?.technician_name,
  );
}

function dateValue(job) {
  return job?.scheduled_start ?? job?.scheduled_from ?? job?.created_at ?? null;
}

function timeLabel(job) {
  const value = dateValue(job);
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value);
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function isDay(job, dayOffset) {
  const raw = dateValue(job);
  if (!raw) return false;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) return false;
  const target = new Date();
  target.setDate(target.getDate() + dayOffset);
  return value.getFullYear() === target.getFullYear()
    && value.getMonth() === target.getMonth()
    && value.getDate() === target.getDate();
}

function DashboardIcon({ name }) {
  const paths = {
    jobs: <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4" /></>,
    pending: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    active: <path d="m8 5 10 7-10 7V5Z" />,
    done: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.7 2.7L16.5 9" /></>,
    arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] ?? paths.jobs}
    </svg>
  );
}

function Metric({ icon, value, label, tone, onClick }) {
  return (
    <button type="button" className={`pilot-kpi pilot-kpi--${tone}`} onClick={onClick}>
      <span className="pilot-kpi-icon"><DashboardIcon name={icon} /></span>
      <span><strong>{value}</strong><small>{label}</small></span>
    </button>
  );
}

const PilotDashboardWorkspace = memo(function PilotDashboardWorkspace({
  summary = {},
  jobs = [],
  technicians = [],
  onNavigate,
}) {
  const recentJobs = useMemo(
    () => [...jobs]
      .sort((first, second) => {
        const firstTime = new Date(dateValue(first) ?? 0).getTime();
        const secondTime = new Date(dateValue(second) ?? 0).getTime();
        return secondTime - firstTime;
      })
      .slice(0, 6),
    [jobs],
  );

  const unassigned = (job) => !job?.assigned_technician_id && !job?.technician_id;
  const metrics = [
    ['jobs', jobs.filter((job) => isDay(job, 0) && unassigned(job)).length, 'À planifier aujourd’hui', 'primary'],
    ['pending', jobs.filter((job) => isDay(job, 1) && unassigned(job)).length, 'À planifier demain', 'warning'],
    ['active', summary.in_progress ?? 0, 'Interventions en cours à J', 'info'],
    ['done', jobs.filter((job) => jobType(job).toUpperCase() === 'TUBAGE' && statusKey(job) === 'COMPLETED').length, 'Sorties de PCO raccordées', 'success'],
  ];

  const openJob = (job) => onNavigate?.('interventions', { id: job?.id });

  return (
    <div className="pilot-dashboard-body">
      <section className="pilot-kpi-grid" aria-label="Indicateurs de la journée">
        {metrics.map(([icon, value, label, tone]) => (
          <Metric
            key={label}
            icon={icon}
            value={value}
            label={label}
            tone={tone}
            onClick={() => onNavigate?.('interventions')}
          />
        ))}
      </section>

      <section className="pilot-dashboard-grid">
        <article className="pilot-panel pilot-jobs-panel">
          <header className="pilot-panel-header">
            <h2>Interventions du jour</h2>
            <button type="button" onClick={() => onNavigate?.('interventions')}>
              Voir toutes <DashboardIcon name="arrow" />
            </button>
          </header>

          <div className="pilot-table-wrap">
            <table className="pilot-jobs-table">
              <thead>
                <tr>
                  <th>Intervention</th>
                  <th>Client / Site</th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th>Technicien</th>
                  <th>Heure</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.length ? recentJobs.map((job) => {
                  const status = statusKey(job);
                  return (
                    <tr key={job?.id ?? jobNumber(job)} onClick={() => openJob(job)} tabIndex="0">
                      <td><strong>{jobNumber(job)}</strong></td>
                      <td>{customer(job)}</td>
                      <td>{jobType(job)}</td>
                      <td><span className={`pilot-status pilot-status--${statusTone(status)}`}>{STATUS_LABELS[status] ?? text(job?.status)}</span></td>
                      <td>{technician(job)}</td>
                      <td>{timeLabel(job)}</td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan="6" className="pilot-empty">Aucune intervention pour la journée sélectionnée.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="pilot-panel pilot-map-panel">
          <header className="pilot-panel-header">
            <h2>Carte des interventions</h2>
            <button type="button" onClick={() => onNavigate?.('carte')}>
              Voir la carte <DashboardIcon name="arrow" />
            </button>
          </header>
          <div className="pilot-map-frame">
            <MapWindow
              floating={false}
              jobs={jobs}
              technicians={technicians}
              onJobClick={openJob}
              showFullscreenBtn={false}
              showLegend={false}
              autoFit
              style={{ width: '100%', height: '100%', borderRadius: 12 }}
            />
          </div>
        </article>
      </section>
    </div>
  );
});

PilotDashboardWorkspace.displayName = 'PilotDashboardWorkspace';

export default PilotDashboardWorkspace;
