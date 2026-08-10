/**
 * ExportHistory — journal d'audit des exports générés.
 *
 * L'API d'historique ne fournit ni fichier ni route de re-téléchargement.
 * Ce composant affiche donc uniquement les métadonnées réellement journalisées.
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
import { getJobTypeLabel } from '../../lib/job-types';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

const FORMAT_DETAILS = Object.freeze({
  excel: {
    label: 'Excel',
    icon: '📊',
    extension: 'xlsx',
  },
  csv: {
    label: 'CSV',
    icon: '📄',
    extension: 'csv',
  },
  pdf: {
    label: 'PDF',
    icon: '📕',
    extension: 'pdf',
  },
  zip: {
    label: 'ZIP',
    icon: '📦',
    extension: 'zip',
  },
});

const STATUS_DETAILS = Object.freeze({
  completed: {
    label: 'Terminé',
    symbol: '✓',
    className: 'status-ok',
  },
  failed: {
    label: 'Échec',
    symbol: '✗',
    className: 'status-ko',
  },
  processing: {
    label: 'En cours',
    symbol: '⟳',
    className: 'status-progress',
  },
  pending: {
    label: 'En attente',
    symbol: '…',
    className: 'status-progress',
  },
});

const FILTER_LABELS = Object.freeze({
  date_preset: 'Période',
  start_date: 'Date début',
  end_date: 'Date fin',
  operator: 'Opérateur',
  status: 'Statut',
  sector_id: 'Secteur',
  technician_id: 'Technicien',
  orienteur_id: 'Orienteur',
  job_type: 'Type',
  search: 'Recherche',
});

const DATE_PRESET_LABELS = Object.freeze({
  today: 'Aujourd’hui',
  yesterday: 'Hier',
  this_week: 'Cette semaine',
  this_month: 'Ce mois',
  last_month: 'Mois précédent',
});

const JOB_STATUS_LABELS = Object.freeze({
  pending: 'En attente',
  assigned: 'Affectée',
  en_route: 'En route',
  on_site: 'Sur site',
  in_progress: 'En cours',
  work_in_progress: 'Travail en cours',
  installation_done: 'Installation terminée',
  client_validation: 'Validation client',
  en_attente_validation: 'En attente de validation',
  completed: 'Terminée',
  on_hold: 'En pause métier',
  client_absent: 'Client absent',
  postponed: 'Reportée',
  suspended: 'Suspendue',
  failed: 'Échec',
  cancelled: 'Annulée',
});

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
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

function nonNegativeInteger(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0
    ? parsed
    : null;
}

function nonNegativeNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : null;
}

function normalizePageSize(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_PAGE_SIZE;
  }

  return Math.min(parsed, MAX_PAGE_SIZE);
}

function humanize(value) {
  const normalized = text(value)
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('fr');

  return normalized
    ? normalized.replace(/^./, (character) =>
        character.toLocaleUpperCase('fr'),
      )
    : '—';
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();

  return value
    .map((item) => text(item))
    .filter((item) => {
      if (!item || seen.has(item)) return false;

      seen.add(item);
      return true;
    });
}

function normalizeFilters(value) {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, filterValue]) =>
        text(key) &&
        filterValue !== undefined &&
        filterValue !== null &&
        filterValue !== '',
    ),
  );
}

function normalizeRecord(value) {
  if (!isRecord(value)) return null;

  const id = positiveInteger(value.id);

  if (id === null) return null;

  return {
    id,
    userId: positiveInteger(value.user_id),
    templateId: positiveInteger(value.template_id),
    exportName: text(value.export_name, `Export #${id}`),
    exportFormat: text(value.export_format).toLocaleLowerCase('fr'),
    jobCount: nonNegativeInteger(value.job_count),
    filters: normalizeFilters(value.filters_used),
    columns: normalizeStringArray(value.columns_used),
    hasPhotos: value.has_photos === true,
    hasSignatures: value.has_signatures === true,
    fileSizeBytes: nonNegativeInteger(value.file_size_bytes),
    status: text(value.status, 'processing').toLocaleLowerCase('fr'),
    errorMessage: text(value.error_message),
    durationSeconds: nonNegativeNumber(value.duration_seconds),
    createdAt: text(value.created_at),
  };
}

function normalizeRecords(value) {
  const seen = new Set();

  return asRecords(value).flatMap((item) => {
    const record = normalizeRecord(item);

    if (!record || seen.has(record.id)) return [];

    seen.add(record.id);
    return [record];
  });
}

function mergeRecords(current, incoming) {
  const byId = new Map(
    current.map((record) => [record.id, record]),
  );

  incoming.forEach((record) => {
    byId.set(record.id, record);
  });

  return [...byId.values()].sort((first, second) => {
    const firstTime = Date.parse(first.createdAt);
    const secondTime = Date.parse(second.createdAt);

    if (
      Number.isFinite(firstTime) &&
      Number.isFinite(secondTime)
    ) {
      return secondTime - firstTime;
    }

    return second.id - first.id;
  });
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

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function dateTimeAttribute(value) {
  if (!value) return '';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ''
    : date.toISOString();
}

function formatBytes(value) {
  const bytes = nonNegativeInteger(value);

  if (bytes === null) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 ** 2) {
    return `${new Intl.NumberFormat('fr-FR', {
      maximumFractionDigits: 1,
    }).format(bytes / 1024)} Ko`;
  }
  if (bytes < 1024 ** 3) {
    return `${new Intl.NumberFormat('fr-FR', {
      maximumFractionDigits: 1,
    }).format(bytes / 1024 ** 2)} Mo`;
  }

  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 2,
  }).format(bytes / 1024 ** 3)} Go`;
}

function formatDuration(value) {
  const seconds = nonNegativeNumber(value);

  if (seconds === null) return '—';
  if (seconds < 60) {
    return `${new Intl.NumberFormat('fr-FR', {
      maximumFractionDigits: 1,
    }).format(seconds)} s`;
  }

  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;

  return remainingSeconds
    ? `${minutes} min ${remainingSeconds} s`
    : `${minutes} min`;
}

function formatCount(value) {
  const count = nonNegativeInteger(value);

  return count === null
    ? '—'
    : new Intl.NumberFormat('fr-FR').format(count);
}

function formatDetails(format) {
  return (
    FORMAT_DETAILS[format] || {
      label: humanize(format),
      icon: '📁',
      extension: text(format),
    }
  );
}

function statusDetails(status) {
  return (
    STATUS_DETAILS[status] || {
      label: humanize(status),
      symbol: '•',
      className: 'status-progress',
    }
  );
}

function formatFilterValue(key, value) {
  if (key === 'date_preset') {
    return DATE_PRESET_LABELS[text(value)] || humanize(value);
  }

  if (key === 'status') {
    return JOB_STATUS_LABELS[text(value)] || humanize(value);
  }

  if (key === 'job_type') {
    return getJobTypeLabel(text(value), humanize(value));
  }

  if (
    key === 'sector_id' ||
    key === 'technician_id' ||
    key === 'orienteur_id'
  ) {
    const id = positiveInteger(value);
    return id === null ? text(value, '—') : `#${id}`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => text(item)).filter(Boolean).join(', ') || '—';
  }

  if (typeof value === 'boolean') {
    return value ? 'Oui' : 'Non';
  }

  if (isRecord(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return '—';
    }
  }

  return text(value, '—');
}

function filterEntries(filters) {
  return Object.entries(filters)
    .map(([key, value]) => ({
      key,
      label: FILTER_LABELS[key] || humanize(key),
      value: formatFilterValue(key, value),
    }))
    .sort((first, second) =>
      first.label.localeCompare(second.label, 'fr', {
        sensitivity: 'base',
      }),
    );
}

function HistoryDetails({ record, detailsId }) {
  const filters = filterEntries(record.filters);
  const format = formatDetails(record.exportFormat);

  return (
    <div
      id={detailsId}
      role="region"
      aria-label={`Détails de ${record.exportName}`}
      style={{
        padding: '14px 16px 16px',
        borderBottom: '1px solid var(--export-border)',
        background: 'var(--surface-subtle, rgba(0, 0, 0, 0.025))',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          gap: 10,
          marginBottom: filters.length || record.columns.length ? 14 : 0,
        }}
      >
        <div>
          <strong>Format :</strong>{' '}
          {format.label}
          {format.extension ? ` (.${format.extension})` : ''}
        </div>

        <div>
          <strong>Photos :</strong>{' '}
          {record.hasPhotos ? 'Oui' : 'Non'}
        </div>

        <div>
          <strong>Signatures :</strong>{' '}
          {record.hasSignatures ? 'Oui' : 'Non'}
        </div>

        <div>
          <strong>Modèle :</strong>{' '}
          {record.templateId ? `#${record.templateId}` : 'Aucun'}
        </div>

        {record.userId && (
          <div>
            <strong>Utilisateur :</strong> #{record.userId}
          </div>
        )}
      </div>

      {record.columns.length > 0 && (
        <div style={{ marginBottom: filters.length ? 14 : 0 }}>
          <strong>
            Colonnes ({record.columns.length}) :
          </strong>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 7,
            }}
          >
            {record.columns.map((column) => (
              <span
                key={column}
                className="meta-columns"
                title={column}
              >
                {humanize(column)}
              </span>
            ))}
          </div>
        </div>
      )}

      {filters.length > 0 && (
        <div>
          <strong>
            Filtres ({filters.length}) :
          </strong>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: 8,
              marginTop: 7,
            }}
          >
            {filters.map((filter) => (
              <span key={filter.key}>
                <strong>{filter.label} :</strong>{' '}
                {filter.value}
              </span>
            ))}
          </div>
        </div>
      )}

      {record.errorMessage && (
        <div
          className="export-error"
          role="alert"
          style={{ margin: '14px 0 0' }}
        >
          {record.errorMessage}
        </div>
      )}
    </div>
  );
}

const ExportHistory = memo(function ExportHistory({
  pageSize = DEFAULT_PAGE_SIZE,
}) {
  const reactId = useId();
  const requestSequenceRef = useRef(0);

  const limit = normalizePageSize(pageSize);

  const [records, setRecords] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const busy = initialLoading || Boolean(action);

  const loadHistory = useCallback(
    async ({ append = false } = {}) => {
      const requestId = requestSequenceRef.current + 1;
      requestSequenceRef.current = requestId;

      setAction(append ? 'more' : 'refresh');
      setError('');

      const offset = append ? records.length : 0;

      try {
        const response = await api.getExportHistory({
          limit,
          offset,
        });

        if (requestId !== requestSequenceRef.current) return;

        const responseRecords = response?.data?.records;

        if (!Array.isArray(responseRecords)) {
          throw new Error('Réponse d’historique invalide.');
        }

        const nextRecords = normalizeRecords(responseRecords);

        setRecords((current) =>
          append
            ? mergeRecords(current, nextRecords)
            : nextRecords,
        );

        /*
         * L'endpoint renvoie seulement le nombre d'éléments de la page,
         * pas le total global. Une page pleine indique donc qu'une page
         * suivante peut exister.
         */
        setHasMore(responseRecords.length === limit);
        setLastUpdatedAt(new Date());

        if (!append) setExpandedId(null);
      } catch (requestError) {
        if (requestId !== requestSequenceRef.current) return;

        setError(
          apiError(
            requestError,
            'Impossible de charger l’historique des exports.',
          ),
        );
      } finally {
        if (requestId === requestSequenceRef.current) {
          setInitialLoading(false);
          setAction('');
        }
      }
    },
    [limit, records.length],
  );

  useEffect(() => {
    loadHistory();

    return () => {
      requestSequenceRef.current += 1;
    };
  }, [loadHistory]);

  /*
   * loadHistory dépend de records.length pour l'offset "Charger plus".
   * Le chargement initial ne doit pas être rejoué à chaque ajout.
   */
  const initialLoadRef = useRef(false);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
  }, []);

  const totalJobs = useMemo(
    () =>
      records.reduce((sum, record) => {
        return sum + (record.jobCount ?? 0);
      }, 0),
    [records],
  );

  if (initialLoading && records.length === 0) {
    return (
      <div
        className="export-loading"
        role="status"
        aria-live="polite"
      >
        Chargement de l’historique…
      </div>
    );
  }

  return (
    <section
      className="export-history-panel"
      aria-label="Historique des exports"
      aria-busy={busy || undefined}
    >
      <div className="export-history-header">
        <div>
          <h3>Historique des exports</h3>

          {records.length > 0 && (
            <p
              style={{
                margin: '4px 0 0',
                color: 'var(--export-text-secondary)',
                fontSize: '0.82em',
              }}
            >
              {records.length} export
              {records.length > 1 ? 's' : ''} chargé
              {records.length > 1 ? 's' : ''}
              {' · '}
              {formatCount(totalJobs)} intervention
              {totalJobs > 1 ? 's' : ''}
              {lastUpdatedAt
                ? ` · MAJ ${lastUpdatedAt.toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : ''}
            </p>
          )}
        </div>

        <button
          type="button"
          className="export-btn export-btn-small"
          onClick={() => loadHistory({ append: false })}
          disabled={busy}
          title="Rafraîchir l’historique"
          aria-label={
            action === 'refresh'
              ? 'Actualisation de l’historique en cours'
              : 'Rafraîchir l’historique'
          }
        >
          {action === 'refresh' ? 'Actualisation…' : '↻ Rafraîchir'}
        </button>
      </div>

      {error && (
        <div className="export-error" role="alert">
          <span>{error}</span>{' '}
          <button
            type="button"
            className="export-btn-small"
            onClick={() => loadHistory({ append: false })}
            disabled={busy}
          >
            Réessayer
          </button>
        </div>
      )}

      {records.length === 0 ? (
        <div className="export-empty">
          <div className="empty-icon" aria-hidden="true">
            🕐
          </div>

          <p>Aucun export journalisé.</p>

          <p className="empty-hint">
            Les exports générés avec succès apparaîtront ici.
          </p>
        </div>
      ) : (
        <>
          <div
            className="export-history-list"
            role="table"
            aria-label="Journal des exports"
          >
            <div
              className="export-history-table-header"
              role="row"
            >
              <span className="h-col-date" role="columnheader">
                Date
              </span>
              <span className="h-col-name" role="columnheader">
                Nom
              </span>
              <span className="h-col-format" role="columnheader">
                Format
              </span>
              <span className="h-col-count" role="columnheader">
                Interventions
              </span>
              <span className="h-col-size" role="columnheader">
                Taille
              </span>
              <span className="h-col-duration" role="columnheader">
                Durée
              </span>
              <span className="h-col-status" role="columnheader">
                Statut
              </span>
            </div>

            {records.map((record) => {
              const format = formatDetails(record.exportFormat);
              const status = statusDetails(record.status);
              const expanded = expandedId === record.id;
              const detailsId = `${reactId}-history-${record.id}`;
              const isoDate = dateTimeAttribute(record.createdAt);

              return (
                <div key={record.id}>
                  <div
                    className="export-history-row"
                    role="row"
                  >
                    <time
                      className="h-col-date"
                      role="cell"
                      dateTime={isoDate || undefined}
                      title={
                        isoDate
                          ? new Date(isoDate).toLocaleString('fr-FR')
                          : undefined
                      }
                    >
                      {formatDate(record.createdAt)}
                    </time>

                    <span className="h-col-name" role="cell">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(expanded ? null : record.id)
                        }
                        aria-expanded={expanded}
                        aria-controls={detailsId}
                        title={`${record.exportName} — afficher les détails`}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: 0,
                          overflow: 'hidden',
                          border: 0,
                          background: 'transparent',
                          color: 'inherit',
                          font: 'inherit',
                          textAlign: 'left',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                        }}
                      >
                        {record.exportName}
                      </button>
                    </span>

                    <span
                      className="h-col-format"
                      role="cell"
                      title={`Format ${format.label}`}
                    >
                      <span aria-hidden="true">{format.icon}</span>{' '}
                      {format.label}
                    </span>

                    <span className="h-col-count" role="cell">
                      {formatCount(record.jobCount)}
                    </span>

                    <span className="h-col-size" role="cell">
                      {formatBytes(record.fileSizeBytes)}
                    </span>

                    <span className="h-col-duration" role="cell">
                      {formatDuration(record.durationSeconds)}
                    </span>

                    <span className="h-col-status" role="cell">
                      <span
                        className={status.className}
                        title={
                          record.errorMessage
                            ? `${status.label} : ${record.errorMessage}`
                            : status.label
                        }
                      >
                        <span aria-hidden="true">{status.symbol}</span>{' '}
                        {status.label}
                      </span>
                    </span>
                  </div>

                  {expanded && (
                    <HistoryDetails
                      record={record}
                      detailsId={detailsId}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginTop: 16,
              }}
            >
              <button
                type="button"
                className="export-btn export-btn-small"
                onClick={() => loadHistory({ append: true })}
                disabled={busy}
              >
                {action === 'more'
                  ? 'Chargement…'
                  : `Charger ${limit} exports supplémentaires`}
              </button>
            </div>
          )}

          <p
            className="empty-hint"
            style={{
              margin: '14px 0 0',
              textAlign: 'center',
            }}
          >
            Cet historique est une trace d’audit. Aucun fichier n’est conservé
            ou re-téléchargeable par l’API actuelle.
          </p>
        </>
      )}
    </section>
  );
});

ExportHistory.displayName = 'ExportHistory';

export default ExportHistory;
