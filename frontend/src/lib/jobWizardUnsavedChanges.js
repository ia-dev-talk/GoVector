function normalizeText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

function normalizeControlValue(control) {
  if (!control) {
    return '';
  }

  const role = control.getAttribute?.('role');
  if (role === 'radio') {
    return control.getAttribute('aria-checked') === 'true'
      ? 'checked'
      : 'unchecked';
  }

  const type = normalizeText(control.type).toLocaleLowerCase('fr');
  if (type === 'checkbox' || type === 'radio') {
    return control.checked ? 'checked' : 'unchecked';
  }

  if (control.multiple && control.options) {
    return Array.from(control.options)
      .filter((option) => option.selected)
      .map((option) => normalizeText(option.value))
      .join('\u001f');
  }

  return normalizeText(control.value);
}

export function captureWizardState(root) {
  if (!root?.querySelectorAll) {
    return '';
  }

  const controls = Array.from(
    root.querySelectorAll('input, select, textarea, [role="radio"]'),
  );

  return controls
    .map((control, index) => {
      const key = normalizeText(
        control.name ||
          control.id ||
          control.getAttribute?.('data-field') ||
          `${control.tagName || 'control'}-${index}`,
      );
      const type = normalizeText(
        control.type || control.getAttribute?.('role') || control.tagName,
      ).toLocaleLowerCase('fr');
      const value = normalizeControlValue(control);

      return `${key}\u001e${type}\u001e${value}`;
    })
    .join('\u001d');
}

export function wizardStateChanged(initialState, currentState) {
  return normalizeText(initialState) !== normalizeText(currentState);
}

export function shouldWarnBeforeWizardClose({
  dirty = false,
  persisted = false,
} = {}) {
  return Boolean(dirty) && !persisted;
}

export function isWizardMutatingButtonLabel(value) {
  const label = normalizeText(value).toLocaleLowerCase('fr');

  return (
    label.startsWith('localiser cette adresse') ||
    label.startsWith('utiliser ce point')
  );
}

export function isPersistedWizardCounterText(value) {
  const text = normalizeText(value).toLocaleLowerCase('fr');

  return (
    text.startsWith('intervention ') &&
    text.includes('enregistr')
  );
}
