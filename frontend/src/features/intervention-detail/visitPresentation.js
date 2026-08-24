const END_REASON_LABELS = {
  reassigned: 'réaffecté',
  unassigned: 'désaffecté',
};

const CURRENT_STATE_LABELS = {
  assigned: 'en attente de démarrage',
  accepted: 'accepté',
  en_route: 'en route',
  on_site: 'sur site',
};

export function isCurrentFieldVisit(visit, currentAssignment) {
  if (typeof visit?.is_current === 'boolean') return visit.is_current;
  if (!visit || visit.ended_at || !currentAssignment) return false;
  if (currentAssignment.visit_id != null) {
    return currentAssignment.visit_id === visit.id;
  }
  return currentAssignment.technician_id === visit.primary_technician_id;
}

export function fieldVisitPresentation(visit, currentAssignment) {
  const isCurrent = isCurrentFieldVisit(visit, currentAssignment);
  const reason = END_REASON_LABELS[visit?.history_reason || visit?.outcome] || '';

  return {
    isCurrent,
    headingPrefix: isCurrent ? '' : 'Historique · ',
    trailingState: isCurrent
      ? (CURRENT_STATE_LABELS[visit?.status] || 'en cours')
      : (reason || 'clos'),
  };
}

export function hasCurrentFieldVisit(visits, currentAssignment) {
  return Array.isArray(visits)
    && visits.some((visit) => isCurrentFieldVisit(visit, currentAssignment));
}
