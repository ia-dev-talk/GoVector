import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { api, FILES_URL } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import FloatingWindow from './FloatingWindow';

const TABS = [
  { id: 'general', label: 'Général', icon: '📋' },
  { id: 'reseau', label: 'Réseau FTTH', icon: '🌐' },
  { id: 'timeline', label: 'Timeline', icon: '⏱' },
  { id: 'photos', label: 'Photos', icon: '📸' },
  { id: 'stock', label: 'Stock', icon: '📦' },
  { id: 'journal', label: 'Journal', icon: '📝' },
  { id: 'commentaires', label: 'Commentaires', icon: '💬' },
  { id: 'kpi', label: 'KPI', icon: '📊' },
];

const STATUS_LABELS = {
  pending: 'En attente',
  assigned: 'Affectée',
  en_route: 'En route',
  on_site: 'Sur site',
  work_in_progress: 'Travail en cours',
  in_progress: 'En cours',
  installation_done: 'Installation terminée',
  client_validation: 'Validation client',
  en_attente_validation: 'En attente de validation',
  completed: 'Terminée',
  cancelled: 'Annulée',
  failed: 'Échec',
  client_absent: 'Client absent',
  postponed: 'Reportée',
  suspended: 'Suspendue',
  on_hold: 'En attente',
  created: 'Création',
  updated: 'Modification',
  deleted: 'Suppression',
  assigned_action: 'Affectation',
  reassigned: 'Réaffectation',
  unassigned: 'Désaffectation',
  started: 'Démarrage',
  status_changed: 'Changement de statut',
  stock_consumed: 'Consommation de stock',
};

const STATUS_ICONS = {
  pending: '⏳',
  assigned: '👤',
  en_route: '🚗',
  on_site: '📍',
  work_in_progress: '🔧',
  in_progress: '⚡',
  installation_done: '✅',
  client_validation: '✍️',
  en_attente_validation: '⏳',
  completed: '🎉',
  cancelled: '❌',
  failed: '🔴',
  client_absent: '🚫',
  postponed: '📅',
  suspended: '⏸️',
  on_hold: '⏹️',
};

const ACTIVITY_TYPES = {
  created: 'success',
  assigned: 'info',
  reassigned: 'info',
  unassigned: 'warning',
  started: 'info',
  completed: 'success',
  cancelled: 'danger',
  deleted: 'danger',
  failed: 'danger',
  postponed: 'warning',
  suspended: 'warning',
  status_changed: 'info',
  stock_consumed: 'info',
};

const NETWORK_ITEMS = [
  { icon: '🏢', label: 'NRO', field: 'nro' },
  { icon: '🏗️', label: 'SRO', field: 'sro' },
  { icon: '📦', label: 'PBO', field: 'pbo' },
  {
    icon: '🔀',
    label: 'Splitter',
    field: 'splitter',
    extraField: 'splitter_port',
  },
  { icon: '🔌', label: 'PTO', field: 'pto' },
  {
    icon: '📡',
    label: 'ONT',
    field: 'ont_serial',
    mono: true,
  },
  {
    icon: '📶',
    label: 'Routeur',
    field: 'router_serial',
    mono: true,
  },
];

const PHOTO_FIELDS = [
  { label: 'Avant', field: 'before_photo' },
  { label: 'Après', field: 'after_photo' },
];

const EMPTY_STYLE = {
  padding: 20,
  textAlign: 'center',
  color: 'var(--text-muted)',
};

const ERROR_STYLE = {
  padding: '8px 10px',
  borderRadius: 4,
  border: '1px solid var(--color-danger)',
  background: 'var(--color-danger-dim)',
  color: 'var(--color-danger)',
  fontSize: 11,
};

const WARNING_STYLE = {
  padding: '8px 10px',
  borderRadius: 4,
  border: '1px solid var(--color-warning)',
  background: 'var(--color-warning-dim)',
  color: 'var(--color-warning)',
  fontSize: 11,
};

const SUCCESS_STYLE = {
  padding: '8px 10px',
  borderRadius: 4,
  border: '1px solid var(--color-success)',
  background: 'var(--color-success-dim)',
  color: 'var(--color-success)',
  fontSize: 11,
};

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const TIME_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
});

const NUMBER_FORMATTER = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 2,
});

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
    typeof value === 'boolean'
  ) {
    return '';
  }

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
    .toLowerCase();
}

function normalizeIdentifier(value) {
  return normalizeText(value);
}

function normalizeStatus(value) {
  return normalizeComparableText(value).replace(/\s+/g, '_');
}

function normalizeJobType(value) {
  const normalized = normalizeComparableText(value);

  return normalized
    ? normalized.replace(/\s+/g, '_').toUpperCase()
    : '';
}

function displayValue(value) {
  return normalizeText(value) || '—';
}

function parseFiniteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    typeof value === 'boolean'
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function parsePositiveInteger(value) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
}

function formatNumber(value) {
  const parsed = parseFiniteNumber(value);

  return parsed === null
    ? '—'
    : NUMBER_FORMATTER.format(parsed);
}

function formatQuantity(value) {
  const parsed = parseFiniteNumber(value);

  return parsed === null
    ? '—'
    : NUMBER_FORMATTER.format(parsed);
}

function formatMinutes(value) {
  const parsed = parseFiniteNumber(value);

  if (parsed === null || parsed < 0) {
    return '—';
  }

  return `${NUMBER_FORMATTER.format(parsed)} min`;
}

function formatCoordinate(value) {
  const parsed = parseFiniteNumber(value);

  return parsed === null ? '—' : parsed.toFixed(6);
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? '—'
    : DATE_TIME_FORMATTER.format(date);
}

function formatDate(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? '—'
    : DATE_FORMATTER.format(date);
}

function formatTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? '—'
    : TIME_FORMATTER.format(date);
}

function formatSlot(start, end) {
  const startText = normalizeText(start);
  const endText = normalizeText(end);

  if (!startText || !endText) {
    return '—';
  }

  return `${startText}–${endText}`;
}

