import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  captureWizardState,
  isPersistedWizardCounterText,
  isWizardMutatingButtonLabel,
  shouldWarnBeforeWizardClose,
  wizardStateChanged,
} from './jobWizardUnsavedChanges.js';

function readSource(relativePath) {
  return readFileSync(
    new URL(relativePath, import.meta.url),
    'utf8',
  );
}

function control({
  id,
  type = 'text',
  value = '',
  checked = false,
  role = '',
  ariaChecked = '',
}) {
  return {
    id,
    type,
    value,
    checked,
    tagName: type === 'select-one' ? 'SELECT' : 'INPUT',
    getAttribute(name) {
      if (name === 'role') return role || null;
      if (name === 'aria-checked') return ariaChecked || null;
      if (name === 'data-field') return null;
      return null;
    },
  };
}

function fakeRoot(controls) {
  return {
    querySelectorAll() {
      return controls;
    },
  };
}

test('wizard close guard warns only for dirty unsaved work', () => {
  assert.equal(
    shouldWarnBeforeWizardClose({ dirty: false, persisted: false }),
    false,
  );
  assert.equal(
    shouldWarnBeforeWizardClose({ dirty: true, persisted: false }),
    true,
  );
  assert.equal(
    shouldWarnBeforeWizardClose({ dirty: true, persisted: true }),
    false,
  );
});

test('wizard dirty state clears when fields return to their initial values', () => {
  const baselineControls = [
    control({ id: 'customer-name', value: 'Alice' }),
    control({ id: 'priority', type: 'radio', role: 'radio', ariaChecked: 'true' }),
  ];
  const changedControls = [
    control({ id: 'customer-name', value: 'Bob' }),
    control({ id: 'priority', type: 'radio', role: 'radio', ariaChecked: 'true' }),
  ];
  const restoredControls = [
    control({ id: 'customer-name', value: 'Alice' }),
    control({ id: 'priority', type: 'radio', role: 'radio', ariaChecked: 'true' }),
  ];

  const baseline = captureWizardState(fakeRoot(baselineControls));
  const changed = captureWizardState(fakeRoot(changedControls));
  const restored = captureWizardState(fakeRoot(restoredControls));

  assert.equal(wizardStateChanged(baseline, changed), true);
  assert.equal(wizardStateChanged(baseline, restored), false);
});

test('wizard state fingerprint includes checked choices', () => {
  const unchecked = captureWizardState(fakeRoot([
    control({ id: 'urgent', type: 'checkbox', checked: false }),
  ]));
  const checked = captureWizardState(fakeRoot([
    control({ id: 'urgent', type: 'checkbox', checked: true }),
  ]));

  assert.equal(wizardStateChanged(unchecked, checked), true);
});

test('programmatic location actions are classified without flagging read-only map search', () => {
  assert.equal(
    isWizardMutatingButtonLabel('Localiser cette adresse sur la carte'),
    true,
  );
  assert.equal(
    isWizardMutatingButtonLabel('Utiliser ce point'),
    true,
  );
  assert.equal(
    isWizardMutatingButtonLabel('Ouvrir dans Google Maps'),
    false,
  );
});

test('persisted partial outcomes bypass the unsaved warning', () => {
  assert.equal(
    isPersistedWizardCounterText('Intervention 42 enregistrée'),
    true,
  );
  assert.equal(
    isPersistedWizardCounterText('Étape 3 / 6'),
    false,
  );
});

test('guard boundary protects all dismissal paths and reconciles the baseline', () => {
  const source = readSource('../components/GuardedJobWizard.jsx');

  assert.match(source, /onPointerDownCapture=\{freezeInitialState\}/);
  assert.match(source, /onKeyDownCapture=\{freezeInitialState\}/);
  assert.match(source, /onBeforeInputCapture=\{freezeInitialState\}/);
  assert.match(source, /onInputCapture=\{scheduleDirtyReconciliation\}/);
  assert.match(source, /onChangeCapture=\{scheduleDirtyReconciliation\}/);
  assert.match(source, /wizardStateChanged\(/);
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /inert=\{confirmOpen \? true : undefined\}/);
  assert.match(source, /Abandonner les modifications \?/);
  assert.match(source, /Continuer la saisie/);
  assert.match(source, /persistedRef\.current = true/);
});

test('create and edit adapters all use the guarded wizard boundary', () => {
  const adapterPaths = [
    '../components/AddJobButton.jsx',
    '../components/AddJobModal.jsx',
    '../components/EditJobWindow.jsx',
  ];

  adapterPaths.forEach((relativePath) => {
    const source = readSource(relativePath);
    assert.match(source, /from '\.\/GuardedJobWizard'/);
    assert.doesNotMatch(source, /from '\.\/JobWizard'/);
  });
});
