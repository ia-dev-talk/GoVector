import {
  createElement,
  useMemo,
  useState,
} from 'react';

import { api } from '../../api/client';
import {
  BriefcaseIcon,
  CalendarIcon,
  ChevronIcon,
  CloseIcon,
  HistoryIcon,
  PinIcon,
  SaveIcon,
  SettingsIcon,
  ToolIcon,
} from './PersonnelIcons';
import {
  EDITABLE_LIVE_STATUSES,
  formatDateTime,
  getLocationAgeMinutes,
  getStringList,
  getTechGpsState,
  normalizeStatus,
  statusLabel,
  technicianInitials,
  text,
} from './personnelUtils';

const TABS = Object.freeze([
  {
    id: 'overview',
    label: 'Vue d’ensemble',
    Icon: BriefcaseIcon,
  },
  {
    id: 'skills',
    label: 'Compétences',
    Icon: ToolIcon,
  },
  {
    id: 'equipment',
    label: 'Équipement',
    Icon: SettingsIcon,
  },
  {
    id: 'planning',
    label: 'Planning',
    Icon: CalendarIcon,
  },
  {
    id: 'history',
    label: 'Historique',
    Icon: HistoryIcon,
  },
]);

function normalizeForm(tech) {
  return {
    name: text(tech?.name),
    employee_id: text(tech?.employee_id),
    phone: text(tech?.phone),
    email: text(tech?.email),
    address: text(
      tech?.home_address ??
      tech?.address,
    ),
    primary_sector_id:
      tech?.primary_sector_id
        ? String(tech.primary_sector_id)
        : '',
    sector_ids: Array.isArray(tech?.sector_ids)
      ? tech.sector_ids
          .map((value) => Number(value))
          .filter((value) =>
            Number.isInteger(value) &&
            value > 0,
          )
      : [],
    shift_start: text(tech?.shift_start),
    shift_end: text(tech?.shift_end),
    max_jobs_per_day:
      tech?.max_jobs_per_day ?? '',
    live_status: normalizeStatus(
      tech?.live_status,
    ),
    skills: getStringList(tech?.skills),
  };
}

