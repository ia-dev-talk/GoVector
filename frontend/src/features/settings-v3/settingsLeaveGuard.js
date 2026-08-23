function normalizeClassName(value) {
  return String(value ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function selectValues(control) {
  const options = Array.from(control?.options || []);
  return options.filter((option) => option.selected).map((option) => String(option.value ?? ''));
}

function defaultSelectValues(control) {
  const options = Array.from(control?.options || []);
  const explicit = options.filter((option) => option.defaultSelected).map((option) => String(option.value ?? ''));
  if (explicit.length || control?.multiple) return explicit;
  return options.length ? [String(options[0].value ?? '')] : [''];
}

export function isOrganizationControlDirty(control) {
  if (!control) return false;
  const type = String(control.type ?? '').toLowerCase();
  const tagName = String(control.tagName ?? '').toUpperCase();

  if (type === 'checkbox' || type === 'radio') {
    return Boolean(control.checked) !== Boolean(control.defaultChecked);
  }
  if (type === 'file' || type === 'submit' || type === 'button' || type === 'reset') {
    return false;
  }
  if (tagName === 'SELECT') {
    const current = selectValues(control);
    const baseline = defaultSelectValues(control);
    return current.length !== baseline.length || current.some((value, index) => value !== baseline[index]);
  }
  return String(control.value ?? '') !== String(control.defaultValue ?? '');
}

export function hasOrganizationDraft(root) {
  if (!root?.querySelectorAll) return false;
  const forms = Array.from(root.querySelectorAll('form'));
  if (forms.some((form) => Array.from(form?.elements || []).some(isOrganizationControlDirty))) {
    return true;
  }

  const teamDraftControls = Array.from(
    root.querySelectorAll('.v1-admin-team-add--explicit select'),
  );
  return teamDraftControls.some(isOrganizationControlDirty);
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
