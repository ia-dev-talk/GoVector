/**
 * ExportCenter — génération d'exports FTTH BlueVector.
 *
 * Le composant conserve le workflow historique en trois étapes, les profils,
 * les modèles et l'historique. Il s'aligne sur le contrat réel du backend :
 * Excel produit un .xlsx, ZIP est le seul format qui embarque les photos,
 * et les actions de génération/gestion nécessitent l'accès export avancé.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api } from '../../api/client';
import ExportColumnSelector from './ExportColumnSelector';
import ExportFilterPanel from './ExportFilterPanel';
import ExportTemplateManager from './ExportTemplateManager';
import ExportHistory from './ExportHistory';
import ExportResume from './ExportResume';

import './export-center.css';

const MAX_EXPORT_NAME_LENGTH = 100;

const FORMAT_EXTENSIONS = Object.freeze({
  excel: 'xlsx',
  csv: 'csv',
  pdf: 'pdf',
  zip: 'zip',
});

const TABS = Object.freeze([
  {
    id: 'export',
    label: 'Export',
    icon: '📤',
    restricted: false,
  },
  {
    id: 'templates',
    label: 'Modèles',
    icon: '📋',
    restricted: true,
  },
  {
    id: 'history',
    label: 'Historique',
    icon: '🕐',
    restricted: true,
  },
]);

const STEPS = Object.freeze([
  {
    id: 1,
    label: 'Colonnes & Filtres',
  },
  {
    id: 2,
    label: 'Format & Options',
  },
  {
    id: 3,
    label: 'Résumé & Confirmation',
  },
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

  const normalized = String(value).trim();
  return normalized || fallback;
}

function localDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function normalizeColumns(value) {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, definition]) =>
        text(key) &&
        isRecord(definition),
    ),
  );
}

function normalizeCategories(value) {
  if (!isRecord(value)) return {};

  const result = {};

  Object.entries(value).forEach(([key, category]) => {
    if (!text(key) || !isRecord(category)) return;

    result[key] = {
      ...category,
      columns: asRecords(category.columns).filter(
        (column) => text(column.key),
      ),
    };
  });

  return result;
}

function normalizeProfiles(value) {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, profile]) =>
        text(key) &&
        isRecord(profile),
    ),
  );
}

function normalizeFormats(value) {
  const seen = new Set();

  return asRecords(value).filter((format) => {
    const key = text(format.key);

    if (
      !FORMAT_EXTENSIONS[key] ||
      seen.has(key)
    ) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function normalizeTemplates(value) {
  const seen = new Set();

  return asRecords(value).filter((template) => {
    const id = Number(template.id);

    if (
      !Number.isInteger(id) ||
      id <= 0 ||
      seen.has(id)
    ) {
      return false;
    }

    seen.add(id);
    return true;
  });
}

function normalizeColumnSelection(
  selection,
  availableColumns,
) {
  if (!Array.isArray(selection)) return [];

  const available = new Set(
    Object.keys(availableColumns),
  );

  const seen = new Set();

  return selection
    .map((value) => text(value))
    .filter((key) => {
      if (
        !key ||
        !available.has(key) ||
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function withOptionColumn(
  selection,
  columnKey,
  enabled,
  availableColumns,
) {
  const normalized = normalizeColumnSelection(
    selection,
    availableColumns,
  );

  const exists = Object.prototype.hasOwnProperty.call(
    availableColumns,
    columnKey,
  );

  if (!exists) return normalized;

  if (enabled) {
    return normalized.includes(columnKey)
      ? normalized
      : [...normalized, columnKey];
  }

  return normalized.filter(
    (key) => key !== columnKey,
  );
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

function sanitizeBaseName(value, fallback = 'export_bluevector') {
  const normalized = text(value, fallback)
    .split('')
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join('')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[.\s]+$/g, '')
    .slice(0, MAX_EXPORT_NAME_LENGTH)
    .trim();

  return normalized || fallback;
}

function getHeader(headers, name) {
  if (!headers) return '';

  if (typeof headers.get === 'function') {
    return text(headers.get(name));
  }

  return text(
    headers[name] ??
      headers[name.toLowerCase()],
  );
}

function decodeFilename(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function filenameFromDisposition(disposition) {
  const header = text(disposition);

  if (!header) return '';

  const encodedMatch = header.match(
    /filename\*\s*=\s*UTF-8''([^;]+)/i,
  );

  if (encodedMatch) {
    return sanitizeBaseName(
      decodeFilename(
        encodedMatch[1].trim().replace(/^["']|["']$/g, ''),
      ),
    );
  }

  const regularMatch = header.match(
    /filename\s*=\s*(?:"([^"]+)"|([^;]+))/i,
  );

  if (!regularMatch) return '';

  return sanitizeBaseName(
    text(regularMatch[1] ?? regularMatch[2])
      .replace(/^["']|["']$/g, ''),
  );
}

function ensureExtension(filename, format) {
  const extension =
    FORMAT_EXTENSIONS[format] || 'bin';

  const normalized = sanitizeBaseName(filename);

  if (
    normalized
      .toLocaleLowerCase('fr')
      .endsWith(`.${extension}`)
  ) {
    return normalized;
  }

  return `${normalized}.${extension}`;
}

async function errorMessage(error, fallback) {
  const responseData = error?.response?.data;

  if (
    typeof Blob !== 'undefined' &&
    responseData instanceof Blob
  ) {
    try {
      const content = await responseData.text();

      if (content) {
        try {
          const parsed = JSON.parse(content);
          const detail = text(
            parsed?.detail ??
              parsed?.message,
          );

          if (detail) return detail;
        } catch {
          const plainText = text(content);
          if (plainText) return plainText;
        }
      }
    } catch {
      // Le message générique reste disponible.
    }
  }

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

function triggerDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 1000);
}

function CloseIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="m4 4 8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function ExportCenter({
  onClose,
  onGenerated,
}) {
  const reactId = useId();

  const titleId = `${reactId}-title`;
  const errorId = `${reactId}-error`;

  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousFocusRef = useRef(null);
  const requestSequenceRef = useRef(0);

  const [step, setStep] = useState(1);
  const [activeTab, setActiveTab] = useState('export');

  const [initialLoading, setInitialLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [columns, setColumns] = useState({});
  const [columnCategories, setColumnCategories] = useState({});
  const [formats, setFormats] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [templates, setTemplates] = useState([]);

  const [managementAccess, setManagementAccess] = useState('unknown');

  const [selectedColumns, setSelectedColumns] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState('excel');
  const [filters, setFilters] = useState({});
  const [includePhotos, setIncludePhotos] = useState(false);
  const [includeSignatures, setIncludeSignatures] = useState(true);
  const [exportName, setExportName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const [summary, setSummary] = useState(null);
  const [sample, setSample] = useState([]);

  const busy = initialLoading || Boolean(actionLoading);
  const canClose = !busy && typeof onClose === 'function';
  const canManage = managementAccess === 'allowed';

  const formatKeys = useMemo(
    () => new Set(formats.map((format) => text(format.key))),
    [formats],
  );

  const effectiveColumns = useMemo(() => {
    let result = normalizeColumnSelection(
      selectedColumns,
      columns,
    );

    result = withOptionColumn(
      result,
      'signature',
      includeSignatures,
      columns,
    );

    result = withOptionColumn(
      result,
      'photos',
      includePhotos,
      columns,
    );

    return result;
  }, [
    columns,
    includePhotos,
    includeSignatures,
    selectedColumns,
  ]);

  const effectiveFormat =
    formatKeys.has(selectedFormat)
      ? selectedFormat
      : formats[0]?.key || '';

  const exportPayload = useMemo(
    () => ({
      columns: effectiveColumns,
      filters: normalizeFilters(filters),
      export_format: effectiveFormat,
      include_photos:
        effectiveFormat === 'zip' || includePhotos,
      include_signatures: includeSignatures,
      template_id:
        Number.isInteger(Number(selectedTemplate?.id))
          ? Number(selectedTemplate.id)
          : null,
      export_name:
        sanitizeBaseName(
          exportName,
          `Export BlueVector ${localDateKey()}`,
        ),
    }),
    [
      effectiveColumns,
      effectiveFormat,
      exportName,
      filters,
      includePhotos,
      includeSignatures,
      selectedTemplate?.id,
    ],
  );

  const close = useCallback(() => {
    if (!canClose) return;
    onClose();
  }, [canClose, onClose]);

  const loadInitialData = useCallback(async () => {
    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;

    setInitialLoading(true);
    setError('');
    setNotice('');

    const requests = await Promise.allSettled([
      api.getExportColumns(),
      api.getExportFormats(),
      api.getExportProfiles(),
      api.getExportTemplates(),
    ]);

    if (requestId !== requestSequenceRef.current) return;

    const failures = [];

    const columnResult = requests[0];

    if (columnResult.status === 'fulfilled') {
      const nextColumns = normalizeColumns(
        columnResult.value?.data?.columns,
      );

      const nextCategories = normalizeCategories(
        columnResult.value?.data?.categories,
      );

      setColumns(nextColumns);
      setColumnCategories(nextCategories);

      let defaults = Object.entries(nextColumns)
        .filter(([, definition]) => definition.default === true)
        .map(([key]) => key);

      defaults = withOptionColumn(
        defaults,
        'signature',
        true,
        nextColumns,
      );

      setSelectedColumns(defaults);
    } else {
      failures.push(
        await errorMessage(
          columnResult.reason,
          'Colonnes indisponibles.',
        ),
      );
    }

    const formatResult = requests[1];

    if (formatResult.status === 'fulfilled') {
      const nextFormats = normalizeFormats(
        formatResult.value?.data?.formats,
      );

      setFormats(nextFormats);

      setSelectedFormat(
        nextFormats.some((format) => format.key === 'excel')
          ? 'excel'
          : nextFormats[0]?.key || '',
      );
    } else {
      failures.push(
        await errorMessage(
          formatResult.reason,
          'Formats indisponibles.',
        ),
      );
    }

    const profileResult = requests[2];

    if (profileResult.status === 'fulfilled') {
      setProfiles(
        normalizeProfiles(
          profileResult.value?.data?.profiles,
        ),
      );
    } else {
      failures.push(
        await errorMessage(
          profileResult.reason,
          'Profils indisponibles.',
        ),
      );
    }

    const templateResult = requests[3];

    if (templateResult.status === 'fulfilled') {
      setTemplates(
        normalizeTemplates(
          templateResult.value?.data?.templates,
        ),
      );

      setManagementAccess('allowed');
    } else if (templateResult.reason?.response?.status === 403) {
      setTemplates([]);
      setManagementAccess('restricted');

      setNotice(
        'La prévisualisation, la génération, les modèles et l’historique nécessitent l’accès export avancé configuré par le backend.',
      );
    } else {
      setTemplates([]);
      setManagementAccess('unavailable');

      failures.push(
        await errorMessage(
          templateResult.reason,
          'Gestion des exports avancés indisponible.',
        ),
      );
    }

    setError(failures.join(' '));
    setInitialLoading(false);
  }, []);

  useEffect(() => {
    loadInitialData();

    return () => {
      requestSequenceRef.current += 1;
    };
  }, [loadInitialData]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;

      window.requestAnimationFrame(() => {
        previousFocusRef.current?.focus?.();
      });
    };
  }, []);

  const handleDialogKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (
        event.key !== 'Tab' ||
        !dialogRef.current
      ) {
        return;
      }

      const focusable = Array.from(
        dialogRef.current.querySelectorAll(
          [
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            '[href]',
            '[tabindex]:not([tabindex="-1"])',
          ].join(','),
        ),
      );

      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (
        event.shiftKey &&
        document.activeElement === first
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    },
    [close],
  );

  const invalidatePreview = useCallback(() => {
    setSummary(null);
    setSample([]);
    setError('');
  }, []);

  const handleColumnsChange = useCallback(
    (nextColumns) => {
      setSelectedTemplate(null);
      setSelectedColumns(
        normalizeColumnSelection(
          nextColumns,
          columns,
        ),
      );
      invalidatePreview();
    },
    [columns, invalidatePreview],
  );

  const handleFiltersChange = useCallback(
    (nextFilters) => {
      setSelectedTemplate(null);
      setFilters(normalizeFilters(nextFilters));
      invalidatePreview();
    },
    [invalidatePreview],
  );

  const handleFormatChange = useCallback(
    (nextFormat) => {
      const normalized = text(nextFormat);

      if (!formatKeys.has(normalized)) return;

      setSelectedTemplate(null);
      setSelectedFormat(normalized);
      setIncludePhotos(normalized === 'zip');

      setSelectedColumns((current) =>
        withOptionColumn(
          current,
          'photos',
          normalized === 'zip',
          columns,
        ),
      );

      invalidatePreview();
    },
    [
      columns,
      formatKeys,
      invalidatePreview,
    ],
  );

  const handlePhotosChange = useCallback(
    (enabled) => {
      setSelectedTemplate(null);
      setIncludePhotos(enabled);

      if (enabled && formatKeys.has('zip')) {
        setSelectedFormat('zip');
      } else if (
        !enabled &&
        selectedFormat === 'zip' &&
        formatKeys.has('excel')
      ) {
        setSelectedFormat('excel');
      }

      setSelectedColumns((current) =>
        withOptionColumn(
          current,
          'photos',
          enabled,
          columns,
        ),
      );

      invalidatePreview();
    },
    [
      columns,
      formatKeys,
      invalidatePreview,
      selectedFormat,
    ],
  );

  const handleSignaturesChange = useCallback(
    (enabled) => {
      setSelectedTemplate(null);
      setIncludeSignatures(enabled);

      setSelectedColumns((current) =>
        withOptionColumn(
          current,
          'signature',
          enabled,
          columns,
        ),
      );

      invalidatePreview();
    },
    [columns, invalidatePreview],
  );

  const applyProfile = useCallback(
    (profileKey) => {
      const profile = profiles[profileKey];

      if (!isRecord(profile)) return;

      setSelectedTemplate(null);
      setSelectedColumns(
        normalizeColumnSelection(
          profile.columns,
          columns,
        ),
      );
      setFilters(normalizeFilters(profile.filters));
      setExportName(
        text(profile.name).slice(
          0,
          MAX_EXPORT_NAME_LENGTH,
        ),
      );
      setStep(1);
      setActiveTab('export');
      invalidatePreview();
    },
    [
      columns,
      invalidatePreview,
      profiles,
    ],
  );

  const applyTemplate = useCallback(
    (template) => {
      if (!isRecord(template)) return;

      const templateFormat = text(
        template.export_type,
        'excel',
      );

      const photos =
        template.include_photos === true;

      const nextFormat =
        photos && formatKeys.has('zip')
          ? 'zip'
          : formatKeys.has(templateFormat)
            ? templateFormat
            : formats[0]?.key || '';

      let nextColumns = normalizeColumnSelection(
        template.columns,
        columns,
      );

      nextColumns = withOptionColumn(
        nextColumns,
        'photos',
        photos,
        columns,
      );

      const signatures =
        template.include_signatures !== false;

      nextColumns = withOptionColumn(
        nextColumns,
        'signature',
        signatures,
        columns,
      );

      setSelectedTemplate(template);
      setSelectedColumns(nextColumns);
      setFilters(normalizeFilters(template.filters));
      setSelectedFormat(nextFormat);
      setIncludePhotos(photos);
      setIncludeSignatures(signatures);
      setExportName(
        text(template.name).slice(
          0,
          MAX_EXPORT_NAME_LENGTH,
        ),
      );
      setStep(1);
      setActiveTab('export');
      invalidatePreview();
    },
    [
      columns,
      formatKeys,
      formats,
      invalidatePreview,
    ],
  );

  const ensureReady = useCallback(() => {
    if (!canManage) {
      setError(
        managementAccess === 'restricted'
          ? 'Ce compte ne dispose pas de l’accès export avancé exigé par le backend.'
          : 'Le service d’export avancé est indisponible. Rechargez les métadonnées puis réessayez.',
      );

      return false;
    }

    if (!effectiveColumns.length) {
      setError('Sélectionnez au moins une colonne à exporter.');
      setStep(1);
      return false;
    }

    if (!effectiveFormat) {
      setError('Sélectionnez un format d’export disponible.');
      setStep(2);
      return false;
    }

    setError('');
    return true;
  }, [
    canManage,
    effectiveColumns.length,
    effectiveFormat,
    managementAccess,
  ]);

  const handlePreview = useCallback(async () => {
    if (!ensureReady() || actionLoading) return;

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;

    setActionLoading('preview');
    setError('');

    try {
      const response = await api.exportPreview(exportPayload);

      if (requestId !== requestSequenceRef.current) return;

      const data = response?.data;

      if (!isRecord(data) || !isRecord(data.summary)) {
        throw new Error('Réponse de prévisualisation invalide.');
      }

      setSummary(data.summary);
      setSample(asRecords(data.sample));
      setStep(3);
    } catch (requestError) {
      if (requestId !== requestSequenceRef.current) return;

      if (requestError?.response?.status === 403) {
        setManagementAccess('restricted');
      }

      setError(
        await errorMessage(
          requestError,
          'Erreur de prévisualisation.',
        ),
      );
    } finally {
      if (requestId === requestSequenceRef.current) {
        setActionLoading('');
      }
    }
  }, [
    actionLoading,
    ensureReady,
    exportPayload,
  ]);

  const handleGenerate = useCallback(async () => {
    if (!ensureReady() || actionLoading) return;

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;

    setActionLoading('generate');
    setError('');

    try {
      const response = await api.exportGenerate(exportPayload);

      if (requestId !== requestSequenceRef.current) return;

      const responseData = response?.data;

      const blob =
        typeof Blob !== 'undefined' &&
        responseData instanceof Blob
          ? responseData
          : new Blob(
              [responseData],
              {
                type:
                  getHeader(
                    response?.headers,
                    'content-type',
                  ) ||
                  'application/octet-stream',
              },
            );

      if (!blob.size) {
        throw new Error('Le fichier généré est vide.');
      }

      const serverFilename = filenameFromDisposition(
        getHeader(
          response?.headers,
          'content-disposition',
        ),
      );

      const fallbackName = ensureExtension(
        sanitizeBaseName(
          exportPayload.export_name,
          `Export BlueVector ${localDateKey()}`,
        ),
        effectiveFormat,
      );

      const filename = serverFilename
        ? ensureExtension(serverFilename, effectiveFormat)
        : fallbackName;

      triggerDownload(blob, filename);

      try {
        await Promise.resolve(
          onGenerated?.({
            filename,
            format: effectiveFormat,
            summary,
            templateId: exportPayload.template_id,
          }),
        );
      } catch {
        // Le téléchargement réussi ne doit pas être rejoué.
      }

      onClose?.();
    } catch (requestError) {
      if (requestId !== requestSequenceRef.current) return;

      if (requestError?.response?.status === 403) {
        setManagementAccess('restricted');
      }

      setError(
        await errorMessage(
          requestError,
          'Erreur lors de la génération.',
        ),
      );
    } finally {
      if (requestId === requestSequenceRef.current) {
        setActionLoading('');
      }
    }
  }, [
    actionLoading,
    effectiveFormat,
    ensureReady,
    exportPayload,
    onClose,
    onGenerated,
    summary,
  ]);

  const tabsUnavailableReason =
    managementAccess === 'restricted'
      ? 'Accès export avancé requis'
      : managementAccess === 'unavailable'
        ? 'Service indisponible'
        : '';

  return (
    <div
      className="export-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
    >
      <section
        ref={dialogRef}
        className="export-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        tabIndex="-1"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="export-header">
          <div className="export-header-left">
            <h2 id={titleId}>
              📦 Centre d’export FTTH
            </h2>
            <p>
              Exportez les interventions au format Excel, CSV, PDF ou ZIP.
            </p>
          </div>

          <div
            className="export-header-tabs"
            role="tablist"
            aria-label="Sections du centre d’export"
          >
            {TABS.map((tab) => {
              const restricted =
                tab.restricted &&
                !canManage;

              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className={`export-tab ${
                    activeTab === tab.id
                      ? 'active'
                      : ''
                  }`}
                  aria-selected={activeTab === tab.id}
                  disabled={restricted || busy}
                  title={
                    restricted
                      ? tabsUnavailableReason
                      : undefined
                  }
                  onClick={() => {
                    setActiveTab(tab.id);
                    setError('');
                  }}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  {' '}
                  {tab.label}
                </button>
              );
            })}
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            className="export-close"
            onClick={close}
            disabled={!canClose}
            aria-label="Fermer le centre d’export"
            title="Fermer"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="export-body">
          {initialLoading && (
            <div
              className="export-loading"
              role="status"
              aria-live="polite"
            >
              Chargement de la configuration d’export…
            </div>
          )}

          {!initialLoading && notice && (
            <div
              className="export-error"
              role="status"
              style={{
                color: 'var(--color-warning)',
                borderColor: 'var(--color-warning)',
                background: 'var(--color-warning-dim)',
              }}
            >
              {notice}
            </div>
          )}

          {!initialLoading && error && (
            <div
              id={errorId}
              className="export-error"
              role="alert"
            >
              {error}
            </div>
          )}

          {!initialLoading &&
            Object.keys(columns).length === 0 && (
              <div className="export-empty">
                <div className="empty-icon" aria-hidden="true">
                  ⚠️
                </div>
                <p>
                  La configuration des colonnes est indisponible.
                </p>
                <button
                  type="button"
                  className="export-btn export-btn-primary"
                  onClick={loadInitialData}
                  disabled={busy}
                >
                  Recharger
                </button>
              </div>
            )}

          {!initialLoading &&
            Object.keys(columns).length > 0 &&
            activeTab === 'export' && (
              <>
                <ol
                  className="export-steps"
                  aria-label="Étapes de génération"
                >
                  {STEPS.map((item, index) => (
                    <li
                      key={item.id}
                      className={`export-step ${
                        step >= item.id
                          ? 'active'
                          : ''
                      }`}
                      aria-current={
                        step === item.id
                          ? 'step'
                          : undefined
                      }
                      style={{
                        listStyle: 'none',
                      }}
                    >
                      <span className="step-num">
                        {item.id}
                      </span>
                      <span className="step-label">
                        {item.label}
                      </span>

                      {index < STEPS.length - 1 && (
                        <span
                          className="export-step-connector"
                          aria-hidden="true"
                        />
                      )}
                    </li>
                  ))}
                </ol>

                {step === 1 && (
                  <div className="export-step-content">
                    {Object.keys(profiles).length > 0 && (
                      <section className="export-profiles">
                        <h4>Profils prédéfinis</h4>

                        <div className="export-profile-badges">
                          {Object.entries(profiles).map(
                            ([key, profile]) => (
                              <button
                                key={key}
                                type="button"
                                className="export-profile-badge"
                                onClick={() => applyProfile(key)}
                                disabled={busy}
                              >
                                {text(profile.name, key)}
                              </button>
                            ),
                          )}
                        </div>
                      </section>
                    )}

                    {templates.length > 0 && (
                      <section className="export-templates-quick">
                        <h4>Vos modèles</h4>

                        <div className="export-template-badges">
                          {templates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              className="export-template-badge"
                              onClick={() => applyTemplate(template)}
                              disabled={busy}
                            >
                              {text(
                                template.name,
                                `Modèle #${template.id}`,
                              )}
                            </button>
                          ))}
                        </div>
                      </section>
                    )}

                    <ExportColumnSelector
                      categories={columnCategories}
                      selectedColumns={selectedColumns}
                      onChange={handleColumnsChange}
                    />

                    <ExportFilterPanel
                      filters={filters}
                      onChange={handleFiltersChange}
                    />

                    <div className="export-step-actions">
                      <button
                        type="button"
                        className="export-btn export-btn-cancel"
                        onClick={close}
                        disabled={!canClose}
                      >
                        Annuler
                      </button>

                      <button
                        type="button"
                        className="export-btn export-btn-next"
                        onClick={() => {
                          if (!effectiveColumns.length) {
                            setError(
                              'Sélectionnez au moins une colonne à exporter.',
                            );
                            return;
                          }

                          setError('');
                          setStep(2);
                        }}
                        disabled={
                          busy ||
                          effectiveColumns.length === 0
                        }
                      >
                        Suivant : Format →
                      </button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="export-step-content">
                    <h4>Format d’export</h4>

                    <div className="export-format-grid">
                      {formats.map((format) => (
                        <button
                          key={format.key}
                          type="button"
                          className={`export-format-card ${
                            effectiveFormat === format.key
                              ? 'selected'
                              : ''
                          }`}
                          aria-pressed={
                            effectiveFormat === format.key
                          }
                          onClick={() =>
                            handleFormatChange(format.key)
                          }
                          disabled={busy}
                          style={{
                            font: 'inherit',
                            textAlign: 'left',
                          }}
                        >
                          <span
                            className="format-icon"
                            aria-hidden="true"
                          >
                            {format.icon}
                          </span>

                          <span className="format-label">
                            {format.label}
                          </span>

                          <span className="format-desc">
                            {format.description}
                          </span>
                        </button>
                      ))}
                    </div>

                    {!formats.length && (
                      <div className="export-error" role="alert">
                        Aucun format d’export n’est disponible.
                      </div>
                    )}

                    <h4>Options</h4>

                    <div className="export-options">
                      <label className="export-option">
                        <input
                          type="checkbox"
                          checked={includePhotos}
                          onChange={(event) =>
                            handlePhotosChange(
                              event.target.checked,
                            )
                          }
                          disabled={
                            busy ||
                            !formatKeys.has('zip')
                          }
                        />

                        <span>
                          Inclure les fichiers photo
                        </span>

                        <small>
                          Sélectionne le format ZIP, seul format backend
                          qui embarque les photos.
                        </small>
                      </label>

                      <label className="export-option">
                        <input
                          type="checkbox"
                          checked={includeSignatures}
                          onChange={(event) =>
                            handleSignaturesChange(
                              event.target.checked,
                            )
                          }
                          disabled={
                            busy ||
                            !Object.prototype.hasOwnProperty.call(
                              columns,
                              'signature',
                            )
                          }
                        />

                        <span>
                          Inclure la colonne signature
                        </span>
                      </label>

                      <div className="export-option">
                        <label htmlFor={`${reactId}-export-name`}>
                          Nom de l’export
                        </label>

                        <input
                          id={`${reactId}-export-name`}
                          type="text"
                          className="export-input"
                          value={exportName}
                          maxLength={MAX_EXPORT_NAME_LENGTH}
                          onChange={(event) => {
                            setSelectedTemplate(null);
                            setExportName(
                              event.target.value.slice(
                                0,
                                MAX_EXPORT_NAME_LENGTH,
                              ),
                            );
                            invalidatePreview();
                          }}
                          placeholder={`Export BlueVector ${localDateKey()}`}
                          disabled={busy}
                        />
                      </div>
                    </div>

                    <div className="export-step-actions">
                      <button
                        type="button"
                        className="export-btn export-btn-cancel"
                        onClick={() => {
                          setError('');
                          setStep(1);
                        }}
                        disabled={busy}
                      >
                        ← Retour
                      </button>

                      <button
                        type="button"
                        className="export-btn export-btn-next"
                        onClick={handlePreview}
                        disabled={
                          busy ||
                          !canManage ||
                          !effectiveFormat ||
                          effectiveColumns.length === 0
                        }
                        title={
                          !canManage
                            ? tabsUnavailableReason
                            : undefined
                        }
                      >
                        {actionLoading === 'preview'
                          ? 'Prévisualisation…'
                          : 'Prévisualiser →'}
                      </button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="export-step-content">
                    <ExportResume
                      summary={summary}
                      sample={sample}
                      columns={effectiveColumns}
                      format={effectiveFormat}
                      filters={filters}
                      includePhotos={includePhotos}
                      includeSignatures={includeSignatures}
                      exportName={exportPayload.export_name}
                    />

                    <div className="export-step-actions">
                      <button
                        type="button"
                        className="export-btn export-btn-cancel"
                        onClick={() => {
                          setError('');
                          setStep(2);
                        }}
                        disabled={busy}
                      >
                        ← Modifier
                      </button>

                      <button
                        type="button"
                        className="export-btn export-btn-export"
                        onClick={handleGenerate}
                        disabled={
                          busy ||
                          !canManage ||
                          !summary ||
                          effectiveColumns.length === 0
                        }
                        title={
                          !canManage
                            ? tabsUnavailableReason
                            : undefined
                        }
                      >
                        {actionLoading === 'generate'
                          ? 'Génération…'
                          : '📥 Générer l’export'}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

          {!initialLoading &&
            canManage &&
            activeTab === 'templates' && (
              <ExportTemplateManager
                templates={templates}
                onTemplatesChange={(nextTemplates) =>
                  setTemplates(
                    normalizeTemplates(nextTemplates),
                  )
                }
                onApplyTemplate={applyTemplate}
              />
            )}

          {!initialLoading &&
            canManage &&
            activeTab === 'history' && (
              <ExportHistory />
            )}
        </div>
      </section>
    </div>
  );
}
