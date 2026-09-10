/**
 * ExportFilterPanel — filtres compatibles avec FieldOptExportService.
 *
 * Contrat backend pris en charge :
 * date_preset, start_date, end_date, operator, status, sector_id,
 * technician_id, orienteur_id, job_type et search.
 */

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../../api/client';
import {
  BACKEND_JOB_TYPE_IDS,
  getJobTypeLabel,
} from '../../lib/job-types';

const DATE_PRESETS = Object.freeze([
  { value: '', label: 'Toute période' },
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'yesterday', label: 'Hier' },
  { value: 'this_week', label: 'Cette semaine' },
  { value: 'this_month', label: 'Ce mois' },
  { value: 'last_month', label: 'Mois précédent' },
]);

const STATUS_OPTIONS = Object.freeze([
  { value: '', label: 'Tous les statuts' },
  { value: 'pending', label: 'En attente' },
  { value: 'assigned', label: 'Affectée' },
  { value: 'en_route', label: 'En route' },
  { value: 'on_site', label: 'Sur site' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'work_in_progress', label: 'Travail en cours' },
  { value: 'installation_done', label: 'Installation terminée' },
  { value: 'client_validation', label: 'Validation client' },
  {
    value: 'en_attente_validation',
    label: 'En attente de validation',
  },
  { value: 'completed', label: 'Terminée' },
  { value: 'on_hold', label: 'En pause métier' },
  { value: 'client_absent', label: 'Client absent' },
  { value: 'postponed', label: 'Reportée' },
  { value: 'suspended', label: 'Suspendue' },
  { value: 'failed', label: 'Échec' },
  { value: 'cancelled', label: 'Annulée' },
]);

const OPERATOR_SUGGESTIONS = Object.freeze([
  'ORANGE',
  'IAM',
  'INWI',
]);

const FILTER_KEYS = new Set([
  'date_preset',
  'start_date',
  'end_date',
  'operator',
  'status',
  'sector_id',
  'technician_id',
  'orienteur_id',
  'job_type',
  'search',
]);

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function asRecords(value) {
  return Array.isArray(value)
    ? value.filter(isRecord)
    : [];
}

function text(value, fallback = '') {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'boolean'
  ) {
    return fallback;
  }

  return String(value).trim() || fallback;
}

function positiveInteger(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

function dateValue(value) {
  const normalized = text(value);

  return /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? normalized
    : '';
}

function normalizeFilters(value) {
  if (!isRecord(value)) return {};

  const result = {};

  Object.entries(value).forEach(([key, rawValue]) => {
    if (!FILTER_KEYS.has(key)) {
      /*
       * Les modèles peuvent contenir de futurs filtres backend.
       * Ils sont préservés lors d'une modification ciblée.
       */
      if (
        rawValue !== undefined &&
        rawValue !== null &&
        rawValue !== ''
      ) {
        result[key] = rawValue;
      }
      return;
    }

    if (
      ['sector_id', 'technician_id', 'orienteur_id'].includes(key)
    ) {
      const id = positiveInteger(rawValue);
      if (id !== null) result[key] = id;
      return;
    }

    if (key === 'start_date' || key === 'end_date') {
      const date = dateValue(rawValue);
      if (date) result[key] = date;
      return;
    }

    const normalized = text(rawValue);
    if (normalized) result[key] = normalized;
  });

  return result;
}

function itemName(item, fallbackPrefix) {
  const id = positiveInteger(item?.id);

  return (
    text(
      item?.name ??
        item?.full_name ??
        item?.display_name ??
        item?.username,
    ) ||
    (id ? `${fallbackPrefix} #${id}` : fallbackPrefix)
  );
}

function normalizeOptions(source, fallbackPrefix) {
  const seen = new Set();

  return asRecords(source)
    .flatMap((item) => {
      const id = positiveInteger(item.id);

      if (id === null || seen.has(id)) return [];

      seen.add(id);

      return [{
        id,
        name: itemName(item, fallbackPrefix),
        isActive: item.is_active !== false,
      }];
    })
    .sort((first, second) =>
      first.name.localeCompare(second.name, 'fr', {
        sensitivity: 'base',
      }),
    );
}

function humanizeIdentifier(value) {
  return text(value)
    .replace(/[_-]+/g, ' ')
    .toLocaleLowerCase('fr')
    .replace(/^./, (character) =>
      character.toLocaleUpperCase('fr'),
    );
}

function apiError(error, fallback) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        isRecord(item)
          ? text(item.msg ?? item.message)
          : text(item),
      )
      .filter(Boolean);

    if (messages.length) return messages.join(' · ');
  }

  return (
    text(error?.response?.data?.message) ||
    text(error?.message) ||
    fallback
  );
}

