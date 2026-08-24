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
import { jobOperationalSector } from '../lib/job-sector.js';

ModuleRegistry.registerModules([
  AllCommunityModule,
]);

const TERMINAL_STATUSES = new Set([
  'completed',
  'cancelled',
  'failed',
]);

const STATUS_LABELS = {
  pending: 'En attente',
  assigned: 'Affecté',
  in_progress: 'En cours',
  on_hold: 'En attente',
  completed: 'Terminé',
  cancelled: 'Annulé',
  failed: 'Échoué',
};

const PRIORITY_LABELS = {
  URGENT: 'Urgente',
  HIGH: 'Haute',
  NORMAL: 'Normale',
  LOW: 'Basse',
};

const JOB_TYPE_LABELS = {
  installation: 'Installation',
  repair: 'Réparation',
  maintenance: 'Maintenance',
};

const DATE_FORMATTER = new Intl.DateTimeFormat(
  'fr-FR',
  {
    day: '2-digit',
    month: '2-digit',
  },
);

const NUMBER_FORMATTER = new Intl.NumberFormat(
  'fr-FR',
  {
    maximumFractionDigits: 2,
  },
);

const fallbackRowIds = new WeakMap();
let fallbackRowIdSequence = 0;

function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

function normalizeText(value) {
  if (
    value === null ||
    value === undefined ||
    (typeof value !== 'string' &&
      typeof value !== 'number')
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

function normalizeIdentifier(value) {
  const identifier = normalizeText(value);

  return identifier || null;
}

function normalizeStatus(value) {
  return normalizeComparableText(value);
}

function normalizePriority(value) {
  return normalizeText(value).toUpperCase();
}

function toClassToken(value) {
  return normalizeComparableText(value)
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toFiniteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    typeof value === 'boolean'
  ) {
    return null;
  }

  const parsedValue = Number(value);

  return Number.isFinite(parsedValue)
    ? parsedValue
    : null;
}

function toNonNegativeNumber(value) {
  const parsedValue = toFiniteNumber(value);

  if (parsedValue === null || parsedValue < 0) {
    return null;
  }

  return parsedValue;
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

function getJobRowId(job) {
  const jobId = normalizeIdentifier(job?.id);

  if (jobId !== null) {
    return jobId;
  }

  const jobNumber = normalizeIdentifier(
    job?.job_number,
  );

  if (jobNumber !== null) {
    return `job-number-${jobNumber}`;
  }

  const commandNumber = normalizeIdentifier(
    job?.command_number,
  );

  if (commandNumber !== null) {
    return `command-number-${commandNumber}`;
  }

  if (!isRecord(job)) {
    fallbackRowIdSequence += 1;
    return `job-row-${fallbackRowIdSequence}`;
  }

  const existingFallbackId = fallbackRowIds.get(job);

  if (existingFallbackId) {
    return existingFallbackId;
  }

  fallbackRowIdSequence += 1;

  const fallbackId =
    `job-row-${fallbackRowIdSequence}`;

  fallbackRowIds.set(job, fallbackId);

  return fallbackId;
}

function getJobIdentifier(job) {
  return (
    normalizeIdentifier(job?.job_number) ||
    normalizeIdentifier(job?.command_number) ||
    normalizeIdentifier(job?.id) ||
    '—'
  );
}

function getAssignedTechnicianName(job) {
  return (
    normalizeText(
      job?.assigned_technician_name,
    ) ||
    normalizeText(job?.assigned_tech_name) ||
    normalizeText(job?.technician_name) ||
    null
  );
}

function getAssignedTechnicianId(job) {
  return normalizeIdentifier(
    job?.assigned_tech_id,
  );
}

function hasAssignedTechnicianDisplayData(job) {
  return (
    getAssignedTechnicianName(job) !== null ||
    getAssignedTechnicianId(job) !== null
  );
}

function getAssignedTechnicianLabel(job) {
  const technicianName =
    getAssignedTechnicianName(job);

  if (technicianName !== null) {
    return technicianName;
  }

  const technicianId =
    getAssignedTechnicianId(job);

  return technicianId !== null
    ? `#${technicianId}`
    : 'Non affecté';
}

function getDisplayedJobIds(gridApi) {
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

function getMapValueByIdentifier(map, identifier) {
  if (!(map instanceof Map)) {
    return undefined;
  }

  if (map.has(identifier)) {
    return map.get(identifier);
  }

  const normalizedIdentifier =
    normalizeIdentifier(identifier);

  if (normalizedIdentifier === null) {
    return undefined;
  }

  for (const [key, value] of map.entries()) {
    if (
      normalizeIdentifier(key) ===
      normalizedIdentifier
    ) {
      return value;
    }
  }

  return undefined;
}

function parseTimeToMinutes(value) {
  const normalizedValue = normalizeText(value);
  const match = normalizedValue.match(
    /^(\d{1,2}):(\d{2})(?::\d{2})?$/,
  );

  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
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

function StatusCellRenderer({ value, data }) {
  const normalizedStatus = normalizeStatus(value);

  if (!normalizedStatus) {
    return <EmptyCell />;
  }

  const displayValue =
    normalizedStatus === 'pending' &&
    !hasAssignedTechnicianDisplayData(data)
      ? 'Non affecté'
      : STATUS_LABELS[normalizedStatus] ||
        normalizeText(value)
          .replace(/_/g, ' ')
          .replace(/\s+/g, ' ');

  const statusClass =
    toClassToken(normalizedStatus) || 'unknown';

  return (
    <span
      className={`status-badge status-badge--${statusClass}`}
      title={displayValue}
    >
      {displayValue}
    </span>
  );
}

function PriorityCellRenderer({ value }) {
  const normalizedPriority =
    normalizePriority(value);

  if (!normalizedPriority) {
    return <EmptyCell />;
  }

  const displayValue =
    PRIORITY_LABELS[normalizedPriority] ||
    (/^\d+$/.test(normalizedPriority)
      ? `P${normalizedPriority}`
      : normalizedPriority.replace(/_/g, ' '));

  const priorityClass =
    toClassToken(normalizedPriority) || 'unknown';

  return (
    <span
      className={`priority-cell priority-cell--${priorityClass}`}
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

function TimeSlotCellRenderer({ data }) {
  const start = normalizeText(
    data?.time_slot_start,
  );
  const end = normalizeText(data?.time_slot_end);

  if (!start || !end) {
    return <EmptyCell />;
  }

  const label = `${start}–${end}`;

  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
      }}
      title={label}
    >
      {label}
    </span>
  );
}

function JobTypeCellRenderer({ value }) {
  const normalizedValue = normalizeText(value);

  if (!normalizedValue) {
    return <EmptyCell />;
  }

  const normalizedType =
    normalizeComparableText(normalizedValue);

  const displayValue =
    JOB_TYPE_LABELS[normalizedType] ||
    normalizedValue.replace(/_/g, ' ');

  return (
    <span
      style={{
        textTransform: 'capitalize',
        fontSize: 'var(--font-size-xs)',
      }}
      title={displayValue}
    >
      {displayValue}
    </span>
  );
}

function DurationCellRenderer({ value }) {
  const duration = toNonNegativeNumber(value);

  if (duration === null) {
    return <EmptyCell />;
  }

  const roundedDuration = Math.round(duration);
  const hours = Math.floor(roundedDuration / 60);
  const minutes = roundedDuration % 60;

  const label =
    hours > 0
      ? `${hours}h${
          minutes > 0 ? ` ${minutes}m` : ''
        }`
      : `${minutes}m`;

  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
      }}
      title={label}
    >
      {label}
    </span>
  );
}

