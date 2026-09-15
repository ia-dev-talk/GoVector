import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../../api/client';
import {
  buildInterventionPeriod,
  interventionDateSpan,
  isValidInterventionPeriod,
} from '../../lib/intervention-period.js';
import {
  eligibleTechniciansForJobs,
  jobOperationalSector,
} from '../../lib/job-sector.js';

const PAGE_SIZE = 100;
const API_PAGE_SIZE = 500;

const PERIOD_OPTIONS = [
  ['today', "Aujourd’hui"],
  ['tomorrow', 'Demain'],
  ['week', 'Cette semaine'],
  ['month', 'Ce mois'],
  ['next_month', 'Mois prochain'],
  ['year', 'Cette année'],
  ['custom', 'Période personnalisée'],
  ['unscheduled', 'Sans date'],
];

function text(value) {
  return value === null || value === undefined
    ? ''
    : String(value).trim();
}

function normalize(value) {
  return text(value).toLocaleLowerCase('fr');
}

function technicianLabel(technician) {
  return (
    text(technician?.name)
    || [technician?.first_name, technician?.last_name]
      .map(text)
      .filter(Boolean)
      .join(' ')
    || `Technicien #${technician?.id}`
  );
}

function formatScheduledDate(value) {
  if (!value) return 'Sans date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value) || 'Sans date';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function statusLabel(value) {
  const source = text(value).replace(/_/g, ' ').toLocaleLowerCase('fr');
  return source
    ? source.charAt(0).toLocaleUpperCase('fr') + source.slice(1)
    : 'Non renseigné';
}

function apiErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  return fallback;
}

async function loadAllJobs(params) {
  const records = [];
  const seen = new Set();

  for (let skip = 0; ; skip += API_PAGE_SIZE) {
    const response = await api.getJobs({
      ...params,
      skip,
      limit: API_PAGE_SIZE,
    });
    const page = Array.isArray(response?.data) ? response.data : [];
    let added = 0;

    page.forEach((job) => {
      const key = job?.id == null ? null : String(job.id);
      if (key !== null && seen.has(key)) return;
      if (key !== null) seen.add(key);
      records.push(job);
      added += 1;
    });

    if (page.length < API_PAGE_SIZE || added === 0) break;
  }

  return records;
}

