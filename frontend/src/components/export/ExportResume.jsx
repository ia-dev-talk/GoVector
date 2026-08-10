/**
 * ExportResume — résumé fidèle de la prévisualisation d'export.
 *
 * Le backend fournit six compteurs et jusqu'à dix lignes d'échantillon.
 * Le composant conserve l'API historique utilisée par ExportCenter.
 */

import { memo, useMemo } from 'react';
import { getJobTypeLabel } from '../../lib/job-types';

const MAX_PREVIEW_ROWS = 5;
const MAX_PREVIEW_COLUMNS = 6;

const FORMAT_LABELS = Object.freeze({
  excel: 'Excel (.xlsx)',
  csv: 'CSV (.csv)',
  pdf: 'PDF (.pdf)',
  zip: 'ZIP (Excel + photos)',
});

const DATE_PRESET_LABELS = Object.freeze({
  today: 'Aujourd’hui',
  yesterday: 'Hier',
  this_week: 'Cette semaine',
  this_month: 'Ce mois',
  last_month: 'Mois précédent',
});

const STATUS_LABELS = Object.freeze({
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

const FILTER_ORDER = Object.freeze([
  'date_preset',
  'start_date',
  'end_date',
  'operator',
  'status',
  'job_type',
  'sector_id',
  'technician_id',
  'orienteur_id',
  'search',
]);

const FILTER_LABELS = Object.freeze({
  date_preset: 'Période',
  start_date: 'Date début',
  end_date: 'Date fin',
  operator: 'Opérateur',
  status: 'Statut',
  job_type: 'Type',
  sector_id: 'Secteur',
  technician_id: 'Technicien',
  orienteur_id: 'Orienteur',
  search: 'Recherche',
});

const SUMMARY_CARDS = Object.freeze([
  {
    key: 'total',
    label: 'Total',
    className: '',
  },
  {
    key: 'completed',
    label: 'Terminées',
    className: 'completed',
  },
  {
    key: 'in_progress',
    label: 'En cours / en route',
    className: 'progress',
  },
  {
    key: 'postponed',
    label: 'Reportées',
    className: 'warning',
  },
  {
    key: 'failed',
    label: 'Échecs',
    className: 'danger',
  },
  {
    key: 'pending',
    label: 'En attente',
    className: 'pending',
  },
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function records(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
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

function formatCount(value) {
  const count = nonNegativeInteger(value);

  return count === null
    ? '—'
    : new Intl.NumberFormat('fr-FR').format(count);
}

function pluralizeIntervention(count) {
  return count === 1 ? 'intervention' : 'interventions';
}

function humanizeIdentifier(value) {
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

function formatIsoDate(value) {
  const normalized = text(value);
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) return normalized || '—';

  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatFilterValue(key, value) {
  if (key === 'date_preset') {
    return DATE_PRESET_LABELS[text(value)] || humanizeIdentifier(value);
  }

  if (key === 'start_date' || key === 'end_date') {
    return formatIsoDate(value);
  }

  if (key === 'status') {
    return STATUS_LABELS[text(value)] || humanizeIdentifier(value);
  }

  if (key === 'job_type') {
    return getJobTypeLabel(
      text(value),
      humanizeIdentifier(value),
    );
  }

  if (key === 'sector_id') {
    const id = nonNegativeInteger(value);
    return id === null ? text(value, '—') : `#${id}`;
  }

  if (key === 'technician_id' || key === 'orienteur_id') {
    const id = nonNegativeInteger(value);
    return id === null ? text(value, '—') : `#${id}`;
  }

  if (key === 'search') {
    const query = text(value);
    return query ? `« ${query} »` : '—';
  }

  if (Array.isArray(value)) {
    return value.map((item) => text(item)).filter(Boolean).join(', ') || '—';
  }

  if (isRecord(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return '—';
    }
  }

  if (typeof value === 'boolean') {
    return value ? 'Oui' : 'Non';
  }

  return text(value, '—');
}

function normalizeFilters(filters) {
  if (!isRecord(filters)) return [];

  const entries = Object.entries(filters).filter(
    ([key, value]) =>
      text(key) &&
      value !== undefined &&
      value !== null &&
      value !== '',
  );

  const rank = new Map(
    FILTER_ORDER.map((key, index) => [key, index]),
  );

  return entries
    .sort(([firstKey], [secondKey]) => {
      const firstRank = rank.get(firstKey) ?? FILTER_ORDER.length;
      const secondRank = rank.get(secondKey) ?? FILTER_ORDER.length;

      return (
        firstRank - secondRank ||
        firstKey.localeCompare(secondKey, 'fr')
      );
    })
    .map(([key, value]) => ({
      key,
      label: FILTER_LABELS[key] || humanizeIdentifier(key),
      value: formatFilterValue(key, value),
    }));
}

function normalizeColumns(columns) {
  if (!Array.isArray(columns)) return [];

  const seen = new Set();

  return columns
    .map((column) => text(column))
    .filter((column) => {
      if (!column || seen.has(column)) return false;

      seen.add(column);
      return true;
    });
}

function formatCellValue(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '—';
  }

  if (typeof value === 'boolean') {
    return value ? 'Oui' : 'Non';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? new Intl.NumberFormat('fr-FR', {
          maximumFractionDigits: 3,
        }).format(value)
      : '—';
  }

  if (Array.isArray(value)) {
    return value.map(formatCellValue).join(', ') || '—';
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

function buildPreview(sample) {
  const rows = records(sample).slice(0, MAX_PREVIEW_ROWS);
  const headers = [];
  const seenHeaders = new Set();

  rows.forEach((row) => {
    Object.keys(row).forEach((header) => {
      const normalized = text(header);

      if (
        normalized &&
        !seenHeaders.has(normalized) &&
        headers.length < MAX_PREVIEW_COLUMNS
      ) {
        seenHeaders.add(normalized);
        headers.push(normalized);
      }
    });
  });

  const keyOccurrences = new Map();

  const normalizedRows = rows.map((row) => {
    const fingerprint = headers
      .map((header) => formatCellValue(row[header]))
      .join('|');

    const occurrence = keyOccurrences.get(fingerprint) || 0;
    keyOccurrences.set(fingerprint, occurrence + 1);

    return {
      key:
        occurrence === 0
          ? fingerprint || 'preview-row'
          : `${fingerprint || 'preview-row'}::${occurrence}`,
      row,
    };
  });

  return {
    headers,
    rows: normalizedRows,
    sourceCount: records(sample).length,
  };
}

const ExportResume = memo(function ExportResume({
  summary,
  sample = [],
  columns = [],
  format,
  filters = {},
  includePhotos = false,
  includeSignatures = false,
  exportName,
}) {
  const validSummary = isRecord(summary) ? summary : null;

  const normalizedColumns = useMemo(
    () => normalizeColumns(columns),
    [columns],
  );

  const activeFilters = useMemo(
    () => normalizeFilters(filters),
    [filters],
  );

  const preview = useMemo(
    () => buildPreview(sample),
    [sample],
  );

  if (!validSummary) {
    return (
      <div
        className="export-resume-empty"
        role="status"
      >
        <div className="empty-icon" aria-hidden="true">
          📊
        </div>

        <p>Prévisualisation indisponible.</p>

        <p className="empty-hint">
          Revenez à l’étape précédente puis relancez la prévisualisation.
        </p>
      </div>
    );
  }

  const total = nonNegativeInteger(validSummary.total);
  const normalizedFormat = text(format);
  const formatLabel =
    FORMAT_LABELS[normalizedFormat] ||
    humanizeIdentifier(normalizedFormat);

  const photosIncluded =
    normalizedFormat === 'zip' ||
    includePhotos === true;

  const normalizedName = text(exportName);
  const noMatchingJobs = total === 0;

  const confirmationText =
    total === null
      ? 'Le nombre d’interventions à exporter est indisponible.'
      : noMatchingJobs
        ? 'Aucune intervention ne correspond aux filtres. Le fichier contiendra uniquement ses en-têtes.'
        : `L’export contiendra ${formatCount(total)} ${pluralizeIntervention(
            total,
          )}.`;

  return (
    <section
      className="export-resume"
      aria-label="Résumé de l’export"
    >
      <h3>Résumé de l’export</h3>

      {normalizedName && (
        <div className="export-resume-name">
          <strong>Nom :</strong>{' '}
          <span title={normalizedName}>{normalizedName}</span>
        </div>
      )}

      <div
        className="export-resume-stats"
        aria-label="Répartition des interventions"
      >
        {SUMMARY_CARDS.map((card) => {
          const value = validSummary[card.key];
          const displayedValue = formatCount(value);

          return (
            <div
              key={card.key}
              className={[
                'resume-stat-card',
                card.className,
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`${card.label} : ${displayedValue}`}
            >
              <div className="resume-stat-value">
                {displayedValue}
              </div>

              <div className="resume-stat-label">
                {card.label}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="export-resume-info"
        aria-label="Configuration de l’export"
      >
        <div className="resume-info-item">
          <strong>Format :</strong> {formatLabel}
        </div>

        <div className="resume-info-item">
          <strong>Colonnes :</strong>{' '}
          {new Intl.NumberFormat('fr-FR').format(
            normalizedColumns.length,
          )}
        </div>

        <div className="resume-info-item">
          <strong>Photos :</strong>{' '}
          {photosIncluded ? 'Incluses' : 'Non incluses'}
        </div>

        <div className="resume-info-item">
          <strong>Signatures :</strong>{' '}
          {includeSignatures ? 'Incluses' : 'Non incluses'}
        </div>
      </div>

      {activeFilters.length > 0 && (
        <section aria-label="Filtres appliqués">
          <h4
            style={{
              margin: '0 0 10px',
            }}
          >
            Filtres appliqués ({activeFilters.length})
          </h4>

          <div className="export-resume-info">
            {activeFilters.map((filter) => (
              <div
                key={filter.key}
                className="resume-info-item"
                title={`${filter.label} : ${filter.value}`}
              >
                <strong>{filter.label} :</strong>{' '}
                {filter.value}
              </div>
            ))}
          </div>
        </section>
      )}

      {preview.rows.length > 0 && preview.headers.length > 0 ? (
        <section className="export-resume-sample">
          <h4>
            Aperçu ({preview.rows.length} ligne
            {preview.rows.length > 1 ? 's' : ''}
            {preview.sourceCount > preview.rows.length
              ? ` sur ${preview.sourceCount}`
              : ''}
            )
          </h4>

          <div className="export-resume-table-wrapper">
            <table className="export-resume-table">
              <caption
                style={{
                  position: 'absolute',
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: 'hidden',
                  clip: 'rect(0, 0, 0, 0)',
                  whiteSpace: 'nowrap',
                  border: 0,
                }}
              >
                Échantillon des premières interventions correspondant aux
                filtres
              </caption>

              <thead>
                <tr>
                  {preview.headers.map((header) => (
                    <th key={header} scope="col">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {preview.rows.map(({ key, row }) => (
                  <tr key={key}>
                    {preview.headers.map((header) => {
                      const value = formatCellValue(row[header]);

                      return (
                        <td
                          key={header}
                          title={value}
                          style={{
                            maxWidth: 260,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {preview.headers.length < normalizedColumns.length && (
            <p
              className="empty-hint"
              style={{ marginTop: 8 }}
            >
              L’aperçu affiche au maximum {MAX_PREVIEW_COLUMNS} colonnes. Le
              fichier final contiendra les {normalizedColumns.length} colonnes
              sélectionnées.
            </p>
          )}
        </section>
      ) : (
        <div
          className="export-resume-empty"
          role="status"
          style={{ padding: '20px 12px' }}
        >
          <p>
            {noMatchingJobs
              ? 'Aucune ligne ne correspond aux filtres.'
              : 'Aucun échantillon n’a été renvoyé.'}
          </p>
        </div>
      )}

      <div
        className="export-resume-confirm"
        role="status"
      >
        <p>{confirmationText}</p>
      </div>
    </section>
  );
});

ExportResume.displayName = 'ExportResume';

export default ExportResume;
