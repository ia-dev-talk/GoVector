/**
 * ExportTemplateManager — gestion complète des modèles d'export.
 *
 * Les modèles sont construits avec les mêmes colonnes, filtres et options
 * que le workflow principal. Les modèles système partagés restent
 * applicables, mais ne sont pas modifiables ou supprimables ici.
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
import ExportColumnSelector from './ExportColumnSelector';
import ExportFilterPanel from './ExportFilterPanel';

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 255;

const TEMPLATE_FORMATS = new Set([
  'excel',
  'csv',
  'pdf',
]);

const EMPTY_FORM = Object.freeze({
  name: '',
  description: '',
  export_type: 'excel',
  columns: [],
  filters: {},
  include_photos: false,
  include_signatures: true,
  is_default: false,
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
    if (
      !text(key) ||
      !isRecord(category)
    ) {
      return;
    }

    result[key] = {
      ...category,
      columns: asRecords(
        category.columns,
      ).filter((column) =>
        text(column.key),
      ),
    };
  });

  return result;
}

function normalizeFormats(value) {
  const seen = new Set();

  return asRecords(value)
    .filter((format) => {
      const key = text(format.key);

      if (
        !TEMPLATE_FORMATS.has(key) ||
        seen.has(key)
      ) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .map((format) => ({
      key: text(format.key),
      label:
        text(format.label) ||
        text(format.key).toLocaleUpperCase('fr'),
      description: text(format.description),
      icon: text(format.icon),
    }));
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();

  return value
    .map((item) => text(item))
    .filter((item) => {
      if (!item || seen.has(item)) {
        return false;
      }

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

function normalizeTemplate(value) {
  if (!isRecord(value)) return null;

  const id = positiveInteger(value.id);

  if (id === null) return null;

  const exportType =
    TEMPLATE_FORMATS.has(
      text(value.export_type),
    )
      ? text(value.export_type)
      : 'excel';

  return {
    ...value,
    id,
    name:
      text(value.name) ||
      `Modèle #${id}`,
    description:
      text(value.description),
    export_type: exportType,
    columns: uniqueStrings(value.columns),
    filters: normalizeFilters(value.filters),
    include_photos:
      value.include_photos === true,
    include_signatures:
      value.include_signatures !== false,
    is_default:
      value.is_default === true,
    created_by:
      positiveInteger(value.created_by),
    created_at:
      text(value.created_at),
  };
}

function normalizeTemplates(value) {
  const seen = new Set();

  return asRecords(value)
    .flatMap((template) => {
      const normalized =
        normalizeTemplate(template);

      if (
        !normalized ||
        seen.has(normalized.id)
      ) {
        return [];
      }

      seen.add(normalized.id);
      return [normalized];
    })
    .sort((first, second) => {
      return (
        Number(second.is_default) -
          Number(first.is_default) ||
        first.name.localeCompare(
          second.name,
          'fr',
          {
            sensitivity: 'base',
          },
        )
      );
    });
}

function defaultColumns(columns) {
  return Object.entries(columns)
    .filter(([, definition]) =>
      definition.default === true,
    )
    .map(([key]) => key);
}

function filterAvailableColumns(
  selection,
  columns,
) {
  const available = new Set(
    Object.keys(columns),
  );

  return uniqueStrings(selection).filter(
    (key) => available.has(key),
  );
}

function withManagedColumn(
  selection,
  key,
  enabled,
  columns,
) {
  const normalized =
    filterAvailableColumns(
      selection,
      columns,
    );

  if (
    !Object.prototype.hasOwnProperty.call(
      columns,
      key,
    )
  ) {
    return normalized;
  }

  if (enabled) {
    return normalized.includes(key)
      ? normalized
      : [...normalized, key];
  }

  return normalized.filter(
    (columnKey) =>
      columnKey !== key,
  );
}

function createInitialForm(columns) {
  let selection =
    defaultColumns(columns);

  selection = withManagedColumn(
    selection,
    'signature',
    true,
    columns,
  );

  selection = withManagedColumn(
    selection,
    'photos',
    false,
    columns,
  );

  return {
    ...EMPTY_FORM,
    columns: selection,
  };
}

function templateToForm(
  template,
  columns,
) {
  let selection =
    filterAvailableColumns(
      template.columns,
      columns,
    );

  selection = withManagedColumn(
    selection,
    'signature',
    template.include_signatures,
    columns,
  );

  selection = withManagedColumn(
    selection,
    'photos',
    template.include_photos,
    columns,
  );

  return {
    name: text(template.name).slice(
      0,
      MAX_NAME_LENGTH,
    ),
    description:
      text(template.description).slice(
        0,
        MAX_DESCRIPTION_LENGTH,
      ),
    export_type:
      TEMPLATE_FORMATS.has(
        template.export_type,
      )
        ? template.export_type
        : 'excel',
    columns: selection,
    filters:
      normalizeFilters(
        template.filters,
      ),
    include_photos:
      template.include_photos === true,
    include_signatures:
      template.include_signatures !== false,
    /*
     * L'interface ne permet pas de transformer un modèle personnel
     * en modèle global partagé. La valeur existante est seulement préservée.
     */
    is_default:
      template.is_default === true,
  };
}

