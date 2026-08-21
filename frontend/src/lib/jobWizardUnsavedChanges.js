function normalizeText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}

export function shouldWarnBeforeWizardClose({
  dirty = false,
  persisted = false,
} = {}) {
  return Boolean(dirty) && !Boolean(persisted);
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
