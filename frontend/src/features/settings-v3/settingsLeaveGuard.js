function normalizeClassName(value) {
  return String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function isSettingsGlobalLeaveControl({
  className = '',
  ariaCurrent = '',
} = {}) {
  const classes = normalizeClassName(className);
  return (
    classes.includes('sidebar-nav-item') &&
    String(ariaCurrent ?? '').trim().toLowerCase() !== 'page'
  );
}

export function shouldGuardSettingsLeave({
  dirty = false,
  className = '',
  ariaCurrent = '',
} = {}) {
  return Boolean(dirty) && isSettingsGlobalLeaveControl({ className, ariaCurrent });
}
