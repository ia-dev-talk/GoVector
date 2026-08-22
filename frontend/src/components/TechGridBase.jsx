import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ModuleRegistry,
} from 'ag-grid-community';

ModuleRegistry.registerModules([
  AllCommunityModule,
]);

const ORIENTEUR_COLORS = [
  '#e74c3c',
  '#2ecc71',
  '#3498db',
  '#f39c12',
  '#9b59b6',
];

const STATUS_LABELS = {
  available: 'Disponible',
  disponible: 'Disponible',

  on_break: 'En pause',
  pause: 'En pause',
  en_pause: 'En pause',

  off_duty: 'Hors service',
  hors_service: 'Hors service',

  disconnected: 'Déconnecté',
  deconnecte: 'Déconnecté',

  on_job: 'En intervention',
  en_job: 'En intervention',
  en_intervention: 'En intervention',
  en_tache: 'En intervention',

  en_route: 'En route',

  active: 'Actif',
  inactive: 'Inactif',
};

const fallbackRowIds = new WeakMap();
let fallbackRowIdSequence = 0;

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeIdentifier(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const identifier = String(value).trim();

  return identifier || null;
}

function normalizeText(value) {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number'
  ) {
    return '';
  }

  return String(value).trim();
}

function normalizeComparableText(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

function normalizeStatus(value) {
  return normalizeComparableText(value);
}

function toClassToken(value) {
  return normalizeComparableText(value)
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractDisplayText(value) {
  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return normalizeText(value);
  }

  if (!isRecord(value)) {
    return '';
  }

  return (
    normalizeText(value.name) ||
    normalizeText(value.label) ||
    normalizeText(value.skill) ||
    normalizeText(value.code)
  );
}

function normalizeDisplayList(value) {
  const sourceValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  const normalizedValues = [];
  const knownValues = new Set();

  sourceValues.forEach((item) => {
    const text = extractDisplayText(item);
    const comparisonKey =
      normalizeComparableText(text);

    if (
      !text ||
      !comparisonKey ||
      knownValues.has(comparisonKey)
    ) {
      return;
    }

    knownValues.add(comparisonKey);
    normalizedValues.push(text);
  });

  return normalizedValues;
}

function normalizeSelection(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(normalizeIdentifier)
        .filter(Boolean),
    ),
  ];
}

function parseNonNegativeInteger(value) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    typeof value === 'boolean'
  ) {
    return null;
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0
  ) {
    return null;
  }

  return Math.floor(number);
}

function getTechnicianRowId(technician) {
  const technicianId = normalizeIdentifier(
    technician?.id,
  );

  if (technicianId !== null) {
    return technicianId;
  }

  const employeeId = normalizeIdentifier(
    technician?.employee_id,
  );

  if (employeeId !== null) {
    return `employee-${employeeId}`;
  }

  if (!isRecord(technician)) {
    fallbackRowIdSequence += 1;
    return `technician-row-${fallbackRowIdSequence}`;
  }

  const existingFallbackId =
    fallbackRowIds.get(technician);

  if (existingFallbackId) {
    return existingFallbackId;
  }

  fallbackRowIdSequence += 1;

  const fallbackId =
    `technician-row-${fallbackRowIdSequence}`;

  fallbackRowIds.set(technician, fallbackId);

  return fallbackId;
}

function getTechnicianDisplayId(technician) {
  return (
    normalizeText(technician?.employee_id) ||
    normalizeText(technician?.id) ||
    '—'
  );
}

function getDisplayedTechnicianIds(gridApi) {
  const displayedIds = [];
  const knownIds = new Set();

  gridApi?.forEachNodeAfterFilterAndSort(
    (node) => {
      const identifier = normalizeIdentifier(
        node.data?.id,
      );

      if (
        identifier === null ||
        knownIds.has(identifier)
      ) {
        return;
      }

      knownIds.add(identifier);
      displayedIds.push(node.data.id);
    },
  );

  return displayedIds;
}

function getStableColorIndex(value) {
  const text =
    normalizeIdentifier(value) || '0';

  let hash = 0;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    hash =
      (hash * 31 + text.charCodeAt(index)) |
      0;
  }

  return (
    Math.abs(hash) % ORIENTEUR_COLORS.length
  );
}

