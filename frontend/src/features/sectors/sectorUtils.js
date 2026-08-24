import {
  getLocalDateKey,
  normalizeIdentifier,
  normalizeSearchText,
  normalizeStatus,
  shouldCheckGps,
  statusLabel,
  technicianInitials,
  text,
} from '../personnel/personnelUtils.js';


export {
  getLocalDateKey,
  normalizeIdentifier,
  normalizeSearchText,
  normalizeStatus,
  shouldCheckGps,
  statusLabel,
  technicianInitials,
  text,
};


const TERMINAL_JOB_STATUSES = new Set([
  'completed',
  'cancelled',
  'failed',
]);


export function asRecords(value) {
  return Array.isArray(value)
    ? value.filter(
        (item) =>
          item !== null &&
          typeof item === 'object' &&
          !Array.isArray(item),
      )
    : [];
}


export function sectorId(sector) {
  return normalizeIdentifier(sector?.id);
}


export function technicianId(technician) {
  return normalizeIdentifier(
    technician?.id ??
      technician?.technician_id,
  );
}


export function technicianName(technician) {
  return (
    text(
      technician?.name ??
        technician?.full_name,
    ) ||
    (
      technicianId(technician)
        ? `Technicien #${technicianId(technician)}`
        : 'Technicien'
    )
  );
}


export function jobSectorId(job) {
  return normalizeIdentifier(
    job?.sector_id,
  );
}


export function legacyJobSectorName(job) {
  return text(
    job?.sector_name ??
      job?.sector_raw ??
      job?.route_criteria ??
      job?.sector,
  );
}


export function jobMatchesSector(
  job,
  sector,
) {
  const targetId = sectorId(sector);
  const linkedId = jobSectorId(job);

  if (linkedId !== null) {
    return (
      targetId !== null &&
      linkedId === targetId
    );
  }

  return (
    normalizeSearchText(
      legacyJobSectorName(job),
    ) ===
    normalizeSearchText(sector?.name)
  );
}


export function isLegacyJobAssociation(
  job,
) {
  return jobSectorId(job) === null;
}


export function assignmentMap(assignments) {
  return new Map(
    asRecords(assignments).map(
      (assignment) => [
        normalizeIdentifier(
          assignment?.technician_id,
        ),
        {
          ...assignment,
          sector_ids:
            Array.isArray(
              assignment?.sector_ids,
            )
              ? assignment.sector_ids
                  .map(normalizeIdentifier)
                  .filter(Boolean)
              : [],
          primary_sector_id:
            normalizeIdentifier(
              assignment?.primary_sector_id,
            ),
        },
      ],
    ),
  );
}


export function buildSectorMetrics({
  sectors,
  technicians,
  jobs,
  assignments,
  referenceNow,
  staleAfterMinutes,
}) {
  const byTechnician =
    assignmentMap(assignments);

  return asRecords(sectors).map(
    (sector) => {
      const id = sectorId(sector);

      const assignedTechnicians =
        asRecords(technicians).filter(
          (technician) =>
            byTechnician
              .get(technicianId(technician))
              ?.sector_ids.includes(id),
        );

      const primaryTechnicians =
        assignedTechnicians.filter(
          (technician) =>
            byTechnician
              .get(technicianId(technician))
              ?.primary_sector_id === id,
        );

      const sectorJobs =
        asRecords(jobs).filter(
          (job) =>
            jobMatchesSector(job, sector),
        );

      const legacyJobs =
        sectorJobs.filter(
          isLegacyJobAssociation,
        ).length;

      const statusCounts = {
        completed: 0,
        inProgress: 0,
        pending: 0,
        assigned: 0,
        unassigned: 0,
        active: 0,
      };

      sectorJobs.forEach((job) => {
        const status =
          normalizeStatus(job?.status);

        if (status === 'completed') {
          statusCounts.completed += 1;
        }

        if (
          [
            'in_progress',
            'work_in_progress',
            'en_intervention',
            'on_site',
          ].includes(status)
        ) {
          statusCounts.inProgress += 1;
        }

        if (
          [
            'pending',
            'on_hold',
          ].includes(status)
        ) {
          statusCounts.pending += 1;
        }

        if (
          normalizeIdentifier(
            job?.assigned_tech_id ??
              job?.assigned_technician_id ??
              job?.technician_id,
          )
        ) {
          statusCounts.assigned += 1;
        } else if (
          !TERMINAL_JOB_STATUSES.has(status)
        ) {
          statusCounts.unassigned += 1;
        }

        if (
          !TERMINAL_JOB_STATUSES.has(status)
        ) {
          statusCounts.active += 1;
        }
      });

      const gpsIssues =
        assignedTechnicians.filter(
          (technician) =>
            shouldCheckGps(
              technician,
              referenceNow,
              staleAfterMinutes,
            ),
        ).length;

      const available =
        assignedTechnicians.filter(
          (technician) =>
            normalizeStatus(
              technician?.live_status ??
                technician?.status,
            ) === 'disponible',
        ).length;

      return {
        ...sector,
        id,
        technicians:
          assignedTechnicians,
        primaryTechnicians,
        jobs: sectorJobs,
        legacyJobs,
        available,
        gpsIssues,
        statusCounts,
      };
    },
  );
}


export function summarizeRegistry({
  sectors,
  technicians,
  assignments,
  jobs,
  referenceNow,
  staleAfterMinutes,
}) {
  const assignmentByTech =
    assignmentMap(assignments);

  const linkedTechnicianIds =
    new Set(
      [...assignmentByTech.entries()]
        .filter(
          ([, assignment]) =>
            assignment.sector_ids.length > 0,
        )
        .map(([id]) => id),
    );

  return {
    total: sectors.length,
    active: sectors.filter(
      (sector) =>
        sector?.is_active !== false,
    ).length,
    withoutTechnicians:
      sectors.filter(
        (sector) =>
          sector.technicians.length === 0,
      ).length,
    linkedTechnicians:
      linkedTechnicianIds.size,
    unlinkedTechnicians:
      asRecords(technicians).filter(
        (technician) =>
          !linkedTechnicianIds.has(
            technicianId(technician),
          ),
      ).length,
    jobsToday:
      asRecords(jobs).length,
    gpsIssues:
      asRecords(technicians).filter(
        (technician) =>
          shouldCheckGps(
            technician,
            referenceNow,
            staleAfterMinutes,
          ),
      ).length,
  };
}


export function errorMessage(
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
        text(
          item?.msg ??
            item?.message,
        ),
      )
      .filter(Boolean);

    if (messages.length) {
      return messages.join(' · ');
    }
  }

  return (
    text(error?.message) ||
    fallback
  );
}