function payloadFromForm(
  form,
  columns,
) {
  let selection =
    filterAvailableColumns(
      form.columns,
      columns,
    );

  selection = withManagedColumn(
    selection,
    'signature',
    form.include_signatures,
    columns,
  );

  selection = withManagedColumn(
    selection,
    'photos',
    form.include_photos,
    columns,
  );

  return {
    name: text(form.name).slice(
      0,
      MAX_NAME_LENGTH,
    ),
    description:
      text(form.description).slice(
        0,
        MAX_DESCRIPTION_LENGTH,
      ) || null,
    export_type:
      TEMPLATE_FORMATS.has(
        form.export_type,
      )
        ? form.export_type
        : 'excel',
    columns: selection,
    filters:
      normalizeFilters(form.filters),
    include_photos:
      form.include_photos === true,
    include_signatures:
      form.include_signatures !== false,
    is_default:
      form.is_default === true,
  };
}

function errorMessage(
  error,
  fallback,
) {
  const detail =
    error?.response?.data?.detail;

  if (
    typeof detail === 'string' &&
    detail.trim()
  ) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        isRecord(item)
          ? text(
              item.msg ??
                item.message,
            )
          : text(item),
      )
      .filter(Boolean);

    if (messages.length) {
      return messages.join(' · ');
    }
  }

  return (
    text(
      error?.response?.data
        ?.message,
    ) ||
    text(error?.message) ||
    fallback
  );
}

function formatCreatedAt(value) {
  if (!value) return '';

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return '';
  }

  return date.toLocaleDateString(
    'fr-FR',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  );
}

function formatLabel(
  format,
  formats,
) {
  return (
    formats.find(
      (item) =>
        item.key === format,
    )?.label ||
    text(format).toLocaleUpperCase(
      'fr',
    ) ||
    '—'
  );
}

function templateSummary(
  template,
) {
  const parts = [
    `${template.columns.length} colonne${
      template.columns.length > 1
        ? 's'
        : ''
    }`,
  ];

  const filterCount =
    Object.keys(
      template.filters,
    ).length;

  if (filterCount > 0) {
    parts.push(
      `${filterCount} filtre${
        filterCount > 1
          ? 's'
          : ''
      }`,
    );
  }

  if (template.include_photos) {
    parts.push('photos');
  }

  if (
    template.include_signatures
  ) {
    parts.push('signatures');
  }

  return parts.join(' · ');
}

function isSystemTemplate(
  template,
) {
  return (
    template.is_default &&
    template.created_by === null
  );
}

