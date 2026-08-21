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

function controlKey(control, index) {
  const type = normalizeText(
    control?.type || control?.getAttribute?.('role') || control?.tagName,
  ).toLocaleLowerCase('fr');
  const id = normalizeText(control?.id);
  const dataField = normalizeText(control?.getAttribute?.('data-field'));
  const name = normalizeText(control?.name);

  if (id) return `id:${id}`;
  if (dataField) return `field:${dataField}`;
  if (name) {
    const optionValue = type === 'radio' || type === 'checkbox'
      ? `:${normalizeText(control?.value)}`
      : '';
    return `name:${name}:${type}${optionValue}`;
  }

  return `anonymous:${normalizeText(control?.tagName) || 'control'}:${type}:${index}`;
}

export function captureWizardFields(root) {
  if (!root?.querySelectorAll) {
    return [];
  }

  return Array.from(
    root.querySelectorAll('input, select, textarea, [role="radio"]'),
  ).map((control, index) => ({
    key: controlKey(control, index),
    value: normalizeControlValue(control),
  }));
}

export function captureWizardState(root) {
  return captureWizardFields(root)
    .map(({ key, value }) => `${key}\u001e${value}`)
    .join('\u001d');
}

export function createWizardStateTracker() {
  const baseline = new Map();
  const current = new Map();

  return {
    observe(root) {
      captureWizardFields(root).forEach(({ key, value }) => {
        if (!baseline.has(key)) {
          baseline.set(key, value);
        }
        current.set(key, value);
      });
      return this.isChanged();
    },
    isChanged() {
      for (const [key, initialValue] of baseline.entries()) {
        if (current.get(key) !== initialValue) {
          return true;
        }
      }
      return false;
    },
    reset(root) {
      baseline.clear();
      current.clear();
      this.observe(root);
    },
  };
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
