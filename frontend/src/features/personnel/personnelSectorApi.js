import { apiClient } from '../../api/client';


function technicianPath(value) {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    throw new TypeError('Technicien obligatoire');
  }

  return encodeURIComponent(normalized);
}


export const personnelSectorApi = Object.freeze({
  getAssignments: () =>
    apiClient.get(
      '/sectors/technician-assignments',
    ),

  updateAssignment: (
    technicianId,
    data,
  ) =>
    apiClient.put(
      `/sectors/technician-assignments/${technicianPath(
        technicianId,
      )}`,
      {
        primary_sector_id:
          data?.primary_sector_id ?? null,
        sector_ids:
          Array.isArray(data?.sector_ids)
            ? data.sector_ids
            : [],
      },
    ),
});
