/**
 * ExportColumnSelector — sélection structurée des colonnes d'export.
 *
 * "photos" et "signature" sont pilotées dans l'étape Format & Options.
 * Elles restent visibles ici, mais ne peuvent pas être modifiées à deux endroits.
 */

import { memo, useEffect, useId, useMemo, useState } from 'react';

const CATEGORY_ORDER = Object.freeze([
  'identification',
  'client',
  'localisation',
  'dates',
  'suivi',
  'technique',
  'reseau',
  'equipement',
  'gps',
  'ressources',
  'temps',
  'multimedia',
  'notes',
]);

const CATEGORY_LABELS = Object.freeze({
  identification: 'Identification',
  client: 'Client',
  localisation: 'Localisation',
  dates: 'Dates',
  suivi: 'Suivi',
  technique: 'Technique',
  reseau: 'Réseau',
  equipement: 'Équipement',
  gps: 'GPS',
  ressources: 'Ressources',
  temps: 'Temps',
  multimedia: 'Multimédia',
  notes: 'Notes',
  autres: 'Autres',
});

const DEFAULT_OPTION_MANAGED_COLUMNS = Object.freeze([
  'photos',
  'signature',
]);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function uniqueKeys(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();

  return value
    .map((item) => text(item))
    .filter((key) => {
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function humanize(value) {
  return text(value)
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toLocaleUpperCase('fr'));
}

function normalizeCategories(categories) {
  if (!isRecord(categories)) return [];

  const seenColumns = new Set();
  const result = [];

  Object.entries(categories).forEach(([rawKey, rawCategory]) => {
    const key = text(rawKey);

    if (!key || !isRecord(rawCategory) || !Array.isArray(rawCategory.columns)) {
      return;
    }

    const columns = rawCategory.columns.flatMap((rawColumn) => {
      if (!isRecord(rawColumn)) return [];

      const columnKey = text(rawColumn.key);

      if (!columnKey || seenColumns.has(columnKey)) return [];

      seenColumns.add(columnKey);

      return [{
        key: columnKey,
        label: text(rawColumn.label, humanize(columnKey)),
        default: rawColumn.default === true,
      }];
    });

    if (!columns.length) return;

    result.push({
      key,
      label: CATEGORY_LABELS[key] || text(rawCategory.label, humanize(key)),
      columns,
    });
  });

  const ranks = new Map(
    CATEGORY_ORDER.map((key, index) => [key, index]),
  );

  return result.sort((first, second) => {
    const firstRank = ranks.get(first.key) ?? CATEGORY_ORDER.length;
    const secondRank = ranks.get(second.key) ?? CATEGORY_ORDER.length;

    return (
      firstRank - secondRank ||
      first.label.localeCompare(second.label, 'fr', {
        sensitivity: 'base',
      })
    );
  });
}

function orderedSelection(allKeys, selection) {
  const selected = new Set(selection);
  return allKeys.filter((key) => selected.has(key));
}

function categoryState(category, selected, managed) {
  const selectableKeys = category.columns
    .map((column) => column.key)
    .filter((key) => !managed.has(key));

  const selectedCount = category.columns.reduce(
    (count, column) => count + Number(selected.has(column.key)),
    0,
  );

  const selectedSelectableCount = selectableKeys.reduce(
    (count, key) => count + Number(selected.has(key)),
    0,
  );

  return {
    selectableKeys,
    selectedCount,
    all:
      selectableKeys.length > 0 &&
      selectedSelectableCount === selectableKeys.length,
    some:
      selectedSelectableCount > 0 &&
      selectedSelectableCount < selectableKeys.length,
  };
}

function selectionLabel(count) {
  return `${count} colonne${count > 1 ? 's' : ''} sélectionnée${
    count > 1 ? 's' : ''
  }`;
}

function ChevronIcon({ expanded }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{
        flexShrink: 0,
        transform: expanded ? 'rotate(180deg)' : 'none',
        transition: 'transform 120ms ease',
      }}
    >
      <path d="m4 6 4 4 4-4" />
    </svg>
  );
}