function getStatusLabel(value) {
  const status = normalizeStatus(value);

  if (!status) {
    return 'Inconnu';
  }

  const knownLabel = STATUS_LABELS[status];

  if (knownLabel) {
    return knownLabel;
  }

  const fallbackLabel = normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');

  if (!fallbackLabel) {
    return 'Inconnu';
  }

  return (
    fallbackLabel.charAt(0).toUpperCase() +
    fallbackLabel.slice(1)
  );
}

function EmptyCell() {
  return (
    <span
      style={{
        color: 'var(--text-muted)',
      }}
    >
      —
    </span>
  );
}

function OrienteurBadgeCellRenderer({ data }) {
  const orienteurName = normalizeText(
    data?.orienteur_name,
  );

  if (!orienteurName) {
    return <EmptyCell />;
  }

  const colorIndex = getStableColorIndex(
    data?.orienteur_id ?? orienteurName,
  );

  const color = ORIENTEUR_COLORS[colorIndex];

  return (
    <span
      className="orienteur-badge"
      style={{
        backgroundColor: `${color}20`,
        color,
        border: `1px solid ${color}40`,
        borderRadius: '4px',
        padding: '1px 6px',
        fontSize: '11px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
      title={orienteurName}
    >
      {orienteurName}
    </span>
  );
}

function StatusCellRenderer({ value }) {
  const status = normalizeStatus(value);

  if (!status) {
    return <EmptyCell />;
  }

  const displayValue = getStatusLabel(value);
  const statusClass =
    toClassToken(status) || 'unknown';

  return (
    <span
      className={`status-badge status-badge--${statusClass}`}
      title={displayValue}
    >
      {displayValue}
    </span>
  );
}

function SkillsCellRenderer({ value }) {
  const skills = normalizeDisplayList(value);

  if (skills.length === 0) {
    return <EmptyCell />;
  }

  return (
    <span
      className="skills-cell"
      title={skills.join(', ')}
    >
      {skills.map((skill, index) => (
        <span
          key={`${normalizeComparableText(skill)}-${index}`}
          className="skill-chip"
        >
          {skill}
        </span>
      ))}
    </span>
  );
}

function ShiftCellRenderer({ data }) {
  const shiftStart = normalizeText(
    data?.shift_start,
  );

  const shiftEnd = normalizeText(
    data?.shift_end,
  );

  if (!shiftStart || !shiftEnd) {
    return <EmptyCell />;
  }

  const shiftLabel = `${shiftStart}–${shiftEnd}`;

  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
      }}
      title={shiftLabel}
    >
      {shiftLabel}
    </span>
  );
}

function JobCountCellRenderer({ data }) {
  if (!data) {
    return null;
  }

  const assignedJobs = parseNonNegativeInteger(
    data.assigned_jobs,
  );

  const completedJobs = parseNonNegativeInteger(
    data.completed_jobs,
  );

  if (
    assignedJobs === null &&
    completedJobs === null
  ) {
    return <EmptyCell />;
  }

  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
      }}
      title="Interventions affectées : terminées"
    >
      {assignedJobs ?? '—'}
      <span
        style={{
          color: 'var(--text-muted)',
        }}
      >
        :
      </span>
      {completedJobs ?? '—'}
    </span>
  );
}

