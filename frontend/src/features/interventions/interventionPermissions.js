export function getInterventionPermissions(userRole) {
  const role = String(userRole ?? '')
    .trim()
    .toUpperCase();

  return Object.freeze({
    canDeleteIntervention:
      role === 'ADMIN' ||
      role === 'CHEF_ORIENTEUR',
  });
}
