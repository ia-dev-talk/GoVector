import { useMemo } from 'react';

import { getJobTypeLabel } from '../lib/job-types';

const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 19;
const DEFAULT_HOUR_WIDTH = 80;
const DEFAULT_LABEL_WIDTH = 140;

const JOB_HEIGHT = 24;
const JOB_GAP = 2;
const ROW_PADDING = 6;
const MIN_ROW_HEIGHT = 36;

const STATUS_CONFIG = Object.freeze({
  pending: {
    label: 'En attente',
    color: 'var(--color-warning)',
  },
  assigned: {
    label: 'Affectée',
    color: 'var(--color-info)',
  },
  en_route: {
    label: 'En route',
    color: 'var(--color-info)',
  },
  on_site: {
    label: 'Sur site',
    color: 'var(--color-accent)',
  },
  work_in_progress: {
    label: 'Travail en cours',
    color: 'var(--color-purple)',
  },
  in_progress: {
    label: 'En cours',
    color: 'var(--color-purple)',
  },
  installation_done: {
    label: 'Installation terminée',
    color: 'var(--color-success)',
  },
  client_validation: {
    label: 'Validation client',
    color: 'var(--color-accent)',
  },
  en_attente_validation: {
    label: 'En attente de validation',
    color: 'var(--color-warning)',
  },
  completed: {
    label: 'Terminée',
    color: 'var(--color-success)',
  },
  cancelled: {
    label: 'Annulée',
    color: 'var(--color-danger)',
  },
  failed: {
    label: 'Échec',
    color: 'var(--color-danger)',
  },
  on_hold: {
    label: 'En attente',
    color: 'var(--color-on-hold)',
  },
  client_absent: {
    label: 'Client absent',
    color: 'var(--color-warning)',
  },
  postponed: {
    label: 'Reportée',
    color: 'var(--color-warning)',
  },
  suspended: {
    label: 'Suspendue',
    color: 'var(--color-on-hold)',
  },
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asRecords(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function identifier(value) {
  const normalized = text(value);
  return normalized || null;
}

function normalizeStatus(value) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Math.trunc(finiteNumber(value, fallback));
  return Math.min(maximum, Math.max(minimum, parsed));
}

function parseClockTime(value) {
  if (typeof value !== 'string') return null;

  const match = value.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] || 0);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    !Number.isInteger(seconds) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return null;
  }

  return hours + minutes / 60 + seconds / 3600;
}