const ExportTemplateManager = memo(
  function ExportTemplateManager({
    templates = [],
    onTemplatesChange,
    onApplyTemplate,
  }) {
    const reactId = useId();
    const requestSequenceRef =
      useRef(0);

    const normalizedPropTemplates =
      useMemo(
        () =>
          normalizeTemplates(
            templates,
          ),
        [templates],
      );

    const [
      localTemplates,
      setLocalTemplates,
    ] = useState(
      normalizedPropTemplates,
    );

    const [columns, setColumns] =
      useState({});

    const [
      columnCategories,
      setColumnCategories,
    ] = useState({});

    const [formats, setFormats] =
      useState([]);

    const [
      metadataLoading,
      setMetadataLoading,
    ] = useState(true);

    const [
      metadataError,
      setMetadataError,
    ] = useState('');

    const [mode, setMode] =
      useState('list');

    const [editingId, setEditingId] =
      useState(null);

    const [form, setForm] =
      useState({
        ...EMPTY_FORM,
      });

    const [action, setAction] =
      useState('');

    const [error, setError] =
      useState('');

    const [
      deleteCandidate,
      setDeleteCandidate,
    ] = useState(null);

    useEffect(() => {
      setLocalTemplates(
        normalizedPropTemplates,
      );
    }, [
      normalizedPropTemplates,
    ]);

    const loadMetadata =
      useCallback(async () => {
        const requestId =
          requestSequenceRef.current +
          1;

        requestSequenceRef.current =
          requestId;

        setMetadataLoading(true);
        setMetadataError('');

        const results =
          await Promise.allSettled([
            api.getExportColumns(),
            api.getExportFormats(),
          ]);

        if (
          requestId !==
          requestSequenceRef.current
        ) {
          return;
        }

        const failures = [];

        const columnResult =
          results[0];

        let nextColumns = {};

        if (
          columnResult.status ===
          'fulfilled'
        ) {
          nextColumns =
            normalizeColumns(
              columnResult.value?.data
                ?.columns,
            );

          setColumns(nextColumns);

          setColumnCategories(
            normalizeCategories(
              columnResult.value?.data
                ?.categories,
            ),
          );

          if (
            !Object.keys(
              nextColumns,
            ).length
          ) {
            failures.push(
              'Aucune colonne d’export disponible.',
            );
          }
        } else {
          setColumns({});
          setColumnCategories({});

          failures.push(
            errorMessage(
              columnResult.reason,
              'Colonnes indisponibles.',
            ),
          );
        }

        const formatResult =
          results[1];

        if (
          formatResult.status ===
          'fulfilled'
        ) {
          const nextFormats =
            normalizeFormats(
              formatResult.value?.data
                ?.formats,
            );

          setFormats(nextFormats);

          if (!nextFormats.length) {
            failures.push(
              'Aucun format de modèle disponible.',
            );
          }
        } else {
          setFormats([]);

          failures.push(
            errorMessage(
              formatResult.reason,
              'Formats indisponibles.',
            ),
          );
        }

        setMetadataError(
          failures.join(' '),
        );

        setMetadataLoading(false);
      }, []);

    useEffect(() => {
      loadMetadata();

      return () => {
        requestSequenceRef.current +=
          1;
      };
    }, [loadMetadata]);

    const metadataReady =
      Object.keys(columns).length >
        0 &&
      formats.length > 0;

    const busy =
      Boolean(action) ||
      metadataLoading;

    const emitTemplates =
      useCallback(
        (nextTemplates) => {
          const normalized =
            normalizeTemplates(
              nextTemplates,
            );

          setLocalTemplates(
            normalized,
          );

          if (
            typeof onTemplatesChange ===
            'function'
          ) {
            onTemplatesChange(
              normalized,
            );
          }
        },
        [onTemplatesChange],
      );

    const closeForm =
      useCallback(() => {
        if (action) return;

        setMode('list');
        setEditingId(null);
        setError('');
        setDeleteCandidate(null);
        setForm({
          ...EMPTY_FORM,
        });
      }, [action]);

    const openCreate =
      useCallback(() => {
        if (!metadataReady || busy) {
          return;
        }

        setMode('create');
        setEditingId(null);
        setDeleteCandidate(null);
        setError('');
        setForm(
          createInitialForm(
            columns,
          ),
        );
      }, [
        busy,
        columns,
        metadataReady,
      ]);

    const openEdit =
      useCallback(
        (template) => {
          if (
            !metadataReady ||
            busy ||
            isSystemTemplate(template)
          ) {
            return;
          }

          setMode('edit');
          setEditingId(
            template.id,
          );
          setDeleteCandidate(null);
          setError('');
          setForm(
            templateToForm(
              template,
              columns,
            ),
          );
        },
        [
          busy,
          columns,
          metadataReady,
        ],
      );

    const updateForm =
      useCallback(
        (key, value) => {
          setForm((current) => ({
            ...current,
            [key]: value,
          }));

          setError('');
        },
        [],
      );

    const handlePhotosChange =
      useCallback(
        (enabled) => {
          setForm((current) => ({
            ...current,
            include_photos:
              enabled,
            columns:
              withManagedColumn(
                current.columns,
                'photos',
                enabled,
                columns,
              ),
          }));

          setError('');
        },
        [columns],
      );

    const handleSignaturesChange =
      useCallback(
        (enabled) => {
          setForm((current) => ({
            ...current,
            include_signatures:
              enabled,
            columns:
              withManagedColumn(
                current.columns,
                'signature',
                enabled,
                columns,
              ),
          }));

          setError('');
        },
        [columns],
      );

    const validateForm =
      useCallback(() => {
        const payload =
          payloadFromForm(
            form,
            columns,
          );

        if (!payload.name) {
          setError(
            'Le nom du modèle est requis.',
          );
          return null;
        }

        if (
          !payload.columns.length
        ) {
          setError(
            'Sélectionnez au moins une colonne.',
          );
          return null;
        }

        if (
          !TEMPLATE_FORMATS.has(
            payload.export_type,
          )
        ) {
          setError(
            'Sélectionnez un format valide.',
          );
          return null;
        }

        return payload;
      }, [
        columns,
        form,
      ]);

    const saveTemplate =
      useCallback(async () => {
        if (action) return;

        const payload =
          validateForm();

        if (!payload) return;

        const requestId =
          requestSequenceRef.current +
          1;

        requestSequenceRef.current =
          requestId;

        const editing =
          mode === 'edit' &&
          positiveInteger(editingId) !==
            null;

        setAction(
          editing
            ? 'update'
            : 'create',
        );

        setError('');

        try {
          const response = editing
            ? await api.updateExportTemplate(
                editingId,
                payload,
              )
            : await api.createExportTemplate(
                payload,
              );

          if (
            requestId !==
            requestSequenceRef.current
          ) {
            return;
          }

          const saved =
            normalizeTemplate(
              response?.data
                ?.template,
            );

          if (!saved) {
            throw new Error(
              'Réponse modèle invalide.',
            );
          }

          const nextTemplates =
            editing
              ? localTemplates.map(
                  (template) =>
                    template.id ===
                    saved.id
                      ? {
                          ...template,
                          ...saved,
                          /*
                           * L'API update ne renvoie pas created_by/created_at.
                           */
                          created_by:
                            saved.created_by ??
                            template.created_by,
                          created_at:
                            saved.created_at ||
                            template.created_at,
                        }
                      : template,
                )
              : [
                  ...localTemplates,
                  saved,
                ];

          emitTemplates(
            nextTemplates,
          );

          setMode('list');
          setEditingId(null);
          setForm({
            ...EMPTY_FORM,
          });
        } catch (requestError) {
          if (
            requestId !==
            requestSequenceRef.current
          ) {
            return;
          }

          setError(
            errorMessage(
              requestError,
              editing
                ? 'Erreur lors de la modification du modèle.'
                : 'Erreur lors de la création du modèle.',
            ),
          );
        } finally {
          if (
            requestId ===
            requestSequenceRef.current
          ) {
            setAction('');
          }
        }
      }, [
        action,
        editingId,
        emitTemplates,
        localTemplates,
        mode,
        validateForm,
      ]);

    const confirmDelete =
      useCallback(async () => {
        if (
          action ||
          !deleteCandidate ||
          isSystemTemplate(
            deleteCandidate,
          )
        ) {
          return;
        }

        const requestId =
          requestSequenceRef.current +
          1;

        requestSequenceRef.current =
          requestId;

        setAction(
          `delete:${deleteCandidate.id}`,
        );

        setError('');

        try {
          await api.deleteExportTemplate(
            deleteCandidate.id,
          );

          if (
            requestId !==
            requestSequenceRef.current
          ) {
            return;
          }

          emitTemplates(
            localTemplates.filter(
              (template) =>
                template.id !==
                deleteCandidate.id,
            ),
          );

          setDeleteCandidate(null);

          if (
            editingId ===
            deleteCandidate.id
          ) {
            closeForm();
          }
        } catch (requestError) {
          if (
            requestId !==
            requestSequenceRef.current
          ) {
            return;
          }

          setError(
            errorMessage(
              requestError,
              'Erreur lors de la suppression du modèle.',
            ),
          );
        } finally {
          if (
            requestId ===
            requestSequenceRef.current
          ) {
            setAction('');
          }
        }
      }, [
        action,
        closeForm,
        deleteCandidate,
        editingId,
        emitTemplates,
        localTemplates,
      ]);

    const applyTemplate =
      useCallback(
        (template) => {
          if (
            action ||
            typeof onApplyTemplate !==
              'function'
          ) {
            return;
          }

          onApplyTemplate(
            template,
          );
        },
        [
          action,
          onApplyTemplate,
        ],
      );

    const payloadPreview =
      useMemo(
        () =>
          payloadFromForm(
            form,
            columns,
          ),
        [
          columns,
          form,
        ],
      );

    const normalizedFormats =
      formats.length
        ? formats
        : [
            {
              key: 'excel',
              label:
                'Excel (.xlsx)',
              description: '',
              icon: '📊',
            },
            {
              key: 'csv',
              label:
                'CSV (.csv)',
              description: '',
              icon: '📄',
            },
            {
              key: 'pdf',
              label:
                'PDF (.pdf)',
              description: '',
              icon: '📕',
            },
          ];

    return (
      <section
        className="export-template-manager"
        aria-label="Gestion des modèles d’export"
        aria-busy={
          busy || undefined
        }
      >
        <div className="export-template-header">
          <div>
            <h3>
              Gestion des modèles d’export
            </h3>

            <p
              style={{
                margin:
                  '4px 0 0',
                color:
                  'var(--export-text-secondary)',
                fontSize:
                  '0.82em',
              }}
            >
              Enregistrez les colonnes, filtres et options pour les réutiliser.
            </p>
          </div>

          {mode === 'list' && (
            <button
              type="button"
              className="export-btn export-btn-primary"
              onClick={
                openCreate
              }
              disabled={
                busy ||
                !metadataReady
              }
              title={
                !metadataReady
                  ? 'Configuration des modèles indisponible'
                  : undefined
              }
            >
              + Nouveau modèle
            </button>
          )}
        </div>

        {metadataLoading && (
          <div
            className="export-loading"
            role="status"
          >
            Chargement de la configuration des modèles…
          </div>
        )}

        {!metadataLoading &&
          metadataError && (
            <div
              className="export-error"
              role="status"
              style={{
                color:
                  'var(--color-warning)',
                borderColor:
                  'var(--color-warning)',
                background:
                  'var(--color-warning-dim)',
              }}
            >
              <span>
                {metadataError}
              </span>

              {' '}

              <button
                type="button"
                className="export-btn-small"
                onClick={
                  loadMetadata
                }
                disabled={busy}
              >
                Réessayer
              </button>
            </div>
          )}

        {error && (
          <div
            className="export-error"
            role="alert"
          >
            {error}
          </div>
        )}

        {mode !== 'list' && (
          <div className="export-template-form">
            <h4>
              {mode === 'edit'
                ? 'Modifier le modèle'
                : 'Créer un modèle'}
            </h4>

            <div className="export-template-fields">
              <div className="export-filter-item">
                <label
                  htmlFor={`${reactId}-template-name`}
                >
                  Nom du modèle
                </label>

                <input
                  id={`${reactId}-template-name`}
                  type="text"
                  className="export-input"
                  value={form.name}
                  maxLength={
                    MAX_NAME_LENGTH
                  }
                  autoComplete="off"
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      'name',
                      event.target.value.slice(
                        0,
                        MAX_NAME_LENGTH,
                      ),
                    )
                  }
                  placeholder="Export Orange hebdomadaire"
                  disabled={Boolean(
                    action,
                  )}
                  autoFocus
                />
              </div>

              <div className="export-filter-item">
                <label
                  htmlFor={`${reactId}-template-description`}
                >
                  Description
                </label>

                <input
                  id={`${reactId}-template-description`}
                  type="text"
                  className="export-input"
                  value={
                    form.description
                  }
                  maxLength={
                    MAX_DESCRIPTION_LENGTH
                  }
                  onChange={(
                    event,
                  ) =>
                    updateForm(
                      'description',
                      event.target.value.slice(
                        0,
                        MAX_DESCRIPTION_LENGTH,
                      ),
                    )
                  }
                  placeholder="Description optionnelle"
                  disabled={Boolean(
                    action,
                  )}
                />
              </div>
            </div>

            <div
              className="export-filter-item"
              style={{
                marginBottom: 16,
              }}
            >
              <label
                htmlFor={`${reactId}-template-format`}
              >
                Format du modèle
              </label>

              <select
                id={`${reactId}-template-format`}
                value={
                  form.export_type
                }
                onChange={(
                  event,
                ) =>
                  updateForm(
                    'export_type',
                    event.target.value,
                  )
                }
                disabled={Boolean(
                  action,
                )}
              >
                {normalizedFormats.map(
                  (format) => (
                    <option
                      key={
                        format.key
                      }
                      value={
                        format.key
                      }
                    >
                      {format.label}
                    </option>
                  ),
                )}
              </select>
            </div>

            <ExportColumnSelector
              categories={
                columnCategories
              }
              selectedColumns={
                form.columns
              }
              onChange={(
                nextColumns,
              ) =>
                updateForm(
                  'columns',
                  nextColumns,
                )
              }
              disabled={Boolean(
                action,
              )}
            />

            <div
              style={{
                marginTop: 16,
              }}
            >
              <ExportFilterPanel
                filters={
                  form.filters
                }
                onChange={(
                  nextFilters,
                ) =>
                  updateForm(
                    'filters',
                    nextFilters,
                  )
                }
                disabled={Boolean(
                  action,
                )}
                title="Filtres enregistrés"
              />
            </div>

            <div
              className="export-options"
              style={{
                marginTop: 16,
              }}
            >
              <label className="export-option">
                <input
                  type="checkbox"
                  checked={
                    form.include_photos
                  }
                  onChange={(
                    event,
                  ) =>
                    handlePhotosChange(
                      event.target
                        .checked,
                    )
                  }
                  disabled={
                    Boolean(action) ||
                    !Object.prototype.hasOwnProperty.call(
                      columns,
                      'photos',
                    )
                  }
                />

                <span>
                  Inclure les photos
                </span>

                <small>
                  Lors de l’application, l’export principal sélectionnera ZIP pour embarquer les fichiers.
                </small>
              </label>

              <label className="export-option">
                <input
                  type="checkbox"
                  checked={
                    form.include_signatures
                  }
                  onChange={(
                    event,
                  ) =>
                    handleSignaturesChange(
                      event.target
                        .checked,
                    )
                  }
                  disabled={
                    Boolean(action) ||
                    !Object.prototype.hasOwnProperty.call(
                      columns,
                      'signature',
                    )
                  }
                />

                <span>
                  Inclure les signatures
                </span>
              </label>
            </div>

            <div
              style={{
                marginTop: 14,
                color:
                  'var(--export-text-secondary)',
                fontSize:
                  '0.8em',
              }}
              aria-live="polite"
            >
              {payloadPreview.columns.length}{' '}
              colonne
              {payloadPreview.columns.length >
              1
                ? 's'
                : ''}
              {' · '}
              {Object.keys(
                payloadPreview.filters,
              ).length}{' '}
              filtre
              {Object.keys(
                payloadPreview.filters,
              ).length > 1
                ? 's'
                : ''}
            </div>

            <div className="export-template-actions">
              <button
                type="button"
                className="export-btn export-btn-cancel"
                onClick={
                  closeForm
                }
                disabled={Boolean(
                  action,
                )}
              >
                Annuler
              </button>

              <button
                type="button"
                className="export-btn export-btn-primary"
                onClick={
                  saveTemplate
                }
                disabled={
                  Boolean(action) ||
                  !text(form.name) ||
                  payloadPreview.columns
                    .length === 0
                }
              >
                {action === 'create'
                  ? 'Création…'
                  : action === 'update'
                    ? 'Enregistrement…'
                    : mode === 'edit'
                      ? 'Enregistrer'
                      : 'Créer le modèle'}
              </button>
            </div>
          </div>
        )}

        {mode === 'list' && (
          <div className="export-template-list">
            {localTemplates.length ===
            0 ? (
              <div className="export-empty">
                <div
                  className="empty-icon"
                  aria-hidden="true"
                >
                  📋
                </div>

                <p>
                  Aucun modèle d’export personnalisé.
                </p>

                <p className="empty-hint">
                  Créez un modèle pour réutiliser une configuration complète.
                </p>
              </div>
            ) : (
              localTemplates.map(
                (template) => {
                  const systemTemplate =
                    isSystemTemplate(
                      template,
                    );

                  const deleting =
                    action ===
                    `delete:${template.id}`;

                  const createdAt =
                    formatCreatedAt(
                      template.created_at,
                    );

                  return (
                    <article
                      key={
                        template.id
                      }
                      className="export-template-card"
                    >
                      <div className="export-template-card-header">
                        <h4
                          title={
                            template.name
                          }
                        >
                          {template.name}
                        </h4>

                        {template.is_default && (
                          <span className="export-default-badge">
                            {systemTemplate
                              ? 'Système'
                              : 'Par défaut'}
                          </span>
                        )}
                      </div>

                      {template.description && (
                        <p
                          className="export-template-desc"
                          title={
                            template.description
                          }
                        >
                          {
                            template.description
                          }
                        </p>
                      )}

                      <div className="export-template-meta">
                        <span className="meta-type">
                          {formatLabel(
                            template.export_type,
                            normalizedFormats,
                          )}
                        </span>

                        <span className="meta-columns">
                          {
                            templateSummary(
                              template,
                            )
                          }
                        </span>
                      </div>

                      {createdAt && (
                        <p
                          className="export-template-desc"
                          style={{
                            marginTop: -4,
                          }}
                        >
                          Créé le {createdAt}
                        </p>
                      )}

                      {deleteCandidate?.id ===
                      template.id ? (
                        <div
                          role="alertdialog"
                          aria-label={`Confirmer la suppression de ${template.name}`}
                          style={{
                            padding: 10,
                            border:
                              '1px solid var(--export-danger)',
                            borderRadius: 6,
                            background:
                              'var(--color-danger-dim)',
                          }}
                        >
                          <p
                            style={{
                              margin:
                                '0 0 8px',
                              fontSize:
                                '0.82em',
                            }}
                          >
                            Supprimer définitivement ce modèle ?
                          </p>

                          <div className="export-template-card-actions">
                            <button
                              type="button"
                              className="export-btn-small"
                              onClick={() =>
                                setDeleteCandidate(
                                  null,
                                )
                              }
                              disabled={
                                deleting
                              }
                            >
                              Annuler
                            </button>

                            <button
                              type="button"
                              className="export-btn-small export-btn-danger"
                              onClick={
                                confirmDelete
                              }
                              disabled={
                                deleting
                              }
                            >
                              {deleting
                                ? 'Suppression…'
                                : 'Confirmer'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="export-template-card-actions">
                          <button
                            type="button"
                            className="export-btn-small export-btn-primary"
                            onClick={() =>
                              applyTemplate(
                                template,
                              )
                            }
                            disabled={
                              Boolean(action) ||
                              typeof onApplyTemplate !==
                                'function'
                            }
                          >
                            Appliquer
                          </button>

                          <button
                            type="button"
                            className="export-btn-small"
                            onClick={() =>
                              openEdit(
                                template,
                              )
                            }
                            disabled={
                              Boolean(action) ||
                              !metadataReady ||
                              systemTemplate
                            }
                            title={
                              systemTemplate
                                ? 'Les modèles système sont en lecture seule.'
                                : 'Modifier le modèle'
                            }
                          >
                            Modifier
                          </button>

                          <button
                            type="button"
                            className="export-btn-small export-btn-danger"
                            onClick={() =>
                              setDeleteCandidate(
                                template,
                              )
                            }
                            disabled={
                              Boolean(action) ||
                              systemTemplate
                            }
                            title={
                              systemTemplate
                                ? 'Les modèles système ne peuvent pas être supprimés.'
                                : 'Supprimer le modèle'
                            }
                          >
                            Supprimer
                          </button>
                        </div>
                      )}
                    </article>
                  );
                },
              )
            )}
          </div>
        )}
      </section>
    );
  },
);

ExportTemplateManager.displayName =
  'ExportTemplateManager';

export default ExportTemplateManager;