function getStatusLabel(value) {
  const normalized = normalizeStatus(value);

  if (!normalized) {
    return '—';
  }

  if (
    normalized === 'assigned' &&
    normalizeComparableText(value).includes('action')
  ) {
    return STATUS_LABELS.assigned_action;
  }

  const knownLabel = STATUS_LABELS[normalized];

  if (knownLabel) {
    return knownLabel;
  }

  const fallback = normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');

  return fallback
    ? `${fallback.charAt(0).toUpperCase()}${fallback.slice(1)}`
    : '—';
}

function getStatusIcon(value) {
  return STATUS_ICONS[normalizeStatus(value)] || '';
}

function getStatusClass(value) {
  return (
    normalizeStatus(value)
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  );
}

function getApiErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }

  const message = error?.response?.data?.message;

  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }

  return fallback;
}

function buildFileUrl(pathValue) {
  const path = normalizeText(pathValue);

  if (!path) {
    return null;
  }

  try {
    const absoluteUrl = new URL(path);

    return absoluteUrl.protocol === 'http:' ||
      absoluteUrl.protocol === 'https:'
      ? absoluteUrl.toString()
      : null;
  } catch {
    const base = normalizeText(FILES_URL);

    if (!base) {
      return null;
    }

    try {
      const baseUrl = new URL(
        base.endsWith('/') ? base : `${base}/`,
      );

      if (
        baseUrl.protocol !== 'http:' &&
        baseUrl.protocol !== 'https:'
      ) {
        return null;
      }

      return new URL(
        path.replace(/^\/+/, ''),
        baseUrl,
      ).toString();
    } catch {
      return null;
    }
  }
}

function getActivityKey(activity, index) {
  return (
    normalizeIdentifier(activity?.id) ||
    [
      'activity',
      normalizeText(activity?.created_at) || 'unknown-date',
      normalizeText(activity?.action) || 'unknown-action',
      index,
    ].join(':')
  );
}

function getStockRowKey(item, index) {
  return (
    normalizeIdentifier(item?.item_id) ||
    normalizeIdentifier(item?.id) ||
    [
      'stock',
      normalizeText(item?.reference) || 'unknown',
      index,
    ].join(':')
  );
}

function getRecordedDuration(job) {
  return (
    parseFiniteNumber(job?.actual_duration_minutes) ??
    parseFiniteNumber(job?.real_duration_minutes)
  );
}

function getEquipmentEntries(job) {
  if (!isRecord(job)) {
    return [];
  }

  return [
    { label: 'ONT', value: job.ont_serial },
    { label: 'Routeur', value: job.router_serial },
    { label: 'MAC', value: job.mac_address },
    { label: 'WiFi Box', value: job.wifi_box_serial },
  ].filter((item) => normalizeText(item.value));
}

function DetailSection({ title, children, style }) {
  return (
    <div className="ie-detail-section" style={style}>
      <div className="ie-detail-section-title">
        {title}
      </div>
      {children}
    </div>
  );
}

function DetailField({
  label,
  value,
  mono = false,
  fullWidth = false,
  valueStyle,
}) {
  return (
    <div
      style={
        fullWidth
          ? { gridColumn: '1 / -1', minWidth: 0 }
          : { minWidth: 0 }
      }
    >
      <span>{label}</span>
      <strong
        className={mono ? 'ie-detail-mono' : undefined}
        style={{
          overflowWrap: 'anywhere',
          ...valueStyle,
        }}
      >
        {value}
      </strong>
    </div>
  );
}