function DateCellRenderer({ value }) {
  if (!value) {
    return <EmptyCell />;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return <EmptyCell />;
  }

  const label = DATE_FORMATTER.format(date);

  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--font-size-xs)',
      }}
      title={label}
    >
      {label}
    </span>
  );
}

function formatNumberWithUnit(value, unit) {
  const parsedValue = toFiniteNumber(value);

  if (parsedValue === null) {
    return '—';
  }

  return `${NUMBER_FORMATTER.format(parsedValue)} ${unit}`;
}

const JobGrid = forwardRef(function JobGrid(
  {
    jobs,
    selectedIds = [],
    onRowClicked,
    onContextMenu,
    onDragStart,
    onRowDoubleClicked,
    overrunMap,
    simElapsed,
  },
  ref,
) {
  const gridRef = useRef(null);
  const activePointerCleanupRef = useRef(null);

  const safeJobs = useMemo(
    () =>
      Array.isArray(jobs)
        ? jobs.filter(isRecord)
        : [],
    [jobs],
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
      const jobId = normalizeIdentifier(
        node.data?.id,
      );

      const shouldBeSelected =
        jobId !== null &&
        selectedIdSet.has(jobId);

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
      selectAll: () => {
        gridRef.current?.api?.selectAll();
      },
    }),
    [],
  );

  const columnDefs = useMemo(
    () => [
      {
              headerName: 'DTLI',
              width: 85,
              pinned: 'left',
              sort: 'asc',
              valueGetter: (params) =>
                getJobIdentifier(params.data),
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
              tooltipValueGetter: (params) =>
                getJobIdentifier(params.data),
            },
      {
              field: 'job_type',
              headerName: 'Type',
              width: 100,
              cellRenderer: JobTypeCellRenderer,
            },
      {
              field: 'status',
              headerName: 'Statut',
              width: 110,
              cellRenderer: StatusCellRenderer,
            },
      {
              headerName: 'Technicien',
              width: 130,
              valueGetter: (params) =>
                getAssignedTechnicianLabel(params.data),
              cellStyle: (params) => ({
                fontSize: 'var(--font-size-xs)',
                color:
                  params.value === 'Non affecté'
                    ? 'var(--text-muted)'
                    : 'var(--text-primary)',
              }),
              tooltipValueGetter: (params) =>
                getAssignedTechnicianLabel(params.data),
            },
      {
              field: 'operator',
              headerName: 'Opérateur',
              width: 110,
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              headerName: 'Secteur',
              width: 100,
              valueGetter: (params) =>
                jobOperationalSector(params.data),
              cellStyle: {
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-secondary)',
              },
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'priority',
              headerName: 'Priorité',
              width: 85,
              cellRenderer: PriorityCellRenderer,
            },
      {
              headerName: 'Créneau',
              width: 105,
              cellRenderer: TimeSlotCellRenderer,
              valueGetter: (params) => {
                const start = normalizeText(
                  params.data?.time_slot_start,
                );
                const end = normalizeText(
                  params.data?.time_slot_end,
                );

                return start && end
                  ? `${start}-${end}`
                  : '';
              },
            },
      {
              field: 'customer_name',
              headerName: 'Client',
              minWidth: 140,
              flex: 1,
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'service_address',
              headerName: 'Adresse',
              minWidth: 180,
              flex: 1.5,
              cellStyle: {
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-secondary)',
              },
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'service_city',
              headerName: 'Ville',
              width: 100,
              cellStyle: {
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-secondary)',
              },
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'scheduled_date',
              headerName: 'Date',
              width: 75,
              cellRenderer: DateCellRenderer,
            },
      {
              field: 'estimated_duration',
              headerName: 'Durée',
              width: 75,
              cellRenderer: DurationCellRenderer,
            },
      {
              field: 'nro',
              headerName: 'NRO',
              width: 100,
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'sro',
              headerName: 'SRO',
              width: 100,
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'pbo',
              headerName: 'PBO',
              width: 100,
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'splitter',
              headerName: 'Splitter',
              width: 100,
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'splitter_port',
              headerName: 'Port',
              width: 80,
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
            },
      {
              field: 'pto',
              headerName: 'PTO',
              width: 120,
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'optical_power_dbm',
              headerName: 'Puissance',
              width: 100,
              valueFormatter: (params) =>
                formatNumberWithUnit(params.value, 'dBm'),
            },
      {
              field: 'cable_length_m',
              headerName: 'Câble',
              width: 90,
              valueFormatter: (params) =>
                formatNumberWithUnit(params.value, 'm'),
            },
      {
              field: 'ont_serial',
              headerName: 'ONT',
              width: 180,
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'router_serial',
              headerName: 'Routeur',
              width: 180,
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'mac_address',
              headerName: 'MAC',
              width: 170,
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'validation_status',
              headerName: 'Validation',
              width: 110,
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'failure_reason',
              headerName: 'Motif échec',
              width: 200,
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
              tooltipValueGetter: (params) =>
                normalizeText(params.value) || null,
            },
      {
              field: 'service_zip',
              headerName: 'CP',
              width: 70,
              cellStyle: {
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-muted)',
              },
              valueFormatter: (params) =>
                normalizeText(params.value) || '—',
            },
      {
              field: 'required_skills',
              headerName: 'Compétences',
              minWidth: 150,
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
            }
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
  }, [safeJobs, syncSelection]);

  useEffect(() => {
    return () => {
      activePointerCleanupRef.current?.();
      activePointerCleanupRef.current = null;
    };
  }, []);

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
      const jobId = params.data?.id;
      const normalizedJobId =
        normalizeIdentifier(jobId);

      if (
        normalizedJobId === null ||
        typeof onRowClicked !== 'function'
      ) {
        return;
      }

      if (Number(params.event?.detail) > 1) {
        return;
      }

      const displayedIds = getDisplayedJobIds(
        gridRef.current?.api,
      );

      onRowClicked(
        jobId,
        params.event || {},
        displayedIds,
      );
    },
    [onRowClicked],
  );

  const handleCellKeyDown = useCallback(
    (params) => {
      const event = params.event;
      const jobId = params.data?.id;
      const normalizedJobId =
        normalizeIdentifier(jobId);

      if (
        !event ||
        (event.key !== 'Enter' &&
          event.key !== ' ') ||
        normalizedJobId === null ||
        typeof onRowClicked !== 'function'
      ) {
        return;
      }

      event.preventDefault();

      const displayedIds = getDisplayedJobIds(
        gridRef.current?.api,
      );

      onRowClicked(
        jobId,
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

  const handleMouseDown = useCallback(
    (event) => {
      if (
        event.button !== 0 ||
        typeof onDragStart !== 'function'
      ) {
        return;
      }

      if (
        event.target.closest('.ag-header') ||
        event.target.closest(
          '.ag-horizontal-right-spacer',
        )
      ) {
        return;
      }

      const rowElement =
        event.target.closest('.ag-row');

      if (!rowElement) {
        return;
      }

      const startX = event.clientX;
      const startY = event.clientY;
      let fired = false;

      const cleanup = () => {
        document.removeEventListener(
          'mousemove',
          handleMove,
        );
        document.removeEventListener(
          'mouseup',
          cleanup,
        );

        if (
          activePointerCleanupRef.current ===
          cleanup
        ) {
          activePointerCleanupRef.current = null;
        }
      };

      const handleMove = (moveEvent) => {
        if (fired) {
          return;
        }

        const distance =
          Math.abs(moveEvent.clientX - startX) +
          Math.abs(moveEvent.clientY - startY);

        if (distance <= 8) {
          return;
        }

        fired = true;

        const rowIndex = Number(
          rowElement.getAttribute('row-index'),
        );

        if (
          Number.isInteger(rowIndex) &&
          rowIndex >= 0
        ) {
          const node =
            gridRef.current?.api?.getDisplayedRowAtIndex(
              rowIndex,
            );

          if (node?.data) {
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'grabbing';
            onDragStart(node.data);
          }
        }

        cleanup();
      };

      activePointerCleanupRef.current?.();
      activePointerCleanupRef.current = cleanup;

      document.addEventListener(
        'mousemove',
        handleMove,
      );
      document.addEventListener('mouseup', cleanup);
    },
    [onDragStart],
  );

  const handleTouchStart = useCallback(
    (event) => {
      if (
        typeof onDragStart !== 'function' ||
        event.target.closest('.ag-header')
      ) {
        return;
      }

      const rowElement =
        event.target.closest('.ag-row');
      const initialTouch = event.touches?.[0];

      if (!rowElement || !initialTouch) {
        return;
      }

      const startX = initialTouch.clientX;
      const startY = initialTouch.clientY;
      let timerId = null;
      let fired = false;

      const cleanup = () => {
        if (timerId !== null) {
          window.clearTimeout(timerId);
          timerId = null;
        }

        rowElement.removeEventListener(
          'touchmove',
          handleTouchMove,
        );
        rowElement.removeEventListener(
          'touchend',
          cleanup,
        );
        rowElement.removeEventListener(
          'touchcancel',
          cleanup,
        );

        if (
          activePointerCleanupRef.current ===
          cleanup
        ) {
          activePointerCleanupRef.current = null;
        }
      };

      const handleTouchMove = (moveEvent) => {
        const touch = moveEvent.touches?.[0];

        if (!touch) {
          cleanup();
          return;
        }

        const distance =
          Math.abs(touch.clientX - startX) +
          Math.abs(touch.clientY - startY);

        if (distance > 10) {
          cleanup();
        }
      };

      timerId = window.setTimeout(() => {
        if (fired) {
          return;
        }

        fired = true;

        const rowIndex = Number(
          rowElement.getAttribute('row-index'),
        );

        if (
          Number.isInteger(rowIndex) &&
          rowIndex >= 0
        ) {
          const node =
            gridRef.current?.api?.getDisplayedRowAtIndex(
              rowIndex,
            );

          if (node?.data) {
            navigator.vibrate?.(30);
            onDragStart(node.data);
          }
        }

        cleanup();
      }, 200);

      activePointerCleanupRef.current?.();
      activePointerCleanupRef.current = cleanup;

      rowElement.addEventListener(
        'touchmove',
        handleTouchMove,
        { passive: true },
      );
      rowElement.addEventListener(
        'touchend',
        cleanup,
        { once: true },
      );
      rowElement.addEventListener(
        'touchcancel',
        cleanup,
        { once: true },
      );
    },
    [onDragStart],
  );

  const rowClassRules = useMemo(
    () => ({
      'row--overrun-yellow': (params) =>
        normalizeComparableText(
          getMapValueByIdentifier(
            overrunMap,
            params.data?.id,
          ),
        ) === 'yellow',
      'row--overrun-red': (params) =>
        normalizeComparableText(
          getMapValueByIdentifier(
            overrunMap,
            params.data?.id,
          ),
        ) === 'red',
      'row--overdue': (params) => {
        const elapsedMinutes =
          toNonNegativeNumber(simElapsed);

        if (elapsedMinutes === null) {
          return false;
        }

        const status = normalizeStatus(
          params.data?.status,
        );

        if (TERMINAL_STATUSES.has(status)) {
          return false;
        }

        const slotEndMinutes = parseTimeToMinutes(
          params.data?.time_slot_end,
        );

        if (slotEndMinutes === null) {
          return false;
        }

        const currentSimulationMinutes =
          8 * 60 + elapsedMinutes;

        return (
          currentSimulationMinutes > slotEndMinutes
        );
      },
    }),
    [overrunMap, simElapsed],
  );

  return (
    <div
      className="ag-theme-fieldopt"
      style={{
        width: '100%',
        height: '100%',
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      aria-label="Liste des interventions"
    >
      <AgGridReact
        ref={gridRef}
        rowData={safeJobs}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={(params) =>
          getJobRowId(params.data)
        }
        rowSelection={rowSelection}
        animateRows={false}
        headerHeight={28}
        rowHeight={26}
        suppressCellFocus={false}
        rowClassRules={rowClassRules}
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
        overlayNoRowsTemplate={
          '<div class="intervention-grid-empty">' +
          '<strong>Aucune intervention pour cette journée</strong>' +
          '<span>Modifiez la date, retirez les filtres ou importez les interventions.</span>' +
          '</div>'
        }
      />
    </div>
  );
});

export default JobGrid;