function parseDateTimeHour(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  /*
   * getHours() affiche le timestamp dans le fuseau local du navigateur.
   * Utiliser getUTCHours() pour les chaînes terminées par Z décalait le
   * planning par rapport aux créneaux locaux du cockpit.
   */
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

function positiveMinutes(value) {
  if (value === null || value === undefined || value === '') return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function dateDurationMinutes(startValue, endValue) {
  if (!startValue || !endValue) return null;

  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const duration = (end.getTime() - start.getTime()) / 60000;
  return duration > 0 ? duration : null;
}

function clockDurationMinutes(startValue, endValue) {
  const start = parseClockTime(startValue);
  let end = parseClockTime(endValue);

  if (start === null || end === null) return null;
  if (end < start) end += 24;

  const duration = (end - start) * 60;
  return duration > 0 ? duration : null;
}

function jobTechnicianId(job) {
  return identifier(
    job?.assigned_tech_id ??
      job?.assigned_technician_id ??
      job?.technician_id ??
      job?.assignment?.technician_id,
  );
}

function technicianId(technician) {
  return identifier(technician?.id ?? technician?.technician_id);
}

function technicianName(technician, fallbackId) {
  return (
    text(technician?.name ?? technician?.full_name ?? technician?.username) ||
    `Technicien #${fallbackId}`
  );
}

function jobStartHour(job) {
  return (
    parseDateTimeHour(job?.started_at) ??
    parseDateTimeHour(job?.estimated_arrival) ??
    parseClockTime(job?.time_slot_start)
  );
}

function jobDurationMinutes(job) {
  return (
    positiveMinutes(job?.actual_duration_minutes) ??
    positiveMinutes(job?.real_duration_minutes) ??
    dateDurationMinutes(job?.started_at, job?.completed_at) ??
    positiveMinutes(job?.estimated_duration) ??
    clockDurationMinutes(job?.time_slot_start, job?.time_slot_end)
  );
}

function visibleRange(startHour, endHour, timelineStart, timelineEnd) {
  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(endHour) ||
    endHour <= startHour
  ) {
    return null;
  }

  const visibleStartHour = Math.max(startHour, timelineStart);
  const visibleEndHour = Math.min(endHour, timelineEnd);

  return visibleEndHour > visibleStartHour
    ? { visibleStartHour, visibleEndHour }
    : null;
}

function shiftRange(technician, timelineStart, timelineEnd) {
  const start = parseClockTime(technician?.shift_start);
  let end = parseClockTime(technician?.shift_end);

  if (start === null || end === null) return null;
  if (end < start) end += 24;

  return visibleRange(start, end, timelineStart, timelineEnd);
}

function formatClockValue(value) {
  const parsed = parseClockTime(value);
  if (parsed === null) return '';

  const hours = Math.floor(parsed) % 24;
  const minutes = Math.round((parsed - Math.floor(parsed)) * 60);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatSlot(start, end) {
  const normalizedStart = formatClockValue(start);
  const normalizedEnd = formatClockValue(end);

  return normalizedStart && normalizedEnd
    ? `${normalizedStart}–${normalizedEnd}`
    : '';
}

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}h`;
}

function formatDuration(value) {
  const minutes = positiveMinutes(value);
  if (minutes === null) return '';

  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;

  const hours = Math.floor(rounded / 60);
  const remainingMinutes = rounded % 60;

  return remainingMinutes
    ? `${hours} h ${remainingMinutes} min`
    : `${hours} h`;
}

function jobIdentifier(job) {
  return (
    identifier(job?.id) ||
    identifier(job?.job_number) ||
    identifier(job?.command_number)
  );
}

function jobLabel(job) {
  const customerName = text(job?.customer_name);

  if (customerName) {
    return customerName.split(/\s+/)[0] || customerName;
  }

  return (
    text(job?.job_number ?? job?.command_number ?? job?.id) ||
    'Intervention'
  );
}

function statusDetails(value) {
  const normalized = normalizeStatus(value);

  return (
    STATUS_CONFIG[normalized] || {
      label:
        normalized
          .replace(/_/g, ' ')
          .replace(/^./, (character) => character.toUpperCase()) ||
        'Statut inconnu',
      color: 'var(--text-muted)',
    }
  );
}

function jobTypeDisplay(value) {
  const fallback = text(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

  return getJobTypeLabel(value, fallback) || '';
}

function jobAccessibleLabel(job, durationMinutes) {
  const parts = [];
  const identifierValue = jobIdentifier(job);
  const customer = text(job?.customer_name);
  const type = jobTypeDisplay(job?.job_type);
  const status = statusDetails(job?.status).label;
  const slot = formatSlot(job?.time_slot_start, job?.time_slot_end);
  const duration = formatDuration(durationMinutes);

  if (customer) parts.push(customer);
  else if (identifierValue) parts.push(`Intervention ${identifierValue}`);

  if (type) parts.push(type);
  if (status) parts.push(status);
  if (slot) parts.push(slot);
  if (duration) parts.push(duration);

  return parts.join(' · ') || 'Intervention planifiée';
}

function buildTimelineJob(job, timelineStart, timelineEnd) {
  if (!isRecord(job)) return null;

  const jobId = jobIdentifier(job);
  const assignedTechnicianId = jobTechnicianId(job);
  const startHour = jobStartHour(job);
  const durationMinutes = jobDurationMinutes(job);

  if (
    !jobId ||
    !assignedTechnicianId ||
    startHour === null ||
    durationMinutes === null
  ) {
    return null;
  }

  const endHour = startHour + durationMinutes / 60;
  const range = visibleRange(startHour, endHour, timelineStart, timelineEnd);

  if (!range) return null;

  return {
    job,
    jobId,
    technicianId: assignedTechnicianId,
    startHour,
    endHour,
    durationMinutes,
    ...range,
  };
}

function assignLanes(jobs) {
  const sorted = [...jobs].sort(
    (first, second) =>
      first.visibleStartHour - second.visibleStartHour ||
      first.visibleEndHour - second.visibleEndHour ||
      first.jobId.localeCompare(second.jobId),
  );

  const laneEndHours = [];
  const jobsWithLanes = sorted.map((job) => {
    let lane = laneEndHours.findIndex(
      (laneEndHour) => job.visibleStartHour >= laneEndHour,
    );

    if (lane === -1) {
      lane = laneEndHours.length;
      laneEndHours.push(job.visibleEndHour);
    } else {
      laneEndHours[lane] = job.visibleEndHour;
    }

    return { ...job, lane };
  });

  return {
    jobs: jobsWithLanes,
    laneCount: laneEndHours.length,
  };
}

function TimelineJob({
  timelineJob,
  timelineStart,
  hourWidth,
  onJobClick,
  onJobDoubleClick,
}) {
  const {
    job,
    jobId,
    durationMinutes,
    visibleStartHour,
    visibleEndHour,
    lane,
  } = timelineJob;

  const status = statusDetails(job.status);
  const slot = formatSlot(job.time_slot_start, job.time_slot_end);
  const accessibleLabel = jobAccessibleLabel(job, durationMinutes);
  const interactive =
    typeof onJobClick === 'function' ||
    typeof onJobDoubleClick === 'function';

  const style = {
    left: (visibleStartHour - timelineStart) * hourWidth,
    width: Math.max((visibleEndHour - visibleStartHour) * hourWidth, 1),
    height: JOB_HEIGHT,
    top: ROW_PADDING + lane * (JOB_HEIGHT + JOB_GAP),
    backgroundColor: status.color,
  };

  const content = (
    <>
      <span className="timeline-job-label">{jobLabel(job)}</span>
      {slot && <span className="timeline-job-slot">{slot}</span>}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        className="timeline-job"
        style={{
          ...style,
          border: 0,
          textAlign: 'left',
        }}
        title={accessibleLabel}
        aria-label={accessibleLabel}
        onClick={() => onJobClick?.(job)}
        onDoubleClick={() => onJobDoubleClick?.(job)}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className="timeline-job"
      style={style}
      title={accessibleLabel}
      aria-label={accessibleLabel}
      role="group"
      tabIndex={0}
      data-job-id={jobId}
    >
      {content}
    </div>
  );
}

export default function TechTimeline({
  technicians = [],
  jobs = [],
  startHour = DEFAULT_START_HOUR,
  endHour = DEFAULT_END_HOUR,
  hourWidth = DEFAULT_HOUR_WIDTH,
  labelColumnWidth = DEFAULT_LABEL_WIDTH,
  onJobClick,
  onJobDoubleClick,
  ariaLabel = 'Planning horaire des techniciens sélectionnés',
}) {
  const timelineStart = clampInteger(startHour, 0, 23, DEFAULT_START_HOUR);
  const requestedEnd = clampInteger(endHour, 1, 24, DEFAULT_END_HOUR);
  const timelineEnd =
    requestedEnd > timelineStart ? requestedEnd : DEFAULT_END_HOUR;

  const safeHourWidth = Math.max(36, finiteNumber(hourWidth, DEFAULT_HOUR_WIDTH));
  const safeLabelWidth = Math.max(
    90,
    finiteNumber(labelColumnWidth, DEFAULT_LABEL_WIDTH),
  );

  const hours = useMemo(
    () =>
      Array.from(
        { length: timelineEnd - timelineStart },
        (_, index) => timelineStart + index,
      ),
    [timelineEnd, timelineStart],
  );

  const safeTechnicians = useMemo(() => {
    const seen = new Set();

    return asRecords(technicians).filter((technician) => {
      const id = technicianId(technician);
      if (!id || seen.has(id)) return false;

      seen.add(id);
      return true;
    });
  }, [technicians]);

  const jobsByTechnician = useMemo(() => {
    const seenJobs = new Set();
    const grouped = new Map();

    asRecords(jobs).forEach((job) => {
      const timelineJob = buildTimelineJob(job, timelineStart, timelineEnd);

      if (!timelineJob || seenJobs.has(timelineJob.jobId)) return;
      seenJobs.add(timelineJob.jobId);

      const technicianJobs = grouped.get(timelineJob.technicianId) || [];
      technicianJobs.push(timelineJob);
      grouped.set(timelineJob.technicianId, technicianJobs);
    });

    return grouped;
  }, [jobs, timelineEnd, timelineStart]);

  const timelineData = useMemo(
    () =>
      safeTechnicians.map((technician) => {
        const id = technicianId(technician);
        const assignedJobs = jobsByTechnician.get(id) || [];
        const { jobs: lanedJobs, laneCount } = assignLanes(assignedJobs);

        return {
          technician,
          technicianId: id,
          jobs: lanedJobs,
          rowHeight:
            laneCount > 0
              ? Math.max(
                  MIN_ROW_HEIGHT,
                  ROW_PADDING * 2 +
                    laneCount * JOB_HEIGHT +
                    (laneCount - 1) * JOB_GAP,
                )
              : MIN_ROW_HEIGHT,
          shiftRange: shiftRange(technician, timelineStart, timelineEnd),
        };
      }),
    [jobsByTechnician, safeTechnicians, timelineEnd, timelineStart],
  );

  const trackWidth = hours.length * safeHourWidth;
  const totalWidth = safeLabelWidth + trackWidth;

  if (!safeTechnicians.length) {
    return (
      <div className="timeline-empty" role="status">
        Sélectionnez un technicien pour afficher son planning.
      </div>
    );
  }

  return (
    <div
      className="timeline-container"
      role="table"
      aria-label={ariaLabel}
      aria-rowcount={timelineData.length + 1}
      aria-colcount={hours.length + 1}
    >
      <div
        className="timeline-header"
        role="row"
        style={{ width: totalWidth }}
      >
        <div
          className="timeline-label-col"
          role="columnheader"
          style={{
            width: safeLabelWidth,
            minWidth: safeLabelWidth,
          }}
        >
          Technicien
        </div>

        {hours.map((hour) => (
          <div
            key={hour}
            className="timeline-hour-header"
            role="columnheader"
            style={{
              width: safeHourWidth,
              minWidth: safeHourWidth,
            }}
          >
            {formatHour(hour)}
          </div>
        ))}
      </div>

      <div
        className="timeline-body"
        role="rowgroup"
        style={{ width: totalWidth }}
      >
        {timelineData.map(
          ({
            technician,
            technicianId: id,
            jobs: technicianJobs,
            rowHeight,
            shiftRange: technicianShift,
          }) => (
            <div
              key={id}
              className="timeline-row"
              role="row"
              style={{ height: rowHeight }}
            >
              <div
                className="timeline-label-col timeline-tech-name"
                role="rowheader"
                title={technicianName(technician, id)}
                style={{
                  width: safeLabelWidth,
                  minWidth: safeLabelWidth,
                }}
              >
                {technicianName(technician, id)}
              </div>

              <div
                className="timeline-track"
                role="cell"
                aria-label={`Planning de ${technicianName(technician, id)}`}
                style={{ width: trackWidth }}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="timeline-gridline"
                    aria-hidden="true"
                    style={{
                      left: (hour - timelineStart) * safeHourWidth,
                      height: rowHeight,
                    }}
                  />
                ))}

                {technicianShift && (
                  <div
                    className="timeline-shift"
                    aria-hidden="true"
                    style={{
                      left:
                        (technicianShift.visibleStartHour - timelineStart) *
                        safeHourWidth,
                      width:
                        (technicianShift.visibleEndHour -
                          technicianShift.visibleStartHour) *
                        safeHourWidth,
                      height: Math.max(rowHeight - 4, 0),
                      top: 2,
                    }}
                  />
                )}

                {technicianJobs.map((timelineJob) => (
                  <TimelineJob
                    key={timelineJob.jobId}
                    timelineJob={timelineJob}
                    timelineStart={timelineStart}
                    hourWidth={safeHourWidth}
                    onJobClick={onJobClick}
                    onJobDoubleClick={onJobDoubleClick}
                  />
                ))}
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