const ExportColumnSelector = memo(function ExportColumnSelector({
  categories = {},
  selectedColumns = [],
  onChange,
  disabled = false,
  optionManagedColumns = DEFAULT_OPTION_MANAGED_COLUMNS,
  title = 'Colonnes à exporter',
  emptyMessage = 'Aucune colonne d’export n’est disponible.',
}) {
  const reactId = useId();

  const normalizedCategories = useMemo(
    () => normalizeCategories(categories),
    [categories],
  );

  const managed = useMemo(
    () =>
      new Set(
        uniqueKeys(
          Array.isArray(optionManagedColumns)
            ? optionManagedColumns
            : DEFAULT_OPTION_MANAGED_COLUMNS,
        ),
      ),
    [optionManagedColumns],
  );

  const allKeys = useMemo(
    () =>
      normalizedCategories.flatMap((category) =>
        category.columns.map((column) => column.key),
      ),
    [normalizedCategories],
  );

  const available = useMemo(() => new Set(allKeys), [allKeys]);

  const normalizedSelection = useMemo(
    () => uniqueKeys(selectedColumns).filter((key) => available.has(key)),
    [available, selectedColumns],
  );

  const selected = useMemo(
    () => new Set(normalizedSelection),
    [normalizedSelection],
  );

  const selectableKeys = useMemo(
    () => allKeys.filter((key) => !managed.has(key)),
    [allKeys, managed],
  );

  const selectedSelectableCount = selectableKeys.reduce(
    (count, key) => count + Number(selected.has(key)),
    0,
  );

  const allSelectableSelected =
    selectableKeys.length > 0 &&
    selectedSelectableCount === selectableKeys.length;

  const [expandedCategory, setExpandedCategory] = useState(null);

  useEffect(() => {
    if (
      expandedCategory &&
      !normalizedCategories.some(
        (category) => category.key === expandedCategory,
      )
    ) {
      const frameId = window.requestAnimationFrame(() => setExpandedCategory(null));
      return () => window.cancelAnimationFrame(frameId);
    }
    return undefined;
  }, [expandedCategory, normalizedCategories]);

  const canChange = !disabled && typeof onChange === 'function';

  function emit(nextSelection) {
    if (!canChange) return;
    onChange(orderedSelection(allKeys, nextSelection));
  }

  function managedSelection() {
    return normalizedSelection.filter((key) => managed.has(key));
  }

  function toggleColumn(key) {
    if (!canChange || managed.has(key)) return;

    const next = new Set(normalizedSelection);

    if (next.has(key)) next.delete(key);
    else next.add(key);

    emit(next);
  }

  function toggleCategory(category) {
    if (!canChange) return;

    const state = categoryState(category, selected, managed);
    if (!state.selectableKeys.length) return;

    const next = new Set(normalizedSelection);

    state.selectableKeys.forEach((key) => {
      if (state.all) next.delete(key);
      else next.add(key);
    });

    emit(next);
  }

  const normalizedTitle = text(title, 'Colonnes à exporter');

  return (
    <section
      className="export-column-selector"
      aria-label={normalizedTitle}
      aria-disabled={disabled || undefined}
    >
      <div className="export-column-header">
        <h4>{normalizedTitle}</h4>

        <span className="export-column-count" aria-live="polite">
          {selectionLabel(normalizedSelection.length)}
        </span>
      </div>

      {!normalizedCategories.length ? (
        <div className="export-empty" role="status">
          <p>{text(emptyMessage, 'Aucune colonne d’export n’est disponible.')}</p>
        </div>
      ) : (
        <>
          <div className="export-column-actions">
            <button
              type="button"
              className="export-btn-small"
              disabled={
                !canChange ||
                allSelectableSelected ||
                !selectableKeys.length
              }
              onClick={() =>
                emit([
                  ...managedSelection(),
                  ...selectableKeys,
                ])
              }
            >
              Tout sélectionner
            </button>

            <button
              type="button"
              className="export-btn-small"
              disabled={!canChange || selectedSelectableCount === 0}
              onClick={() => emit(managedSelection())}
            >
              Tout désélectionner
            </button>
          </div>

          <div className="export-column-categories">
            {normalizedCategories.map((category) => {
              const expanded = expandedCategory === category.key;
              const panelId = `${reactId}-${category.key}-columns`;
              const state = categoryState(category, selected, managed);

              const selectionAction = state.all
                ? `Désélectionner les colonnes modifiables de ${category.label}`
                : `Sélectionner les colonnes modifiables de ${category.label}`;

              return (
                <section
                  key={category.key}
                  className="export-category"
                  aria-label={category.label}
                >
                  <div
                    className={`export-category-header ${
                      expanded ? 'expanded' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="export-category-name"
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() =>
                        setExpandedCategory(expanded ? null : category.key)
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                        padding: 0,
                        border: 0,
                        background: 'transparent',
                        color: 'inherit',
                        font: 'inherit',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <ChevronIcon expanded={expanded} />
                      <span title={category.label}>{category.label}</span>
                    </button>

                    <span
                      className="export-category-count"
                      aria-label={`${state.selectedCount} sur ${category.columns.length} sélectionnées`}
                    >
                      {state.selectedCount}/{category.columns.length}
                    </span>

                    <button
                      type="button"
                      className={`export-btn-tiny ${state.all ? 'active' : ''}`}
                      aria-label={selectionAction}
                      aria-pressed={state.all ? true : state.some ? 'mixed' : false}
                      title={selectionAction}
                      disabled={!canChange || !state.selectableKeys.length}
                      onClick={() => toggleCategory(category)}
                    >
                      <span aria-hidden="true">
                        {state.all ? '✓' : state.some ? '−' : '☐'}
                      </span>
                    </button>
                  </div>

                  {expanded && (
                    <div id={panelId} className="export-category-columns">
                      {category.columns.map((column) => {
                        const optionManaged = managed.has(column.key);
                        const inputId = `${reactId}-${category.key}-${column.key}`;

                        return (
                          <label
                            key={column.key}
                            className="export-column-item"
                            htmlFor={inputId}
                            title={
                              optionManaged
                                ? 'Cette colonne est gérée dans Format & Options.'
                                : column.label
                            }
                            style={
                              optionManaged
                                ? {
                                    cursor: 'not-allowed',
                                    opacity: 0.72,
                                  }
                                : undefined
                            }
                          >
                            <input
                              id={inputId}
                              type="checkbox"
                              checked={selected.has(column.key)}
                              disabled={disabled || optionManaged || !canChange}
                              onChange={() => toggleColumn(column.key)}
                            />

                            <span>{column.label}</span>

                            {optionManaged ? (
                              <span className="export-default-badge">
                                option
                              </span>
                            ) : (
                              column.default && (
                                <span className="export-default-badge">
                                  défaut
                                </span>
                              )
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
});

ExportColumnSelector.displayName = 'ExportColumnSelector';

export default ExportColumnSelector;
