import { FILES_URL } from '../../api/client';
import { buildRuntimeFileUrl } from '../../lib/runtime-files.js';

export function isRecord(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

export function asRecords(value) {
  return Array.isArray(value)
    ? value.filter(isRecord)
    : [];
}

export function text(value, fallback = '') {
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

export function identifier(value) {
  return text(value) || null;
}

export function finiteNumber(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

export function normalizeStatus(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[\s-]+/g, '_');
}

export function formatLabel(value, fallback = 'Non renseigné') {
  const normalized = text(value);

  if (!normalized) {
    return fallback;
  }

  return normalized
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^./, (character) =>
      character.toLocaleUpperCase('fr'),
    );
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_FORMATTER = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

export function formatDateTime(value, fallback = '—') {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return DATE_TIME_FORMATTER.format(date);
}

export function formatDate(value, fallback = '—') {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return DATE_FORMATTER.format(date);
}

export function getJobNumber(job) {
  return (
    text(job?.job_number) ||
    text(job?.command_number) ||
    text(job?.dtli) ||
    text(job?.id, '—')
  );
}

export function getAssignedTechnician(job) {
  return (
    text(job?.assigned_technician_name) ||
    text(job?.assigned_tech_name) ||
    (
      identifier(job?.assigned_tech_id)
        ? `Technicien #${identifier(job.assigned_tech_id)}`
        : 'Non affecté'
    )
  );
}

export function getCoordinates(job) {
  const pairs = [
    [job?.gps_latitude, job?.gps_longitude],
    [job?.latitude, job?.longitude],
    [job?.client_latitude, job?.client_longitude],
  ];

  for (const [latitudeValue, longitudeValue] of pairs) {
    const latitude = finiteNumber(latitudeValue);
    const longitude = finiteNumber(longitudeValue);

    if (
      latitude === null ||
      longitude === null ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      (latitude === 0 && longitude === 0)
    ) {
      continue;
    }

    return {
      latitude,
      longitude,
    };
  }

  return null;
}

export function getStatusMeta(value) {
  const status = normalizeStatus(value);

  const map = {
    pending: {
      label: 'Non affectée',
      tone: 'warning',
    },
    assigned: {
      label: 'Affectée',
      tone: 'info',
    },
    en_route: {
      label: 'En route',
      tone: 'info',
    },
    on_site: {
      label: 'Sur site',
      tone: 'info',
    },
    work_in_progress: {
      label: 'Travail en cours',
      tone: 'purple',
    },
    in_progress: {
      label: 'En cours',
      tone: 'purple',
    },
    completed: {
      label: 'Terminée',
      tone: 'success',
    },
    cancelled: {
      label: 'Annulée',
      tone: 'danger',
    },
    failed: {
      label: 'Échec',
      tone: 'danger',
    },
    on_hold: {
      label: 'En attente',
      tone: 'muted',
    },
    client_absent: {
      label: 'Client absent',
      tone: 'warning',
    },
    postponed: {
      label: 'Reportée',
      tone: 'warning',
    },
    suspended: {
      label: 'Suspendue',
      tone: 'muted',
    },
  };

  return map[status] || {
    label: formatLabel(status, 'Statut inconnu'),
    tone: 'muted',
  };
}

export function buildFileUrl(value) {
  return buildRuntimeFileUrl(value, FILES_URL);
}

export function getApiErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => text(item?.msg))
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(' ');
    }
  }

  return text(error?.message, fallback);
}

export function extractEquipment(job, payload) {
  const entries = [];
  const seen = new Set();

  const push = (label, value, mono = true) => {
    const normalizedValue = text(value);

    if (!normalizedValue) {
      return;
    }

    const key = `${label}:${normalizedValue}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    entries.push({
      label,
      value: normalizedValue,
      mono,
    });
  };

  push('ONT', job?.ont_serial);
  push('Routeur', job?.router_serial);
  push('PTO', job?.pto);
  push('Splitter', job?.splitter, false);
  push('Port splitter', job?.splitter_port, false);

  if (Array.isArray(payload)) {
    payload.filter(isRecord).forEach((item) => {
      push(
        text(item.label) || text(item.type) || text(item.equipment_type) || 'Équipement',
        item.serial_number || item.serial || item.value || item.reference || item.name,
      );
    });
  } else if (isRecord(payload)) {
    const candidates = [
      payload.items,
      payload.equipment,
      payload.equipments,
      payload.entries,
    ];

    candidates.forEach((candidate) => {
      if (Array.isArray(candidate)) {
        candidate.filter(isRecord).forEach((item) => {
          push(
            text(item.label) || text(item.type) || text(item.equipment_type) || 'Équipement',
            item.serial_number || item.serial || item.value || item.reference || item.name,
          );
        });
      }
    });
  }

  return entries;
}

export function extractStockCounts(payload) {
  if (!isRecord(payload)) {
    return [];
  }

  const counts = payload?.stock_summary?.counts;

  if (!isRecord(counts)) {
    return [];
  }

  return Object.entries(counts)
    .map(([label, value]) => ({
      label: formatLabel(label, label),
      value: finiteNumber(value),
    }))
    .filter((item) => item.value !== null)
    .sort((left, right) =>
      left.label.localeCompare(right.label, 'fr'),
    );
}
