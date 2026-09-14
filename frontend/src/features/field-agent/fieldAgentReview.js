export const FIELD_AGENT_ROLE = 'CHEF_ORIENTEUR';
export const AWAITING_VALIDATION_STATUS = 'en_attente_validation';
export const FIELD_AGENT_VERIFIED_STATUS = 'FIELD_AGENT_VERIFIED';

export function normalizeFieldAgentStatus(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function isFieldAgentRole(role) {
  return role === FIELD_AGENT_ROLE;
}

export function isAwaitingAgentReview(job) {
  return (
    normalizeFieldAgentStatus(job?.status) === AWAITING_VALIDATION_STATUS &&
    String(job?.validation_status ?? '').trim().toUpperCase() !== FIELD_AGENT_VERIFIED_STATUS
  );
}

export function isSubmittedToOffice(job) {
  return (
    normalizeFieldAgentStatus(job?.status) === AWAITING_VALIDATION_STATUS &&
    String(job?.validation_status ?? '').trim().toUpperCase() === FIELD_AGENT_VERIFIED_STATUS
  );
}

export function canFieldAgentValidate(job, { contextLoading = false, contextError = '' } = {}) {
  return (
    isAwaitingAgentReview(job) &&
    !contextLoading &&
    !String(contextError || '').trim()
  );
}

export function normalizeFieldAgentEntries(payload) {
  const entries = Array.isArray(payload?.jobs) ? payload.jobs : [];

  return entries
    .filter((entry) => entry?.job?.id)
    .slice()
    .sort((left, right) => {
      const leftPending = isAwaitingAgentReview(left.job) ? 0 : 1;
      const rightPending = isAwaitingAgentReview(right.job) ? 0 : 1;
      if (leftPending !== rightPending) {
        return leftPending - rightPending;
      }

      const leftDate = Date.parse(left.job?.scheduled_date || '') || Number.MAX_SAFE_INTEGER;
      const rightDate = Date.parse(right.job?.scheduled_date || '') || Number.MAX_SAFE_INTEGER;
      if (leftDate !== rightDate) {
        return leftDate - rightDate;
      }

      return Number(left.job.id) - Number(right.job.id);
    });
}

export function fieldAgentReviewCounters(entries) {
  const records = Array.isArray(entries) ? entries : [];
  const awaitingReview = records.filter((entry) => isAwaitingAgentReview(entry?.job)).length;
  const active = records.filter((entry) => {
    const status = normalizeFieldAgentStatus(entry?.job?.status);
    return status && status !== AWAITING_VALIDATION_STATUS;
  }).length;

  return {
    total: records.length,
    awaitingReview,
    active,
  };
}

export function fieldAgentStatusLabel(value) {
  const labels = {
    assigned: 'Assignée',
    accepted: 'Acceptée',
    en_route: 'En trajet',
    on_site: 'Sur site',
    in_progress: 'En cours',
    work_in_progress: 'En cours',
    installation_done: 'Travail terminé',
    client_validation: 'Validation client',
    en_attente_validation: 'À contrôler',
    on_hold: 'En attente',
    postponed: 'Reportée',
    failed: 'Échec',
    suspended: 'Suspendue',
    completed: 'Clôturée',
  };

  const normalized = normalizeFieldAgentStatus(value);
  return labels[normalized] || normalized || '—';
}

export function fieldAgentJobStatusLabel(job) {
  if (isSubmittedToOffice(job)) return 'Transmis au bureau';
  return fieldAgentStatusLabel(job?.status);
}