function activeFilterCount(filters) {
  return Object.values(filters).filter(
    (value) =>
      value !== undefined &&
      value !== null &&
      value !== '',
  ).length;
}

const ExportFilterPanel = memo(function ExportFilterPanel({
  filters = {},
  onChange,
  disabled = false,
  title = 'Filtres',
}) {
  const reactId = useId();
  const requestSequenceRef = useRef(0);

  const [technicians, setTechnicians] = useState([]);
  const [orienteurs, setOrienteurs] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState('');

  const normalizedFilters = useMemo(
    () => normalizeFilters(filters),
    [filters],
  );

  const canChange =
    !disabled &&
    typeof onChange === 'function';

  const jobTypeOptions = useMemo(
    () =>
      BACKEND_JOB_TYPE_IDS.map((value) => ({
        value,
        label: getJobTypeLabel(
          value,
          humanizeIdentifier(value),
        ),
      })),
    [],
  );

  const loadOptions = useCallback(async () => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;

    setLoadingOptions(true);
    setOptionsError('');

    const results = await Promise.allSettled([
      api.getTechnicians({ limit: 500 }),
      api.getOrienteurs({ limit: 500 }),
      api.getSectors({ limit: 500 }),
    ]);

    if (requestId !== requestSequenceRef.current) return;

    const failures = [];

    const technicianResult = results[0];

    if (technicianResult.status === 'fulfilled') {
      if (Array.isArray(technicianResult.value?.data)) {
        setTechnicians(
          normalizeOptions(
            technicianResult.value.data,
            'Technicien',
          ),
        );
      } else {
        setTechnicians([]);
        failures.push('Techniciens : réponse invalide.');
      }
    } else {
      setTechnicians([]);
      failures.push(
        apiError(
          technicianResult.reason,
          'Techniciens indisponibles.',
        ),
      );
    }

    const orienteurResult = results[1];

    if (orienteurResult.status === 'fulfilled') {
      if (Array.isArray(orienteurResult.value?.data)) {
        setOrienteurs(
          normalizeOptions(
            orienteurResult.value.data,
            'Orienteur',
          ),
        );
      } else {
        setOrienteurs([]);
        failures.push('Orienteurs : réponse invalide.');
      }
    } else {
      setOrienteurs([]);
      failures.push(
        apiError(
          orienteurResult.reason,
          'Orienteurs indisponibles.',
        ),
      );
    }

    const sectorResult = results[2];

    if (sectorResult.status === 'fulfilled') {
      if (Array.isArray(sectorResult.value?.data)) {
        setSectors(
          normalizeOptions(
            sectorResult.value.data,
            'Secteur',
          ),
        );
      } else {
        setSectors([]);
        failures.push('Secteurs : réponse invalide.');
      }
    } else {
      setSectors([]);
      failures.push(
        apiError(
          sectorResult.reason,
          'Secteurs indisponibles.',
        ),
      );
    }

    setOptionsError(failures.join(' '));
    setLoadingOptions(false);
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      void loadOptions();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      requestSequenceRef.current += 1;
    };
  }, [loadOptions]);

  function emit(nextFilters) {
    if (!canChange) return;
    onChange(normalizeFilters(nextFilters));
  }

  function updateFilter(key, value, removeKeys = []) {
    const next = {
      ...normalizedFilters,
    };

    removeKeys.forEach((removeKey) => {
      delete next[removeKey];
    });

    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      delete next[key];
    } else {
      next[key] = value;
    }

    emit(next);
  }

  function updateIdFilter(key, value) {
    updateFilter(
      key,
      positiveInteger(value) ?? undefined,
    );
  }

  function updateDatePreset(value) {
    updateFilter(
      'date_preset',
      text(value) || undefined,
      value
        ? ['start_date', 'end_date']
        : [],
    );
  }

  function updateCustomDate(key, value) {
    updateFilter(
      key,
      dateValue(value) || undefined,
      value ? ['date_preset'] : [],
    );
  }

  const startDate = dateValue(normalizedFilters.start_date);
  const endDate = dateValue(normalizedFilters.end_date);
  const invalidDateRange =
    Boolean(startDate && endDate && startDate > endDate);

  const count = activeFilterCount(normalizedFilters);
  const normalizedTitle = text(title, 'Filtres');

  return (
    <section
      className="export-filter-panel"
      aria-label={normalizedTitle}
      aria-disabled={disabled || undefined}
    >
      <div className="export-filter-header">
        <h4>
          {normalizedTitle}
          {count > 0 && (
            <span
              style={{
                marginLeft: 8,
                color: 'var(--export-text-light)',
                fontSize: '0.78em',
                fontWeight: 500,
              }}
            >
              ({count})
            </span>
          )}
        </h4>

        <button
          type="button"
          className="export-btn-small"
          onClick={() => emit({})}
          disabled={!canChange || count === 0}
        >
          Réinitialiser
        </button>
      </div>

      {optionsError && (
        <div
          className="export-error"
          role="status"
          style={{
            marginBottom: 12,
            color: 'var(--color-warning)',
            borderColor: 'var(--color-warning)',
            background: 'var(--color-warning-dim)',
          }}
        >
          <span>{optionsError}</span>
          {' '}
          <button
            type="button"
            className="export-btn-small"
            onClick={loadOptions}
            disabled={loadingOptions}
          >
            Réessayer
          </button>
        </div>
      )}

      {invalidDateRange && (
        <div
          className="export-error"
          role="alert"
          style={{ marginBottom: 12 }}
        >
          La date de début doit être antérieure ou égale à la date de fin.
        </div>
      )}

      <div className="export-filter-grid">
        <div className="export-filter-item">
          <label htmlFor={`${reactId}-date-preset`}>
            Période
          </label>
          <select
            id={`${reactId}-date-preset`}
            value={text(normalizedFilters.date_preset)}
            onChange={(event) =>
              updateDatePreset(event.target.value)
            }
            disabled={!canChange}
          >
            {DATE_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div className="export-filter-item">
          <label htmlFor={`${reactId}-start-date`}>
            Date début
          </label>
          <input
            id={`${reactId}-start-date`}
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(event) =>
              updateCustomDate('start_date', event.target.value)
            }
            disabled={!canChange}
            aria-invalid={invalidDateRange || undefined}
          />
        </div>

        <div className="export-filter-item">
          <label htmlFor={`${reactId}-end-date`}>
            Date fin
          </label>
          <input
            id={`${reactId}-end-date`}
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) =>
              updateCustomDate('end_date', event.target.value)
            }
            disabled={!canChange}
            aria-invalid={invalidDateRange || undefined}
          />
        </div>

        <div className="export-filter-item">
          <label htmlFor={`${reactId}-operator`}>
            Opérateur
          </label>
          <input
            id={`${reactId}-operator`}
            type="text"
            className="export-input"
            list={`${reactId}-operator-options`}
            value={text(normalizedFilters.operator)}
            placeholder="Tous les opérateurs"
            autoComplete="off"
            onChange={(event) =>
              updateFilter(
                'operator',
                text(event.target.value).toLocaleUpperCase('fr') ||
                  undefined,
              )
            }
            disabled={!canChange}
          />
          <datalist id={`${reactId}-operator-options`}>
            {OPERATOR_SUGGESTIONS.map((operator) => (
              <option key={operator} value={operator} />
            ))}
          </datalist>
        </div>

        <div className="export-filter-item">
          <label htmlFor={`${reactId}-status`}>
            Statut
          </label>
          <select
            id={`${reactId}-status`}
            value={text(normalizedFilters.status)}
            onChange={(event) =>
              updateFilter('status', event.target.value || undefined)
            }
            disabled={!canChange}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        <div className="export-filter-item">
          <label htmlFor={`${reactId}-job-type`}>
            Type d’intervention
          </label>
          <select
            id={`${reactId}-job-type`}
            value={text(normalizedFilters.job_type)}
            onChange={(event) =>
              updateFilter('job_type', event.target.value || undefined)
            }
            disabled={!canChange}
          >
            <option value="">Tous les types</option>
            {jobTypeOptions.map((jobType) => (
              <option key={jobType.value} value={jobType.value}>
                {jobType.label}
              </option>
            ))}
          </select>
        </div>

        <div className="export-filter-item">
          <label htmlFor={`${reactId}-sector`}>
            Secteur
          </label>
          <select
            id={`${reactId}-sector`}
            value={positiveInteger(normalizedFilters.sector_id) ?? ''}
            onChange={(event) =>
              updateIdFilter('sector_id', event.target.value)
            }
            disabled={!canChange || loadingOptions}
          >
            <option value="">
              {loadingOptions ? 'Chargement…' : 'Tous les secteurs'}
            </option>
            {sectors.map((sector) => (
              <option key={sector.id} value={sector.id}>
                {sector.name}
                {!sector.isActive ? ' — inactif' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="export-filter-item">
          <label htmlFor={`${reactId}-technician`}>
            Technicien
          </label>
          <select
            id={`${reactId}-technician`}
            value={
              positiveInteger(normalizedFilters.technician_id) ?? ''
            }
            onChange={(event) =>
              updateIdFilter('technician_id', event.target.value)
            }
            disabled={!canChange || loadingOptions}
          >
            <option value="">
              {loadingOptions ? 'Chargement…' : 'Tous les techniciens'}
            </option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.name}
                {!technician.isActive ? ' — inactif' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="export-filter-item">
          <label htmlFor={`${reactId}-orienteur`}>
            Orienteur
          </label>
          <select
            id={`${reactId}-orienteur`}
            value={
              positiveInteger(normalizedFilters.orienteur_id) ?? ''
            }
            onChange={(event) =>
              updateIdFilter('orienteur_id', event.target.value)
            }
            disabled={!canChange || loadingOptions}
          >
            <option value="">
              {loadingOptions ? 'Chargement…' : 'Tous les orienteurs'}
            </option>
            {orienteurs.map((orienteur) => (
              <option key={orienteur.id} value={orienteur.id}>
                {orienteur.name}
                {!orienteur.isActive ? ' — inactif' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className="export-filter-item"
        style={{ marginTop: 12 }}
      >
        <label htmlFor={`${reactId}-search`}>
          Recherche
        </label>
        <input
          id={`${reactId}-search`}
          type="search"
          className="export-input"
          placeholder="Intervention, client, téléphone, adresse, technicien ou notes…"
          value={text(normalizedFilters.search)}
          autoComplete="off"
          onChange={(event) =>
            updateFilter('search', text(event.target.value) || undefined)
          }
          disabled={!canChange}
        />
      </div>
    </section>
  );
});

ExportFilterPanel.displayName = 'ExportFilterPanel';

export default ExportFilterPanel;