function ErrorMessage({ children, onRetry, retryDisabled }) {
  if (!children) {
    return null;
  }

  return (
    <div
      role="alert"
      style={{
        ...ERROR_STYLE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span>{children}</span>
      {typeof onRetry === 'function' && (
        <button
          type="button"
          className="btn btn--sm"
          onClick={onRetry}
          disabled={retryDisabled}
        >
          Réessayer
        </button>
      )}
    </div>
  );
}

export default function JobDetailPanel({
  job: initialJob,
  onClose,
  onDelete,
  onEdit,
}) {
  const initialJobId = normalizeIdentifier(initialJob?.id);

  const [tab, setTab] = useState('general');
  const [job, setJob] = useState(
    isRecord(initialJob) ? initialJob : null,
  );
  const [activities, setActivities] = useState([]);

  const [jobLoading, setJobLoading] = useState(
    Boolean(initialJobId),
  );
  const [timelineLoading, setTimelineLoading] = useState(
    Boolean(initialJobId),
  );
  const [jobError, setJobError] = useState(null);
  const [timelineError, setTimelineError] = useState(null);

  const [jobStock, setJobStock] = useState(null);
  const [jobStockLoading, setJobStockLoading] = useState(
    Boolean(initialJobId),
  );
  const [jobStockError, setJobStockError] = useState(null);

  const [consumeLoading, setConsumeLoading] = useState(false);
  const [consumeError, setConsumeError] = useState(null);
  const [consumeSuccess, setConsumeSuccess] = useState(null);
  const [consumeForm, setConsumeForm] = useState({
    item_id: '',
    quantity: 1,
    serial_number: '',
  });

  const dataRequestSequenceRef = useRef(0);
  const stockRequestSequenceRef = useRef(0);
  const consumeRequestSequenceRef = useRef(0);

  const jobId =
    initialJobId || normalizeIdentifier(job?.id);

  const refreshJobData = useCallback(
    async ({ showLoading = false } = {}) => {
      if (!jobId) {
        return;
      }

      const requestSequence =
        dataRequestSequenceRef.current + 1;

      dataRequestSequenceRef.current = requestSequence;

      if (showLoading) {
        setJobLoading(true);
        setTimelineLoading(true);
      }

      setJobError(null);
      setTimelineError(null);

      const [jobResult, timelineResult] =
        await Promise.allSettled([
          api.getJob(jobId),
          api.getJobTimeline(jobId),
        ]);

      if (
        requestSequence !==
        dataRequestSequenceRef.current
      ) {
        return;
      }

      if (
        jobResult.status === 'fulfilled' &&
        isRecord(jobResult.value?.data)
      ) {
        setJob(jobResult.value.data);
      } else {
        const error =
          jobResult.status === 'rejected'
            ? jobResult.reason
            : null;

        if (error) {
          console.error(
            'Erreur de chargement de l’intervention :',
            error,
          );
        }

        setJobError(
          getApiErrorMessage(
            error,
            'Impossible de charger les dernières données de l’intervention.',
          ),
        );
      }

      if (
        timelineResult.status === 'fulfilled' &&
        Array.isArray(timelineResult.value?.data)
      ) {
        setActivities(
          timelineResult.value.data.filter(isRecord),
        );
      } else {
        const error =
          timelineResult.status === 'rejected'
            ? timelineResult.reason
            : null;

        if (error) {
          console.error(
            'Erreur de chargement de la timeline :',
            error,
          );
        }

        setTimelineError(
          getApiErrorMessage(
            error,
            'Impossible de charger la timeline de l’intervention.',
          ),
        );
      }

      if (
        showLoading &&
        requestSequence ===
          dataRequestSequenceRef.current
      ) {
        setJobLoading(false);
        setTimelineLoading(false);
      }
    },
    [jobId],
  );

  const refreshJobStock = useCallback(
    async ({ showLoading = false } = {}) => {
      if (!jobId) {
        return;
      }

      const requestSequence =
        stockRequestSequenceRef.current + 1;

      stockRequestSequenceRef.current = requestSequence;

      if (showLoading) {
        setJobStockLoading(true);
      }

      setJobStockError(null);

      try {
        const response = await api.getJobStock(jobId);

        if (
          requestSequence !==
          stockRequestSequenceRef.current
        ) {
          return;
        }

        if (!isRecord(response?.data)) {
          setJobStock(null);
          setJobStockError(
            'La réponse reçue pour le stock est invalide.',
          );
          return;
        }

        setJobStock(response.data);
      } catch (error) {
        if (
          requestSequence !==
          stockRequestSequenceRef.current
        ) {
          return;
        }

        console.error(
          'Erreur de chargement du stock :',
          error,
        );

        setJobStockError(
          getApiErrorMessage(
            error,
            'Impossible de charger le stock associé à cette intervention.',
          ),
        );
      } finally {
        if (
          showLoading &&
          requestSequence ===
            stockRequestSequenceRef.current
        ) {
          setJobStockLoading(false);
        }
      }
    },
    [jobId],
  );

  useEffect(() => {
    dataRequestSequenceRef.current += 1;
    stockRequestSequenceRef.current += 1;
    consumeRequestSequenceRef.current += 1;

    setTab('general');
    setJob(isRecord(initialJob) ? initialJob : null);
    setActivities([]);
    setJobError(null);
    setTimelineError(null);
    setJobStock(null);
    setJobStockError(null);
    setConsumeLoading(false);
    setConsumeError(null);
    setConsumeSuccess(null);
    setConsumeForm({
      item_id: '',
      quantity: 1,
      serial_number: '',
    });

    if (!jobId) {
      setJobLoading(false);
      setTimelineLoading(false);
      setJobStockLoading(false);
      return undefined;
    }

    refreshJobData({ showLoading: true });
    refreshJobStock({ showLoading: true });

    return () => {
      dataRequestSequenceRef.current += 1;
      stockRequestSequenceRef.current += 1;
      consumeRequestSequenceRef.current += 1;
    };
  }, [initialJob, jobId, refreshJobData, refreshJobStock]);

  const handleRealtimeEvent = useCallback(
    (eventType, eventData) => {
      if (!jobId) {
        return;
      }

      const normalizedEventType =
        normalizeComparableText(eventType);

      const eventJobId = normalizeIdentifier(
        eventData?.job_id,
      );

      const isJobEvent =
        normalizedEventType.startsWith('job_') ||
        normalizedEventType.startsWith('job:');

      if (
        !isJobEvent ||
        !eventJobId ||
        eventJobId !== jobId
      ) {
        return;
      }

      refreshJobData();
      refreshJobStock();
    },
    [jobId, refreshJobData, refreshJobStock],
  );

  useWebSocket(null, {
    onEvent: handleRealtimeEvent,
  });

  const safeActivities = useMemo(
    () =>
      Array.isArray(activities)
        ? activities.filter(isRecord)
        : [],
    [activities],
  );

  const stockItems = useMemo(() => {
    const vehicleStock = jobStock?.vehicle_stock;

    return Array.isArray(vehicleStock)
      ? vehicleStock.filter(isRecord)
      : [];
  }, [jobStock]);

  const stockCounts = useMemo(() => {
    const counts = jobStock?.stock_summary?.counts;

    if (!isRecord(counts)) {
      return [];
    }

    return Object.entries(counts)
      .map(([type, quantity]) => ({
        type: normalizeText(type),
        quantity: parseFiniteNumber(quantity),
      }))
      .filter(
        ({ type, quantity }) =>
          Boolean(type) && quantity !== null,
      )
      .sort((first, second) =>
        first.type.localeCompare(second.type, 'fr', {
          sensitivity: 'base',
        }),
      );
  }, [jobStock]);

  const equipmentEntries = useMemo(
    () => getEquipmentEntries(job),
    [job],
  );

  const availablePhotos = useMemo(() => {
    if (!isRecord(job)) {
      return [];
    }

    return PHOTO_FIELDS.map((photo) => ({
      ...photo,
      url: buildFileUrl(job[photo.field]),
    })).filter((photo) => photo.url);
  }, [job]);

  const signatureUrl = useMemo(
    () => buildFileUrl(job?.client_signature),
    [job?.client_signature],
  );

  const handleConsume = useCallback(async () => {
    if (
      consumeLoading ||
      !jobId
    ) {
      return;
    }

    const itemId = parsePositiveInteger(
      consumeForm.item_id,
    );
    const quantity = parsePositiveInteger(
      consumeForm.quantity,
    );

    if (itemId === null || quantity === null) {
      setConsumeError(
        'Sélectionnez un article et une quantité valide.',
      );
      setConsumeSuccess(null);
      return;
    }

    const selectedStockItem = stockItems.find(
      (item) =>
        normalizeIdentifier(item.item_id) ===
        String(itemId),
    );

    if (!selectedStockItem) {
      setConsumeError(
        'L’article sélectionné n’est plus disponible dans le stock chargé.',
      );
      setConsumeSuccess(null);
      return;
    }

    const availableQuantity = parseFiniteNumber(
      selectedStockItem.available_quantity,
    );

    if (
      availableQuantity !== null &&
      availableQuantity < 1
    ) {
      setConsumeError(
        'Cet article n’est plus disponible.',
      );
      setConsumeSuccess(null);
      return;
    }

    if (
      availableQuantity !== null &&
      quantity > availableQuantity
    ) {
      setConsumeError(
        'La quantité demandée dépasse le stock disponible.',
      );
      setConsumeSuccess(null);
      return;
    }

    const item = {
      item_id: itemId,
      quantity,
    };

    const serialNumber = normalizeText(
      consumeForm.serial_number,
    );

    if (serialNumber) {
      item.serial_number = serialNumber;
    }

    const requestSequence =
      consumeRequestSequenceRef.current + 1;

    consumeRequestSequenceRef.current = requestSequence;

    setConsumeLoading(true);
    setConsumeError(null);
    setConsumeSuccess(null);

    try {
      await api.consumeJobStock(jobId, [item]);

      if (
        requestSequence !==
        consumeRequestSequenceRef.current
      ) {
        return;
      }

      setConsumeForm({
        item_id: '',
        quantity: 1,
        serial_number: '',
      });
      setConsumeSuccess('Matériel consommé.');

      await Promise.all([
        refreshJobStock(),
        refreshJobData(),
      ]);
    } catch (error) {
      if (
        requestSequence !==
        consumeRequestSequenceRef.current
      ) {
        return;
      }

      console.error(
        'Erreur lors de la consommation du stock :',
        error,
      );

      setConsumeError(
        getApiErrorMessage(
          error,
          'La consommation du matériel a échoué.',
        ),
      );
    } finally {
      if (
        requestSequence ===
        consumeRequestSequenceRef.current
      ) {
        setConsumeLoading(false);
      }
    }
  }, [
    consumeForm,
    consumeLoading,
    jobId,
    refreshJobData,
    refreshJobStock,
    stockItems,
  ]);

  if (!job) {
    return null;
  }

  const interventionReference =
    normalizeText(job.job_number) ||
    normalizeText(job.id) ||
    '—';

  const customerName = normalizeText(job.customer_name);

  const windowTitle = customerName
    ? `Intervention #${interventionReference} — ${customerName}`
    : `Intervention #${interventionReference}`;

  const renderGeneral = () => {
    const status = normalizeStatus(job.status);
    const statusIcon = getStatusIcon(status);
    const jobType = normalizeText(job.job_type);
    const priority = normalizeText(job.priority);

    return (
      <div>
        {jobError && (
          <ErrorMessage
            onRetry={() =>
              refreshJobData({ showLoading: true })
            }
            retryDisabled={jobLoading}
          >
            {jobError}
          </ErrorMessage>
        )}

        <div
          className="ie-detail-badges"
          style={{ marginTop: jobError ? 10 : 0 }}
        >
          <span
            className={`status-badge status-badge--${getStatusClass(
              status,
            )}`}
          >
            {statusIcon && (
              <span
                aria-hidden="true"
                style={{ marginRight: 4 }}
              >
                {statusIcon}
              </span>
            )}
            {getStatusLabel(status)}
          </span>

          {jobType && (
            <span className="ie-detail-badge ie-detail-badge--type">
              {jobType}
            </span>
          )}

          {priority && (
            <span className="ie-detail-badge ie-detail-badge--prio">
              Priorité {priority}
            </span>
          )}
        </div>

        <DetailSection title="Client">
          <div className="ie-detail-grid">
            <DetailField
              label="Nom"
              value={displayValue(job.customer_name)}
            />
            <DetailField
              label="Téléphone"
              value={displayValue(job.customer_phone)}
            />
            <DetailField
              label="Email"
              value={displayValue(job.customer_email)}
            />
            <DetailField
              label="Opérateur"
              value={displayValue(job.operator)}
            />
          </div>
        </DetailSection>

        <DetailSection title="Adresse">
          <div className="ie-detail-grid">
            <DetailField
              label="Adresse"
              value={displayValue(job.service_address)}
              fullWidth
            />
            <DetailField
              label="Ville"
              value={displayValue(job.service_city)}
            />
            <DetailField
              label="Zone"
              value={displayValue(job.route_criteria)}
            />
            <DetailField
              label="Latitude site"
              value={formatCoordinate(
                job.latitude,
              )}
              mono
            />
            <DetailField
              label="Longitude site"
              value={formatCoordinate(
                job.longitude,
              )}
              mono
            />
          </div>
        </DetailSection>

        <DetailSection title="Affectation">
          <div className="ie-detail-grid">
            <DetailField
              label="Technicien"
              value={displayValue(
                job.assigned_tech_name ??
                  job.assigned_technician_name,
              )}
            />
            <DetailField
              label="Date"
              value={formatDate(job.scheduled_date)}
            />
            <DetailField
              label="Créneau"
              value={formatSlot(
                job.time_slot_start,
                job.time_slot_end,
              )}
              mono
            />
            <DetailField
              label="Durée"
              value={formatMinutes(job.estimated_duration)}
            />
          </div>
        </DetailSection>

        {normalizeText(job.description) && (
          <DetailSection title="Description">
            <div className="ie-detail-text">
              {job.description}
            </div>
          </DetailSection>
        )}

        {normalizeText(job.special_instructions) && (
          <DetailSection title="Instructions spéciales">
            <div
              className="ie-detail-text"
              style={{ color: 'var(--color-warning)' }}
            >
              {job.special_instructions}
            </div>
          </DetailSection>
        )}

        {normalizeText(job.notes) && (
          <DetailSection title="Notes">
            <div className="ie-detail-text">
              {job.notes}
            </div>
          </DetailSection>
        )}

        <DetailSection title="Horodatage">
          <div className="ie-detail-grid">
            <DetailField
              label="Créée"
              value={formatDateTime(job.created_at)}
              mono
            />
            <DetailField
              label="Démarrée"
              value={formatDateTime(job.started_at)}
              mono
            />
            <DetailField
              label="Terminée"
              value={formatDateTime(job.completed_at)}
              mono
            />
            <DetailField
              label="Dernière modification"
              value={formatDateTime(job.updated_at)}
              mono
            />
          </div>
        </DetailSection>

        {(typeof onEdit === 'function' ||
          typeof onDelete === 'function') && (
          <div
            className="ie-detail-actions"
            style={{ flexWrap: 'wrap' }}
          >
            {typeof onEdit === 'function' && (
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => onEdit(job)}
              >
                ✏️ Modifier
              </button>
            )}

            {typeof onDelete === 'function' && (
              <button
                type="button"
                className="btn btn--sm btn--danger"
                onClick={() => {
                  const confirmed = window.confirm(
                    `Supprimer définitivement l’intervention #${interventionReference} ?`,
                  );

                  if (confirmed) {
                    onDelete(job);
                  }
                }}
              >
                🗑 Supprimer
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderReseau = () => {
    const jobType = normalizeJobType(job.job_type);
    const opticalPower = parseFiniteNumber(
      job.optical_power_dbm,
    );
    const cableLength = parseFiniteNumber(
      job.cable_length_m,
    );

    return (
      <div>
        <div
          className="ie-detail-section-title"
          style={{ marginBottom: 12 }}
        >
          Architecture réseau FTTH
        </div>

        <div
          className="ftth-tree"
          style={{ padding: 0 }}
        >
          {NETWORK_ITEMS.map((item, index) => {
            const value = normalizeText(job[item.field]);
            const extraValue = item.extraField
              ? normalizeText(job[item.extraField])
              : '';

            return (
              <div
                key={item.field}
                style={{ width: '100%', maxWidth: '100%' }}
              >
                <div
                  className="ftth-tree-node"
                  style={{ cursor: 'default' }}
                >
                  <span className="ftth-tree-node-icon">
                    {item.icon}
                  </span>
                  <span className="ftth-tree-node-label">
                    {item.label}
                  </span>
                  <span
                    className="ftth-tree-node-value"
                    style={
                      item.mono
                        ? {
                            fontFamily: 'var(--font-mono)',
                            fontSize: 12,
                          }
                        : undefined
                    }
                  >
                    {value || '—'}
                  </span>
                  {extraValue && (
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                      }}
                    >
                      Port {extraValue}
                    </span>
                  )}
                </div>

                {index < NETWORK_ITEMS.length - 1 && (
                  <div
                    className="ftth-tree-arrow"
                    style={{ textAlign: 'center' }}
                    aria-hidden="true"
                  >
                    ⬇
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DetailSection
          title="Mesures et paramètres"
          style={{ marginTop: 16 }}
        >
          <div className="ie-detail-grid">
            <DetailField
              label="Puissance optique"
              value={
                opticalPower === null
                  ? '—'
                  : `${formatNumber(opticalPower)} dBm`
              }
              mono
            />
            <DetailField
              label="Longueur câble"
              value={
                cableLength === null
                  ? '—'
                  : `${formatNumber(cableLength)} m`
              }
            />
            <DetailField
              label="Type câble"
              value={displayValue(job.type_cable)}
            />
            <DetailField
              label="MAC"
              value={displayValue(job.mac_address)}
              mono
            />
            <DetailField
              label="Fibres"
              value={displayValue(job.nombre_fibres)}
            />
            <DetailField
              label="Boîtier"
              value={displayValue(job.boite_raccordement)}
            />
            <DetailField
              label="Réserve câble"
              value={displayValue(job.reserve_cable)}
            />
          </div>
        </DetailSection>

        {jobType === 'DEPANNAGE' && (
          <DetailSection title="Dépannage">
            <div className="ie-detail-grid">
              <DetailField
                label="Ticket"
                value={displayValue(job.ticket_number)}
              />
              <DetailField
                label="Type de panne"
                value={displayValue(job.panne_type)}
              />
            </div>

            {normalizeText(job.manipulations_realisees) && (
              <div
                className="ie-detail-text"
                style={{ marginTop: 8 }}
              >
                {job.manipulations_realisees}
              </div>
            )}
          </DetailSection>
        )}

        {jobType === 'MIGRATION' && (
          <DetailSection title="Migration">
            <div className="ie-detail-grid">
              <DetailField
                label="Ancien opérateur"
                value={displayValue(job.ancien_operateur)}
              />
              <DetailField
                label="Nouvel opérateur"
                value={displayValue(job.nouvel_operateur)}
              />
              <DetailField
                label="Ancien ONT"
                value={displayValue(job.ancien_ont_serial)}
                mono
              />
              <DetailField
                label="Port source"
                value={displayValue(job.port_source)}
              />
              <DetailField
                label="Port destination"
                value={displayValue(job.port_destination)}
              />
            </div>
          </DetailSection>
        )}

        {jobType === 'AUDIT' && (
          <DetailSection title="Audit">
            <div className="ie-detail-grid">
              <DetailField
                label="État PBO"
                value={displayValue(job.etat_pbo)}
              />
              <DetailField
                label="État PTO"
                value={displayValue(job.etat_pto)}
              />
              <DetailField
                label="État câble"
                value={displayValue(job.etat_cable)}
              />
            </div>

            {normalizeText(job.anomalies) && (
              <div
                className="ie-detail-text"
                style={{ marginTop: 8 }}
              >
                {job.anomalies}
              </div>
            )}
          </DetailSection>
        )}

        {normalizeText(job.validation_status) && (
          <DetailSection title="Validation">
            <div className="ie-detail-grid">
              <DetailField
                label="Statut"
                value={displayValue(job.validation_status)}
              />
              {normalizeText(job.failure_reason) && (
                <DetailField
                  label="Motif"
                  value={job.failure_reason}
                  fullWidth
                  valueStyle={{ color: 'var(--color-danger)' }}
                />
              )}
            </div>
          </DetailSection>
        )}
      </div>
    );
  };

  const renderTimeline = () => {
    if (timelineLoading && safeActivities.length === 0) {
      return <div style={EMPTY_STYLE}>Chargement…</div>;
    }

    return (
      <div>
        <div
          className="ie-detail-section-title"
          style={{ marginBottom: 12 }}
        >
          Journal d’activité
        </div>

        {timelineError && (
          <ErrorMessage
            onRetry={() =>
              refreshJobData({ showLoading: true })
            }
            retryDisabled={timelineLoading}
          >
            {timelineError}
          </ErrorMessage>
        )}

        {safeActivities.length === 0 ? (
          <div className="ie-tl-empty">
            Aucune activité enregistrée
          </div>
        ) : (
          <div
            className="ie-tl-list"
            style={{ marginTop: timelineError ? 10 : 0 }}
          >
            {safeActivities.map((activity, index) => {
              const action = normalizeStatus(
                activity.action,
              );
              const type =
                ACTIVITY_TYPES[action] || 'info';
              const isLast =
                index === safeActivities.length - 1;
              const description = normalizeText(
                activity.description,
              );

              return (
                <div
                  key={getActivityKey(activity, index)}
                  className={`ie-tl-item ie-tl-item--${type}`}
                >
                  <div className="ie-tl-dot" />
                  {!isLast && (
                    <div className="ie-tl-line" />
                  )}
                  <span className="ie-tl-time">
                    {formatTime(activity.created_at)}
                  </span>
                  <div className="ie-tl-content">
                    <div className="ie-tl-msg">
                      <strong>
                        {getStatusLabel(
                          action === 'assigned'
                            ? 'assigned_action'
                            : action,
                        )}
                      </strong>
                      {description && ` — ${description}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderPhotos = () => (
    <div>
      <div
        className="ie-detail-section-title"
        style={{ marginBottom: 12 }}
      >
        Photos de l’intervention
      </div>

      {availablePhotos.length === 0 ? (
        <div style={EMPTY_STYLE}>
          Aucune photo exploitable
        </div>
      ) : (
        <div
          className="ie-detail-photos"
          style={{ flexDirection: 'column' }}
        >
          {availablePhotos.map((photo) => (
            <a
              key={photo.field}
              className="ie-detail-photo-link"
              href={photo.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              📷 Photo {photo.label}
            </a>
          ))}
        </div>
      )}

      {signatureUrl && (
        <DetailSection
          title="Signature client"
          style={{ marginTop: 16 }}
        >
          <a
            className="ie-detail-photo-link"
            href={signatureUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            ✍️ Voir la signature
          </a>
        </DetailSection>
      )}
    </div>
  );

  const renderRegisteredEquipment = () => {
    if (equipmentEntries.length === 0) {
      return (
        <div className="ie-detail-text">
          Aucun équipement enregistré.
        </div>
      );
    }

    return (
      <div className="ie-detail-grid">
        {equipmentEntries.map((item) => (
          <DetailField
            key={item.label}
            label={item.label}
            value={item.value}
            mono
          />
        ))}
      </div>
    );
  };

  const renderStock = () => {
    if (jobStockLoading && !jobStock) {
      return (
        <div style={EMPTY_STYLE}>
          Chargement du stock…
        </div>
      );
    }

    const technicianId = normalizeIdentifier(
      jobStock?.technician_id,
    );

    if (!jobStock || !technicianId) {
      return (
        <div>
          <div
            className="ie-detail-section-title"
            style={{ marginBottom: 12 }}
          >
            Matériel enregistré
          </div>

          {renderRegisteredEquipment()}

          <div style={{ marginTop: 10 }}>
            {jobStockError ? (
              <ErrorMessage
                onRetry={() =>
                  refreshJobStock({ showLoading: true })
                }
                retryDisabled={jobStockLoading}
              >
                {jobStockError}
              </ErrorMessage>
            ) : (
              <div style={WARNING_STYLE}>
                Aucun stock technicien associé à cette
                intervention.
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div>
        {jobStockError && (
          <ErrorMessage
            onRetry={() =>
              refreshJobStock({ showLoading: true })
            }
            retryDisabled={jobStockLoading}
          >
            {jobStockError}
          </ErrorMessage>
        )}

        <DetailSection
          title={`Stock embarqué — ${displayValue(
            jobStock.technician_name,
          )}`}
          style={{ marginTop: jobStockError ? 10 : 0 }}
        >
          {stockItems.length === 0 ? (
            <div style={EMPTY_STYLE}>
              Aucun article disponible dans le stock chargé.
            </div>
          ) : (
            <>
              {stockCounts.length > 0 && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(100px, 1fr))',
                    gap: 8,
                    marginBottom: 10,
                  }}
                >
                  {stockCounts.map(({ type, quantity }) => (
                    <div
                      key={type}
                      style={{
                        padding: '6px 8px',
                        borderRadius: 4,
                        background:
                          'var(--surface-panel-alt)',
                        textAlign: 'center',
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: 'var(--color-accent)',
                        }}
                      >
                        {formatQuantity(quantity)}
                      </div>
                      <div
                        title={type}
                        style={{
                          fontSize: 9,
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {type}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <div
                  style={{
                    minWidth: 650,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 3,
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'minmax(0, 2fr) 1.2fr repeat(3, minmax(65px, 0.8fr))',
                      gap: 8,
                      padding: '4px 8px',
                      color: 'var(--text-muted)',
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    <span>Article</span>
                    <span>Type</span>
                    <span style={{ textAlign: 'right' }}>
                      Total
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      Disponible
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      Réservé
                    </span>
                  </div>

                  {stockItems.map((stockItem, index) => {
                    const totalQuantity = parseFiniteNumber(
                      stockItem.quantity,
                    );
                    const availableQuantity =
                      parseFiniteNumber(
                        stockItem.available_quantity,
                      );
                    const reservedQuantity =
                      parseFiniteNumber(
                        stockItem.reserved_quantity,
                      );

                    const isLowStock =
                      availableQuantity !== null &&
                      availableQuantity <= 2;

                    return (
                      <div
                        key={getStockRowKey(stockItem, index)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'minmax(0, 2fr) 1.2fr repeat(3, minmax(65px, 0.8fr))',
                          gap: 8,
                          alignItems: 'center',
                          padding: '5px 8px',
                          background: isLowStock
                            ? 'var(--color-warning-dim)'
                            : 'var(--surface-panel-alt)',
                          borderRadius: 4,
                          fontSize: 11,
                        }}
                      >
                        <span
                          title={
                            normalizeText(stockItem.label) ||
                            normalizeText(
                              stockItem.reference,
                            ) ||
                            undefined
                          }
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontWeight: 600,
                          }}
                        >
                          {displayValue(
                            stockItem.label ??
                              stockItem.reference,
                          )}
                        </span>
                        <span
                          title={
                            normalizeText(
                              stockItem.equipment_type,
                            ) || undefined
                          }
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {displayValue(
                            stockItem.equipment_type,
                          )}
                        </span>
                        <span
                          style={{
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {formatQuantity(totalQuantity)}
                        </span>
                        <span
                          style={{
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            color: isLowStock
                              ? 'var(--color-warning)'
                              : 'var(--color-success)',
                          }}
                        >
                          {formatQuantity(availableQuantity)}
                        </span>
                        <span
                          style={{
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {formatQuantity(reservedQuantity)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </DetailSection>

        {stockItems.length > 0 && (
          <DetailSection title="Consommer du matériel">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <select
                value={consumeForm.item_id}
                onChange={(event) => {
                  setConsumeForm((current) => ({
                    ...current,
                    item_id: event.target.value,
                  }));
                  setConsumeError(null);
                  setConsumeSuccess(null);
                }}
                disabled={consumeLoading}
                aria-label="Article à consommer"
                style={{
                  flex: 1,
                  minWidth: 160,
                  padding: '4px 8px',
                  color: 'var(--text-primary)',
                  background: 'var(--surface-input)',
                  border:
                    '1px solid var(--border-color)',
                  borderRadius: 4,
                  fontSize: 11,
                }}
              >
                <option value="">Article</option>
                {stockItems.map((stockItem, index) => {
                  const itemId = parsePositiveInteger(
                    stockItem.item_id,
                  );

                  if (itemId === null) {
                    return null;
                  }

                  const availableQuantity =
                    parseFiniteNumber(
                      stockItem.available_quantity,
                    );

                  const unavailable =
                    availableQuantity !== null &&
                    availableQuantity < 1;

                  return (
                    <option
                      key={getStockRowKey(stockItem, index)}
                      value={itemId}
                      disabled={unavailable}
                    >
                      {displayValue(
                        stockItem.label ??
                          stockItem.reference,
                      )}
                      {availableQuantity !== null
                        ? ` — ${formatQuantity(
                            availableQuantity,
                          )} disponible`
                        : ''}
                    </option>
                  );
                })}
              </select>

              <input
                type="number"
                min="1"
                step="1"
                value={consumeForm.quantity}
                onChange={(event) => {
                  setConsumeForm((current) => ({
                    ...current,
                    quantity: event.target.value,
                  }));
                  setConsumeError(null);
                  setConsumeSuccess(null);
                }}
                disabled={consumeLoading}
                aria-label="Quantité à consommer"
                style={{
                  width: 80,
                  padding: '4px 8px',
                  color: 'var(--text-primary)',
                  background: 'var(--surface-input)',
                  border:
                    '1px solid var(--border-color)',
                  borderRadius: 4,
                  fontSize: 11,
                }}
              />

              <input
                type="text"
                value={consumeForm.serial_number}
                onChange={(event) => {
                  setConsumeForm((current) => ({
                    ...current,
                    serial_number: event.target.value,
                  }));
                  setConsumeError(null);
                  setConsumeSuccess(null);
                }}
                disabled={consumeLoading}
                aria-label="Numéro de série"
                style={{
                  flex: 1,
                  minWidth: 150,
                  padding: '4px 8px',
                  color: 'var(--text-primary)',
                  background: 'var(--surface-input)',
                  border:
                    '1px solid var(--border-color)',
                  borderRadius: 4,
                  fontSize: 11,
                }}
                placeholder="Numéro de série, facultatif"
              />

              <button
                type="button"
                className="btn btn--sm"
                onClick={handleConsume}
                disabled={
                  consumeLoading ||
                  !consumeForm.item_id ||
                  parsePositiveInteger(
                    consumeForm.quantity,
                  ) === null
                }
              >
                {consumeLoading
                  ? 'Consommation…'
                  : '✅ Consommer'}
              </button>
            </div>

            {consumeError && (
              <div
                role="alert"
                style={{ ...ERROR_STYLE, marginTop: 8 }}
              >
                {consumeError}
              </div>
            )}

            {consumeSuccess && (
              <div
                role="status"
                style={{ ...SUCCESS_STYLE, marginTop: 8 }}
              >
                {consumeSuccess}
              </div>
            )}
          </DetailSection>
        )}

        {equipmentEntries.length > 0 && (
          <DetailSection title="Matériel enregistré sur l’intervention">
            {renderRegisteredEquipment()}
          </DetailSection>
        )}
      </div>
    );
  };

  const renderJournal = () => {
    if (timelineLoading && safeActivities.length === 0) {
      return <div style={EMPTY_STYLE}>Chargement…</div>;
    }

    return (
      <div>
        <div
          className="ie-detail-section-title"
          style={{ marginBottom: 12 }}
        >
          Historique des modifications
        </div>

        {timelineError && (
          <ErrorMessage
            onRetry={() =>
              refreshJobData({ showLoading: true })
            }
            retryDisabled={timelineLoading}
          >
            {timelineError}
          </ErrorMessage>
        )}

        {safeActivities.length === 0 ? (
          <div style={EMPTY_STYLE}>
            Aucune modification
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              marginTop: timelineError ? 10 : 0,
            }}
          >
            {safeActivities.map((activity, index) => {
              const action = normalizeStatus(
                activity.action,
              );
              const oldStatus = normalizeText(
                activity.old_status,
              );
              const newStatus = normalizeText(
                activity.new_status,
              );
              const description = normalizeText(
                activity.description,
              );

              return (
                <div
                  key={getActivityKey(activity, index)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '5px 8px',
                    background:
                      'var(--surface-panel-alt)',
                    borderRadius: 4,
                    fontSize: 11,
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="ie-detail-mono">
                    {formatDateTime(activity.created_at)}
                  </span>
                  <span
                    style={{
                      color: 'var(--color-accent)',
                      fontWeight: 600,
                    }}
                  >
                    {getStatusLabel(
                      action === 'assigned'
                        ? 'assigned_action'
                        : action,
                    )}
                  </span>
                  {oldStatus && newStatus && (
                    <span
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {getStatusLabel(oldStatus)} →{' '}
                      {getStatusLabel(newStatus)}
                    </span>
                  )}
                  {description && (
                    <span
                      style={{
                        color: 'var(--text-secondary)',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {description}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const renderCommentaires = () => (
    <div>
      <DetailSection title="Commentaires">
        <div className="ie-detail-text">
          {displayValue(job.coordinator_comments)}
        </div>
      </DetailSection>

      {normalizeText(job.failure_reason) && (
        <DetailSection title="Raison de l’échec">
          <div
            className="ie-detail-text"
            style={{ color: 'var(--color-danger)' }}
          >
            {job.failure_reason}
          </div>
        </DetailSection>
      )}
    </div>
  );

  const renderKpi = () => {
    const estimatedDuration = parseFiniteNumber(
      job.estimated_duration,
    );
    const recordedDuration = getRecordedDuration(job);
    const opticalPower = parseFiniteNumber(
      job.optical_power_dbm,
    );

    const latitude = formatCoordinate(
      job.gps_latitude ?? job.latitude,
    );
    const longitude = formatCoordinate(
      job.gps_longitude ?? job.longitude,
    );

    const hasRecordedCoordinates =
      latitude !== '—' && longitude !== '—';

    return (
      <div>
        <div
          className="ie-detail-section-title"
          style={{ marginBottom: 12 }}
        >
          Indicateurs enregistrés
        </div>

        <div className="ie-detail-grid">
          <DetailField
            label="Durée estimée"
            value={formatMinutes(estimatedDuration)}
          />
          <DetailField
            label="Durée réelle"
            value={formatMinutes(recordedDuration)}
          />
          <DetailField
            label="Écart"
            value="—"
          />
          <DetailField
            label="Photos"
            value={availablePhotos.length}
          />
          <DetailField
            label="GPS enregistré"
            value={hasRecordedCoordinates ? 'Oui' : '—'}
          />
          <DetailField
            label="Puissance optique"
            value={
              opticalPower === null
                ? '—'
                : `${formatNumber(opticalPower)} dBm`
            }
          />
        </div>

        <div
          className="ie-detail-text"
          style={{
            marginTop: 12,
            color: 'var(--text-muted)',
          }}
        >
          Le calcul de retard ou d’écart métier n’est pas
          défini dans cette vue.
        </div>
      </div>
    );
  };

  const tabRenderers = {
    general: renderGeneral,
    reseau: renderReseau,
    timeline: renderTimeline,
    photos: renderPhotos,
    stock: renderStock,
    journal: renderJournal,
    commentaires: renderCommentaires,
    kpi: renderKpi,
  };

  const activeRenderer =
    tabRenderers[tab] || renderGeneral;

  return (
    <FloatingWindow
      title={windowTitle}
      onClose={
        typeof onClose === 'function'
          ? onClose
          : undefined
      }
      defaultPos={{ x: 260, y: 80 }}
      defaultSize={{ w: 560, h: 640 }}
      minSize={{ w: 420, h: 400 }}
      zIndex={1700}
    >
      <div
        className="pe-detail-tabs"
        role="tablist"
        aria-label="Sections de l’intervention"
        style={{
          display: 'flex',
          flexShrink: 0,
          gap: 0,
          overflowX: 'auto',
          background: 'var(--surface-panel-alt)',
          borderBottom:
            '1px solid var(--border-color)',
        }}
      >
        {TABS.map((tabItem) => {
          const isActive = tab === tabItem.id;

          return (
            <button
              key={tabItem.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`job-detail-panel-${tabItem.id}`}
              tabIndex={isActive ? 0 : -1}
              className={`pe-detail-tab${
                isActive
                  ? ' pe-detail-tab--active'
                  : ''
              }`}
              onClick={() => setTab(tabItem.id)}
              style={{
                padding: '4px 10px',
                color: isActive
                  ? 'var(--color-accent)'
                  : 'var(--text-muted)',
                background: 'none',
                border: 'none',
                borderRight:
                  '1px solid var(--border-color)',
                borderBottom: isActive
                  ? '2px solid var(--color-accent)'
                  : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: 'var(--font-family)',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                aria-hidden="true"
                style={{ marginRight: 4 }}
              >
                {tabItem.icon}
              </span>
              {tabItem.label}
            </button>
          );
        })}
      </div>

      <div
        id={`job-detail-panel-${tab}`}
        className="ie-detail-body"
        role="tabpanel"
        tabIndex={0}
        style={{
          flex: 1,
          padding: '8px 12px',
          overflowY: 'auto',
        }}
      >
        {jobLoading && tab === 'general' && !job ? (
          <div style={EMPTY_STYLE}>Chargement…</div>
        ) : (
          activeRenderer()
        )}
      </div>
    </FloatingWindow>
  );
}