function Field({
  label,
  children,
  wide = false,
}) {
  return (
    <label
      className={[
        'personnel-v3-field',
        wide ? 'personnel-v3-field--wide' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span>{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value, tone = '' }) {
  return (
    <div
      className={[
        'personnel-v3-inspector-metric',
        tone
          ? `personnel-v3-inspector-metric--${tone}`
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyInspector({ selectedCount }) {
  return (
    <aside className="personnel-v3-inspector personnel-v3-inspector--empty">
      <div className="personnel-v3-inspector-empty-icon">
        <ChevronIcon />
      </div>

      <strong>
        {selectedCount > 1
          ? `${selectedCount} techniciens sélectionnés`
          : 'Aucun technicien ouvert'}
      </strong>

      <p>
        Double-cliquez sur une ligne pour ouvrir la fiche complète.
        La sélection simple reste disponible pour les actions groupées.
      </p>
    </aside>
  );
}

function PersonnelInspectorContent({
  tech,
  todayJobs,
  canEditGeneral,
  sectors,
  referenceNow,
  gpsStaleAfterMinutes,
  onClose,
  onSave,
}) {
  const [tab, setTab] = useState('overview');
  const [form, setForm] = useState(() =>
    normalizeForm(tech),
  );
  const [saving, setSaving] = useState(false);
  const [historyJobs, setHistoryJobs] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  const techJobsToday = useMemo(
    () =>
      Array.isArray(todayJobs)
        ? todayJobs
        : [],
    [todayJobs],
  );

  const completedToday = useMemo(
    () =>
      techJobsToday.filter(
        (job) => normalizeStatus(job?.status) === 'completed',
      ),
    [techJobsToday],
  );

  const gpsState = getTechGpsState(
    tech,
    referenceNow,
    gpsStaleAfterMinutes,
  );
  const gpsAge = getLocationAgeMinutes(
    tech,
    referenceNow,
  );
  const currentStatus = normalizeStatus(
    tech.live_status,
  );
  const statusChanged =
    form.live_status &&
    form.live_status !== currentStatus;
  const canSave =
    canEditGeneral ||
    statusChanged;

  const normalizedSectors = useMemo(
    () =>
      Array.isArray(sectors)
        ? sectors.filter((sector) =>
            Number.isInteger(Number(sector?.id)),
          )
        : [],
    [sectors],
  );

  const selectedSectorIds = useMemo(
    () =>
      new Set(
        form.sector_ids.map(String),
      ),
    [form.sector_ids],
  );

  const setPrimarySector = (value) => {
    const normalizedValue = text(value);

    setForm((current) => {
      if (!normalizedValue) {
        return {
          ...current,
          primary_sector_id: '',
        };
      }

      const sectorId = Number(normalizedValue);
      const sectorIds = current.sector_ids.includes(sectorId)
        ? current.sector_ids
        : [...current.sector_ids, sectorId];

      return {
        ...current,
        primary_sector_id: normalizedValue,
        sector_ids: sectorIds,
      };
    });
  };

  const toggleSector = (sectorId) => {
    setForm((current) => {
      const exists =
        current.sector_ids.includes(sectorId);

      if (exists) {
        const sectorIds =
          current.sector_ids.filter(
            (value) => value !== sectorId,
          );

        return {
          ...current,
          sector_ids: sectorIds,
          primary_sector_id:
            String(sectorId) ===
            current.primary_sector_id
              ? ''
              : current.primary_sector_id,
        };
      }

      return {
        ...current,
        sector_ids: [
          ...current.sector_ids,
          sectorId,
        ],
      };
    });
  };

  const updateForm = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleTabChange = async (nextTab) => {
    setTab(nextTab);

    if (
      nextTab !== 'history' ||
      historyLoaded ||
      historyLoading ||
      !tech.id
    ) {
      return;
    }

    setHistoryLoading(true);

    try {
      const response = await api.getJobs({
        assigned_tech_id: tech.id,
      });

      setHistoryJobs(
        Array.isArray(response?.data)
          ? response.data
          : [],
      );
      setHistoryLoaded(true);
    } catch {
      setHistoryJobs([]);
      setHistoryLoaded(true);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canSave || typeof onSave !== 'function') {
      return;
    }

    setSaving(true);

    try {
      await onSave(tech, {
        name: form.name,
        employee_id:
          form.employee_id || null,
        phone:
          form.phone || null,
        email:
          form.email || null,
        address: form.address,
        primary_sector_id:
          form.primary_sector_id
            ? Number(form.primary_sector_id)
            : null,
        sector_ids: form.sector_ids,
        shift_start:
          form.shift_start || null,
        shift_end:
          form.shift_end || null,
        max_jobs_per_day:
          form.max_jobs_per_day === ''
            ? tech.max_jobs_per_day
            : Number(form.max_jobs_per_day),
        live_status: form.live_status,
        skills: form.skills,
        assigned_routes: form.assigned_routes,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="personnel-v3-inspector">
      <header className="personnel-v3-inspector-header">
        <div className="personnel-v3-inspector-avatar">
          {technicianInitials(tech)}
        </div>

        <div className="personnel-v3-inspector-heading">
          <span>Fiche technicien</span>
          <strong>{text(tech.name, 'Technicien')}</strong>
          <small>
            {text(tech.employee_id, `#${tech.id ?? '—'}`)}
            {' · '}
            {statusLabel(tech.live_status)}
          </small>
        </div>

        <button
          type="button"
          className="personnel-v3-inspector-close"
          onClick={onClose}
          aria-label="Fermer la fiche technicien"
        >
          <CloseIcon />
        </button>
      </header>

      <div className="personnel-v3-inspector-statebar">
        <span
          className={`personnel-v3-status personnel-v3-status--${currentStatus || 'unknown'}`}
        >
          <span aria-hidden="true" />
          {statusLabel(tech.live_status)}
        </span>

        <span
          className={`personnel-v3-gps personnel-v3-gps--${gpsState}`}
          title={
            gpsAge === null
              ? 'Ancienneté GPS indisponible'
              : `Dernière position il y a ${gpsAge} min`
          }
        >
          <PinIcon />
          {gpsState === 'active'
            ? 'GPS actif'
            : gpsState === 'stale'
              ? `GPS ancien · ${gpsAge} min`
              : gpsState === 'offline'
                ? 'Hors ligne'
                : 'GPS à vérifier'}
        </span>
      </div>

      <nav className="personnel-v3-inspector-tabs">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={tab === id ? 'is-active' : undefined}
            onClick={() => handleTabChange(id)}
          >
            {createElement(Icon)}
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="personnel-v3-inspector-body">
        {tab === 'overview' ? (
          <>
            <section className="personnel-v3-inspector-section">
              <div className="personnel-v3-inspector-section-title">
                <span>Situation du jour</span>
              </div>

              <div className="personnel-v3-inspector-metrics">
                <Metric
                  label="Interventions"
                  value={techJobsToday.length}
                />
                <Metric
                  label="Terminées"
                  value={completedToday.length}
                  tone="success"
                />
                <Metric
                  label="Capacité max"
                  value={tech.max_jobs_per_day ?? '—'}
                />
                <Metric
                  label="Dernière position"
                  value={
                    gpsAge === null
                      ? '—'
                      : `${gpsAge} min`
                  }
                />
              </div>
            </section>

            <section className="personnel-v3-inspector-section">
              <div className="personnel-v3-inspector-section-title">
                <span>Identité et organisation</span>
              </div>

              <div className="personnel-v3-form-grid">
                <Field label="Nom complet" wide>
                  <input
                    value={form.name}
                    disabled={!canEditGeneral}
                    onChange={(event) =>
                      updateForm('name', event.target.value)
                    }
                  />
                </Field>

                <Field label="Matricule">
                  <input
                    value={form.employee_id}
                    disabled={!canEditGeneral}
                    onChange={(event) =>
                      updateForm('employee_id', event.target.value)
                    }
                  />
                </Field>

                <Field label="Statut terrain">
                  <select
                    value={form.live_status}
                    onChange={(event) =>
                      updateForm('live_status', event.target.value)
                    }
                  >
                    {EDITABLE_LIVE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Téléphone">
                  <input
                    value={form.phone}
                    disabled={!canEditGeneral}
                    onChange={(event) =>
                      updateForm('phone', event.target.value)
                    }
                  />
                </Field>

                <Field label="Email">
                  <input
                    value={form.email}
                    disabled={!canEditGeneral}
                    onChange={(event) =>
                      updateForm('email', event.target.value)
                    }
                  />
                </Field>

                <Field label="Orienteur">
                  <input
                    value={text(
                      tech.orienteur_name,
                      'Non affecté',
                    )}
                    disabled
                  />
                </Field>

                <Field label="Équipe">
                  <input
                    value={text(
                      tech.team,
                      'Liée à l’orienteur',
                    )}
                    disabled
                  />
                </Field>

                <Field label="Secteur principal" wide>
                  <select
                    value={form.primary_sector_id}
                    disabled={
                      !canEditGeneral ||
                      normalizedSectors.length === 0
                    }
                    onChange={(event) =>
                      setPrimarySector(
                        event.target.value,
                      )
                    }
                  >
                    <option value="">
                      Aucun secteur principal
                    </option>

                    {normalizedSectors.map((sector) => (
                      <option
                        key={sector.id}
                        value={sector.id}
                      >
                        {text(sector.name, `Secteur ${sector.id}`)}
                        {sector.is_active === false
                          ? ' — inactif'
                          : ''}
                      </option>
                    ))}
                  </select>

                  {normalizedSectors.length === 0 ? (
                    <small className="personnel-v3-field-help">
                      Aucun secteur configuré. Créez d’abord les secteurs
                      dans le module Secteurs.
                    </small>
                  ) : null}
                </Field>

                <Field label="Début de service">
                  <input
                    type="time"
                    value={form.shift_start}
                    disabled={!canEditGeneral}
                    onChange={(event) =>
                      updateForm('shift_start', event.target.value)
                    }
                  />
                </Field>

                <Field label="Fin de service">
                  <input
                    type="time"
                    value={form.shift_end}
                    disabled={!canEditGeneral}
                    onChange={(event) =>
                      updateForm('shift_end', event.target.value)
                    }
                  />
                </Field>

                <Field label="Maximum quotidien">
                  <input
                    type="number"
                    min="0"
                    value={form.max_jobs_per_day}
                    disabled={!canEditGeneral}
                    onChange={(event) =>
                      updateForm('max_jobs_per_day', event.target.value)
                    }
                  />
                </Field>

                <div className="personnel-v3-linked-data-note personnel-v3-field--wide">
                  <strong>Données liées</strong>
                  <span>
                    Les secteurs sont choisis dans le référentiel BlueVector.
                    Les opérateurs, véhicules et équipes seront raccordés à
                    leurs propres modules plutôt que saisis en texte libre.
                  </span>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {tab === 'skills' ? (
          <section className="personnel-v3-inspector-section">
            <div className="personnel-v3-inspector-section-title">
              <span>Compétences et secteurs</span>
            </div>

            <Field label="Compétences" wide>
              <textarea
                value={form.skills.join(', ')}
                disabled={!canEditGeneral}
                placeholder="Raccordement, SAV, mesures optiques…"
                onChange={(event) =>
                  updateForm(
                    'skills',
                    event.target.value
                      .split(',')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  )
                }
              />
            </Field>

            <div className="personnel-v3-chip-list">
              {form.skills.length > 0
                ? form.skills.map((skill) => (
                    <span key={skill}>{skill}</span>
                  ))
                : <small>Aucune compétence renseignée.</small>}
            </div>

            <div className="personnel-v3-field personnel-v3-field--wide">
              <span>Secteurs affectés</span>

              {normalizedSectors.length > 0 ? (
                <div className="personnel-v3-sector-picker">
                  {normalizedSectors.map((sector) => {
                    const sectorId = Number(sector.id);
                    const checked =
                      selectedSectorIds.has(
                        String(sectorId),
                      );

                    return (
                      <label
                        key={sector.id}
                        className={[
                          'personnel-v3-sector-option',
                          checked ? 'is-selected' : '',
                          sector.is_active === false
                            ? 'is-inactive'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!canEditGeneral}
                          onChange={() =>
                            toggleSector(sectorId)
                          }
                        />

                        <span
                          className="personnel-v3-sector-color"
                          style={{
                            backgroundColor:
                              text(sector.color, '#4b8dff'),
                          }}
                          aria-hidden="true"
                        />

                        <span>
                          {text(
                            sector.name,
                            `Secteur ${sector.id}`,
                          )}
                        </span>

                        {String(sectorId) ===
                        form.primary_sector_id ? (
                          <strong>Principal</strong>
                        ) : null}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="personnel-v3-section-empty">
                  Aucun secteur configuré.
                </div>
              )}

              <small className="personnel-v3-field-help">
                Le secteur principal est automatiquement inclus dans
                les secteurs affectés.
              </small>
            </div>
          </section>
        ) : null}

        {tab === 'equipment' ? (
          <section className="personnel-v3-inspector-section">
            <div className="personnel-v3-inspector-section-title">
              <span>Véhicule et équipement</span>
            </div>

            <div className="personnel-v3-linked-data-note">
              <strong>Équipement lié au stock</strong>
              <span>
                Le véhicule et le matériel ne sont plus saisis en texte libre.
                Ils seront affectés depuis le module Stock pour garantir la
                traçabilité.
              </span>
            </div>

            <div className="personnel-v3-equipment-grid">
              <Metric label="ONT" value={text(tech.ont_serial, '—')} />
              <Metric label="Routeur" value={text(tech.router_serial, '—')} />
              <Metric label="PTO" value={text(tech.pto_sn, '—')} />
              <Metric label="Jarretières" value={tech.patch_cord_count ?? '—'} />
              <Metric label="Câble" value={tech.cable_length_m != null ? `${tech.cable_length_m} m` : '—'} />
              <Metric label="Stock véhicule" value={tech.stock_items_count ?? '—'} />
            </div>
          </section>
        ) : null}

        {tab === 'planning' ? (
          <section className="personnel-v3-inspector-section">
            <div className="personnel-v3-inspector-section-title">
              <span>Interventions du jour</span>
              <strong>{techJobsToday.length}</strong>
            </div>

            {techJobsToday.length > 0 ? (
              <div className="personnel-v3-job-list">
                {techJobsToday.map((job) => (
                  <article key={job.id}>
                    <div>
                      <strong>
                        {text(job.dtli, `Intervention ${job.job_number ?? job.id}`)}
                      </strong>
                      <span>{text(job.customer_name, 'Client non renseigné')}</span>
                    </div>

                    <small>{statusLabel(job.status)}</small>
                  </article>
                ))}
              </div>
            ) : (
              <div className="personnel-v3-section-empty">
                Aucune intervention planifiée aujourd’hui.
              </div>
            )}
          </section>
        ) : null}

        {tab === 'history' ? (
          <section className="personnel-v3-inspector-section">
            <div className="personnel-v3-inspector-section-title">
              <span>Historique des interventions</span>
              <strong>{historyJobs.length}</strong>
            </div>

            {historyLoading ? (
              <div className="personnel-v3-section-empty">
                Chargement de l’historique…
              </div>
            ) : historyJobs.length > 0 ? (
              <div className="personnel-v3-job-list">
                {historyJobs.slice(0, 25).map((job) => (
                  <article key={job.id}>
                    <div>
                      <strong>
                        {text(job.dtli, `Intervention ${job.job_number ?? job.id}`)}
                      </strong>
                      <span>{text(job.customer_name, 'Client non renseigné')}</span>
                    </div>

                    <small>
                      {statusLabel(job.status)}
                      {' · '}
                      {formatDateTime(job.updated_at ?? job.completed_at)}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <div className="personnel-v3-section-empty">
                Aucun historique disponible.
              </div>
            )}
          </section>
        ) : null}
      </div>

      <footer className="personnel-v3-inspector-footer">
        <span>
          {canEditGeneral
            ? 'Les modifications sont enregistrées dans BlueVector.'
            : 'Seul le statut terrain peut être modifié avec ce rôle.'}
        </span>

        <button
          type="button"
          className="personnel-v3-save"
          onClick={handleSave}
          disabled={!canSave || saving}
        >
          <SaveIcon />
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </footer>
    </aside>
  );
}

export default function PersonnelInspector({
  tech,
  selectedCount = 0,
  todayJobs = [],
  canEditGeneral = false,
  sectors = [],
  referenceNow = 0,
  gpsStaleAfterMinutes = null,
  onClose,
  onSave,
}) {
  if (!tech) {
    return (
      <EmptyInspector selectedCount={selectedCount} />
    );
  }

  return (
    <PersonnelInspectorContent
      tech={tech}
      todayJobs={todayJobs}
      canEditGeneral={canEditGeneral}
      sectors={sectors}
      referenceNow={referenceNow}
      gpsStaleAfterMinutes={gpsStaleAfterMinutes}
      onClose={onClose}
      onSave={onSave}
    />
  );
}