export default function InterventionPeriodWorkspace() {
  const initialMonth = useMemo(
    () => buildInterventionPeriod('month'),
    [],
  );
  const [scope, setScope] = useState('month');
  const [customFrom, setCustomFrom] = useState(initialMonth.from);
  const [customTo, setCustomTo] = useState(initialMonth.to);
  const [jobs, setJobs] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [technicianId, setTechnicianId] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    sector: '',
    status: '',
    operator: '',
    type: '',
    assignment: '',
  });
  const requestRef = useRef(0);

  const period = useMemo(() => {
    if (scope === 'custom') {
      return { from: customFrom, to: customTo, scope };
    }
    return buildInterventionPeriod(scope);
  }, [customFrom, customTo, scope]);

  const loadJobs = useCallback(async () => {
    if (
      scope === 'custom'
      && !isValidInterventionPeriod(period.from, period.to)
    ) {
      setJobs([]);
      setError('La période personnalisée est invalide.');
      setLoading(false);
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const params = scope === 'unscheduled'
        ? {}
        : {
            scheduled_from: period.from,
            scheduled_to: period.to,
          };
      let records = await loadAllJobs(params);

      if (scope === 'unscheduled') {
        records = records.filter((job) => !job?.scheduled_date);
      }

      if (requestId !== requestRef.current) return;

      records.sort((left, right) => {
        const leftDate = text(left?.scheduled_date) || '9999';
        const rightDate = text(right?.scheduled_date) || '9999';
        if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
        return Number(left?.id || 0) - Number(right?.id || 0);
      });

      setJobs(records);
      setSelectedIds([]);
      setTechnicianId('');
      setPage(1);
    } catch (loadError) {
      if (requestId !== requestRef.current) return;
      setJobs([]);
      setError(apiErrorMessage(
        loadError,
        'Impossible de charger les interventions de cette période.',
      ));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [period.from, period.to, scope]);

  useEffect(() => {
    loadJobs();
    return () => {
      requestRef.current += 1;
    };
  }, [loadJobs]);

  useEffect(() => {
    api.getTechnicians()
      .then((response) => {
        setTechnicians(Array.isArray(response?.data) ? response.data : []);
      })
      .catch(() => {
        setTechnicians([]);
      });
  }, []);

  const options = useMemo(() => {
    const values = (fieldGetter) => [
      ...new Set(jobs.map(fieldGetter).map(text).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, 'fr'));

    return {
      sectors: values(jobOperationalSector),
      statuses: values((job) => job?.status),
      operators: values((job) => job?.operator),
      types: values((job) => job?.job_type),
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const search = normalize(filters.search);

    return jobs.filter((job) => {
      if (filters.sector && jobOperationalSector(job) !== filters.sector) return false;
      if (filters.status && text(job?.status) !== filters.status) return false;
      if (filters.operator && text(job?.operator) !== filters.operator) return false;
      if (filters.type && text(job?.job_type) !== filters.type) return false;
      if (filters.assignment === 'assigned' && job?.assigned_tech_id == null) return false;
      if (filters.assignment === 'unassigned' && job?.assigned_tech_id != null) return false;

      if (search) {
        const haystack = [
          job?.job_number,
          job?.id,
          job?.customer_name,
          job?.customer_phone,
          job?.service_address,
          job?.service_city,
          job?.operator,
          jobOperationalSector(job),
        ].map(normalize);
        if (!haystack.some((value) => value.includes(search))) return false;
      }

      return true;
    });
  }, [filters, jobs]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const selectedSet = useMemo(
    () => new Set(selectedIds.map(Number)),
    [selectedIds],
  );
  const selectedJobs = useMemo(
    () => jobs.filter((job) => selectedSet.has(Number(job?.id))),
    [jobs, selectedSet],
  );
  const selectedSectorIds = useMemo(
    () => new Set(selectedJobs.map((job) => job?.sector_id ?? null)),
    [selectedJobs],
  );
  const selectionHasOneRealSector = (
    selectedJobs.length > 0
    && selectedSectorIds.size === 1
    && !selectedSectorIds.has(null)
  );
  const eligibleTechnicians = useMemo(
    () => eligibleTechniciansForJobs(
      technicians,
      jobs,
      selectedIds,
    ),
    [jobs, selectedIds, technicians],
  );

  useEffect(() => {
    if (
      technicianId
      && !eligibleTechnicians.some(
        (technician) => String(technician.id) === String(technicianId),
      )
    ) {
      setTechnicianId('');
    }
  }, [eligibleTechnicians, technicianId]);

  const span = useMemo(() => interventionDateSpan(jobs), [jobs]);
  const pageCount = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleJobs = filteredJobs.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const filteredIds = filteredJobs
    .map((job) => Number(job?.id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const allFilteredSelected = (
    filteredIds.length > 0
    && filteredIds.every((id) => selectedSet.has(id))
  );

  function changeScope(nextScope) {
    setScope(nextScope);
    setSelectedIds([]);
    setTechnicianId('');
    setNotice(null);
  }

  function toggleJob(jobId) {
    const id = Number(jobId);
    if (!Number.isInteger(id) || id < 1) return;
    setSelectedIds((current) => (
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    ));
  }

  function toggleAllFiltered() {
    setSelectedIds(allFilteredSelected ? [] : filteredIds);
  }

  async function assignSelection() {
    if (!selectionHasOneRealSector) {
      setError(
        'Affectation refusée : sélectionnez des interventions d’un même secteur réel.',
      );
      return;
    }
    if (!technicianId || selectedIds.length === 0) return;

    setAssigning(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.batchAssign(
        selectedIds,
        Number(technicianId),
      );
      const assigned = Number(response?.data?.assigned || 0);
      const skipped = Number(response?.data?.skipped || 0);
      const errors = Array.isArray(response?.data?.errors)
        ? response.data.errors.filter(Boolean)
        : [];
      setNotice(
        `${assigned} intervention(s) affectée(s)`
        + (skipped > 0 ? ` · ${skipped} ignorée(s)` : '')
        + (errors.length > 0 ? ` · ${errors.length} erreur(s)` : ''),
      );
      await loadJobs();
    } catch (assignError) {
      setError(apiErrorMessage(assignError, "Échec de l’affectation multiple."));
    } finally {
      setAssigning(false);
    }
  }

  return (
    <div className="intervention-period-workspace">
      <header className="intervention-period-header">
        <div>
          <span className="intervention-period-eyebrow">Exploitation multi-dates</span>
          <h1>Préparer et affecter les interventions futures</h1>
          <p>
            Les dates importées restent intactes. La période sert uniquement à afficher,
            filtrer et sélectionner les interventions à traiter.
          </p>
        </div>
        <div className="intervention-period-summary">
          <strong>{jobs.length}</strong>
          <span>interventions chargées</span>
          {span.distinctDates > 0 ? (
            <small>
              {span.distinctDates} date(s) · {span.first} → {span.last}
            </small>
          ) : null}
        </div>
      </header>

      <section className="intervention-period-controls">
        <div className="intervention-period-presets" aria-label="Période affichée">
          {PERIOD_OPTIONS.map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={scope === value ? 'is-active' : ''}
              onClick={() => changeScope(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {scope === 'custom' ? (
          <div className="intervention-period-custom">
            <label>
              <span>Du</span>
              <input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </label>
            <label>
              <span>Au</span>
              <input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </label>
          </div>
        ) : null}
      </section>

      <section className="intervention-period-filters">
        <input
          type="search"
          placeholder="Commande, client, adresse…"
          value={filters.search}
          onChange={(event) => setFilters((current) => ({
            ...current,
            search: event.target.value,
          }))}
        />
        <select
          value={filters.sector}
          onChange={(event) => setFilters((current) => ({
            ...current,
            sector: event.target.value,
          }))}
        >
          <option value="">Tous les secteurs</option>
          {options.sectors.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select
          value={filters.status}
          onChange={(event) => setFilters((current) => ({
            ...current,
            status: event.target.value,
          }))}
        >
          <option value="">Tous les statuts</option>
          {options.statuses.map((value) => (
            <option key={value} value={value}>{statusLabel(value)}</option>
          ))}
        </select>
        <select
          value={filters.operator}
          onChange={(event) => setFilters((current) => ({
            ...current,
            operator: event.target.value,
          }))}
        >
          <option value="">Tous les opérateurs</option>
          {options.operators.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select
          value={filters.type}
          onChange={(event) => setFilters((current) => ({
            ...current,
            type: event.target.value,
          }))}
        >
          <option value="">Tous les types</option>
          {options.types.map((value) => <option key={value}>{value}</option>)}
        </select>
        <select
          value={filters.assignment}
          onChange={(event) => setFilters((current) => ({
            ...current,
            assignment: event.target.value,
          }))}
        >
          <option value="">Affectées et non affectées</option>
          <option value="unassigned">Non affectées</option>
          <option value="assigned">Déjà affectées</option>
        </select>
      </section>

      <section className="intervention-period-batchbar">
        <div>
          <button type="button" onClick={toggleAllFiltered} disabled={filteredIds.length === 0}>
            {allFilteredSelected ? 'Désélectionner le filtre' : `Tout sélectionner (${filteredIds.length})`}
          </button>
          <span>
            <strong>{selectedIds.length}</strong> sélectionnée(s) · plusieurs dates autorisées
          </span>
        </div>
        <div>
          <select
            value={technicianId}
            onChange={(event) => setTechnicianId(event.target.value)}
            disabled={!selectionHasOneRealSector || eligibleTechnicians.length === 0}
          >
            <option value="">
              {selectionHasOneRealSector
                ? 'Choisir un technicien éligible'
                : 'Sélectionnez un seul secteur réel'}
            </option>
            {eligibleTechnicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technicianLabel(technician)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="intervention-period-assign"
            onClick={assignSelection}
            disabled={
              assigning
              || selectedIds.length === 0
              || !selectionHasOneRealSector
              || !technicianId
            }
          >
            {assigning ? 'Affectation…' : 'Affecter la sélection'}
          </button>
        </div>
      </section>

      {error ? <div className="intervention-period-message is-error">{error}</div> : null}
      {notice ? <div className="intervention-period-message is-success">{notice}</div> : null}

      <section className="intervention-period-table-wrap">
        {loading ? (
          <div className="intervention-period-empty">Chargement de la période…</div>
        ) : filteredJobs.length === 0 ? (
          <div className="intervention-period-empty">
            Aucune intervention dans ce périmètre. Les autres dates ne sont pas supprimées.
          </div>
        ) : (
          <table className="intervention-period-table">
            <thead>
              <tr>
                <th />
                <th>Date</th>
                <th>Commande</th>
                <th>Client</th>
                <th>Secteur</th>
                <th>Type</th>
                <th>Statut</th>
                <th>Technicien</th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedSet.has(Number(job.id))}
                      onChange={() => toggleJob(job.id)}
                      aria-label={`Sélectionner ${job.job_number || job.id}`}
                    />
                  </td>
                  <td>{formatScheduledDate(job.scheduled_date)}</td>
                  <td>{job.job_number || `#${job.id}`}</td>
                  <td>{job.customer_name || 'Non renseigné'}</td>
                  <td>{jobOperationalSector(job) || 'Non renseigné'}</td>
                  <td>{job.job_type || 'Non renseigné'}</td>
                  <td>{statusLabel(job.status)}</td>
                  <td>{
                    job.assigned_technician_name
                    || job.assigned_tech_name
                    || (job.assigned_tech_id ? `#${job.assigned_tech_id}` : 'Non affectée')
                  }</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="intervention-period-footer">
        <span>{filteredJobs.length} résultat(s) après filtres</span>
        <div>
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Précédent
          </button>
          <span>Page {safePage} / {pageCount}</span>
          <button
            type="button"
            disabled={safePage >= pageCount}
            onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
          >
            Suivant
          </button>
        </div>
      </footer>
    </div>
  );
}
