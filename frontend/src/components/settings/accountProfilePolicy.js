const PROFILE_POLICIES = Object.freeze({
  ADMIN: Object.freeze({ field: null, label: null }),
  CHEF_ORIENTEUR: Object.freeze({ field: null, label: null }),
  ORIENTEUR: Object.freeze({ field: 'orienteur_id', label: 'profil orienteur' }),
  TECHNICIAN: Object.freeze({ field: 'technician_id', label: 'profil technicien' }),
});

function normalizeRole(role) {
  return String(role ?? '').trim().toUpperCase();
}

function positiveInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function resolveOperationalAccountProfilePolicy(role) {
  const normalizedRole = normalizeRole(role);
  const policy = PROFILE_POLICIES[normalizedRole];
  return {
    role: normalizedRole,
    supported: Boolean(policy),
    field: policy?.field ?? null,
    label: policy?.label ?? null,
  };
}

export function buildOperationalAccountProfilePayload(
  role,
  { technicianId = null, orienteurId = null } = {},
) {
  const policy = resolveOperationalAccountProfilePolicy(role);

  if (!policy.supported) {
    return {
      valid: false,
      error: 'Choisissez un rôle opérationnel valide.',
      technician_id: null,
      orienteur_id: null,
    };
  }

  if (policy.field === 'technician_id') {
    const technicianIdValue = positiveInteger(technicianId);
    if (technicianIdValue === null) {
      return {
        valid: false,
        error: 'Choisissez le profil technicien lié à ce compte.',
        technician_id: null,
        orienteur_id: null,
      };
    }
    return {
      valid: true,
      error: '',
      technician_id: technicianIdValue,
      orienteur_id: null,
    };
  }

  if (policy.field === 'orienteur_id') {
    const orienteurIdValue = positiveInteger(orienteurId);
    if (orienteurIdValue === null) {
      return {
        valid: false,
        error: 'Choisissez le profil orienteur lié à ce compte.',
        technician_id: null,
        orienteur_id: null,
      };
    }
    return {
      valid: true,
      error: '',
      technician_id: null,
      orienteur_id: orienteurIdValue,
    };
  }

  return {
    valid: true,
    error: '',
    technician_id: null,
    orienteur_id: null,
  };
}
