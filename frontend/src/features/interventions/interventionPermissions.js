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

export function isInterventionDeleteRequest(config) {
  const method = String(config?.method ?? '')
    .trim()
    .toLowerCase();

  if (method !== 'delete') {
    return false;
  }

  const rawUrl = String(config?.url ?? '').trim();
  if (!rawUrl) {
    return false;
  }

  let pathname = rawUrl.split('?')[0];

  try {
    pathname = new URL(rawUrl, 'http://bluevector.local').pathname;
  } catch {
    // Relative URLs are handled by the fallback pathname above.
  }

  return /^(?:\/api\/v1)?\/jobs\/[^/]+\/?$/.test(pathname);
}