const TechGrid = forwardRef(function TechGrid(
  {
    technicians,
    selectedIds = [],
    onRowClicked,
    onRowDoubleClicked,
    onContextMenu,
    isDragTarget = false,
  },
  ref,
) {
  const gridRef = useRef(null);
  const containerRef = useRef(null);

  const safeTechnicians = useMemo(
    () =>
      Array.isArray(technicians)
        ? technicians.filter(isRecord)
        : [],
    [technicians],
  );

  const safeSelectedIds = useMemo(
    () => normalizeSelection(selectedIds),
    [selectedIds],
  );

  const selectedIdSet = useMemo(
    () => new Set(safeSelectedIds),
    [safeSelectedIds],
  );

  const syncSelection = useCallback(() => {
    const gridApi = gridRef.current?.api;

    if (!gridApi) {
      return;
    }

    gridApi.forEachNode((node) => {
      const technicianId = normalizeIdentifier(
        node.data?.id,
      );

      const shouldBeSelected =
        technicianId !== null &&
        selectedIdSet.has(technicianId);

      if (node.isSelected() !== shouldBeSelected) {
        node.setSelected(
          shouldBeSelected,
          false,
          'api',
        );
      }
    });
  }, [selectedIdSet]);

  useImperativeHandle(
    ref,
    () => ({
      getTechIdAtPoint: (x, y) => {
        const element = document.elementFromPoint(
          x,
          y,
        );

        if (
          !element ||
          !containerRef.current?.contains(element)
        ) {
          return null;
        }

        const rowElement =
          element.closest('.ag-row');

        if (!rowElement) {
          return null;
        }

        const rowIndex = Number(
          rowElement.getAttribute('row-index'),
        );

        if (
          !Number.isInteger(rowIndex) ||
          rowIndex < 0
        ) {
          return null;
        }

        const rowNode =
          gridRef.current?.api?.getDisplayedRowAtIndex(
            rowIndex,
          );

        return rowNode?.data?.id ?? null;
      },

      selectAll: () => {
        gridRef.current?.api?.selectAll();
      },
    }),
    [],
  );

  const columnDefs = useMemo(
    () => [
      {
        headerName: 'ID Tech',
        width: 85,
        pinned: 'left',
        sort: 'asc',
        valueGetter: (params) =>
          getTechnicianDisplayId(params.data),
        comparator: (left, right) =>
          String(left ?? '').localeCompare(
            String(right ?? ''),
            'fr',
            {
              numeric: true,
              sensitivity: 'base',
            },
          ),
        cellStyle: {
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-xs)',
        },
      },
      {
        field: 'name',
        headerName: 'Nom',
        minWidth: 150,
        flex: 1,
        pinned: 'left',
        valueFormatter: (params) =>
          normalizeText(params.value) || '—',
        tooltipValueGetter: (params) =>
          normalizeText(params.value) || null,
      },
      {
        headerName: 'Statut',
        width: 110,
        valueGetter: (params) =>
          normalizeText(
            params.data?.live_status,
          ) ||
          normalizeText(params.data?.status) ||
          '',
        cellRenderer: StatusCellRenderer,
      },
      {
        headerName: 'Horaires',
        width: 110,
        cellRenderer: ShiftCellRenderer,
        valueGetter: (params) => {
          const shiftStart = normalizeText(
            params.data?.shift_start,
          );

          const shiftEnd = normalizeText(
            params.data?.shift_end,
          );

          return shiftStart && shiftEnd
            ? `${shiftStart}-${shiftEnd}`
            : '';
        },
      },
      {
        headerName: 'Interv. A:T',
        width: 85,
        cellRenderer: JobCountCellRenderer,
        valueGetter: (params) => {
          const assigned = parseNonNegativeInteger(
            params.data?.assigned_jobs,
          );

          const completed = parseNonNegativeInteger(
            params.data?.completed_jobs,
          );

          if (
            assigned === null &&
            completed === null
          ) {
            return null;
          }

          return assigned ?? completed;
        },
      },
      {
        headerName: 'Orienteur',
        width: 120,
        cellRenderer: OrienteurBadgeCellRenderer,
        valueGetter: (params) =>
          normalizeText(
            params.data?.orienteur_name,
          ),
      },
      {
        field: 'assigned_routes',
        headerName: 'Secteurs',
        width: 120,
        cellStyle: {
          fontFamily: 'var(--font-mono)',
          fontSize: '10px',
          color: 'var(--text-muted)',
        },
        valueFormatter: (params) => {
          const routes = normalizeDisplayList(
            params.value,
          );

          return routes.join(', ') || '—';
        },
        tooltipValueGetter: (params) => {
          const routes = normalizeDisplayList(
            params.value,
          );

          return routes.join(', ') || null;
        },
      },
      {
        field: 'max_jobs_per_day',
        headerName: 'Max',
        width: 55,
        cellStyle: {
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-muted)',
        },
        valueFormatter: (params) => {
          const value = parseNonNegativeInteger(
            params.value,
          );

          return value === null
            ? '—'
            : String(value);
        },
      },
      {
        field: 'skills',
        headerName: 'Compétences',
        minWidth: 180,
        flex: 1,
        cellRenderer: SkillsCellRenderer,
        valueFormatter: (params) =>
          normalizeDisplayList(params.value).join(
            ', ',
          ),
        tooltipValueGetter: (params) => {
          const skills = normalizeDisplayList(
            params.value,
          );

          return skills.join(', ') || null;
        },
      },
      {
        field: 'phone',
        headerName: 'Téléphone',
        width: 120,
        cellStyle: {
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-secondary)',
        },
        valueFormatter: (params) =>
          normalizeText(params.value) || '—',
      },
    ],
    [],
  );

  const defaultColDef = useMemo(
    () => ({
      sortable: true,
      resizable: true,
      suppressMovable: false,
    }),
    [],
  );

  const rowSelection = useMemo(
    () => ({
      mode: 'multiRow',
      checkboxes: false,
      headerCheckbox: false,
      enableClickSelection: false,
    }),
    [],
  );

  useEffect(() => {
    syncSelection();
  }, [safeTechnicians, syncSelection]);

  const handleGridReady = useCallback(() => {
    syncSelection();
  }, [syncSelection]);

  const handleCellContextMenu = useCallback(
    (params) => {
      if (
        !params.event ||
        !params.data ||
        typeof onContextMenu !== 'function'
      ) {
        return;
      }

      onContextMenu(params.event, params.data);
    },
    [onContextMenu],
  );

  const handleRowClicked = useCallback(
    (params) => {
      const technicianId = params.data?.id;
      const normalizedTechnicianId =
        normalizeIdentifier(technicianId);

      if (
        normalizedTechnicianId === null ||
        typeof onRowClicked !== 'function'
      ) {
        return;
      }

      if (
        Number(params.event?.detail) > 1
      ) {
        return;
      }

      const displayedIds =
        getDisplayedTechnicianIds(
          gridRef.current?.api,
        );

      onRowClicked(
        technicianId,
        params.event || {},
        displayedIds,
      );
    },
    [onRowClicked],
  );

  const handleCellKeyDown = useCallback(
    (params) => {
      const event = params.event;
      const technicianId = params.data?.id;
      const normalizedTechnicianId =
        normalizeIdentifier(technicianId);

      if (
        !event ||
        (event.key !== 'Enter' &&
          event.key !== ' ') ||
        normalizedTechnicianId === null ||
        typeof onRowClicked !== 'function'
      ) {
        return;
      }

      event.preventDefault();

      const displayedIds =
        getDisplayedTechnicianIds(
          gridRef.current?.api,
        );

      onRowClicked(
        technicianId,
        event,
        displayedIds,
      );
    },
    [onRowClicked],
  );

  const handleRowDoubleClicked = useCallback(
    (params) => {
      if (
        !params.data ||
        typeof onRowDoubleClicked !== 'function'
      ) {
        return;
      }

      onRowDoubleClicked(params.data);
    },
    [onRowDoubleClicked],
  );

  return (
    <div
      ref={containerRef}
      className={`ag-theme-fieldopt${
        isDragTarget
          ? ' drop-target-active'
          : ''
      }`}
      style={{
        width: '100%',
        height: '100%',
      }}
      aria-label="Liste des techniciens"
    >
      <AgGridReact
        ref={gridRef}
        rowData={safeTechnicians}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={(params) =>
          getTechnicianRowId(params.data)
        }
        rowSelection={rowSelection}
        animateRows={false}
        headerHeight={28}
        rowHeight={26}
        suppressCellFocus={false}
        onGridReady={handleGridReady}
        onCellContextMenu={
          handleCellContextMenu
        }
        onRowClicked={handleRowClicked}
        onCellKeyDown={handleCellKeyDown}
        onRowDoubleClicked={
          handleRowDoubleClicked
        }
        preventDefaultOnContextMenu
        overlayNoRowsTemplate="Aucun technicien"
      />
    </div>
  );
});

export default TechGrid;
