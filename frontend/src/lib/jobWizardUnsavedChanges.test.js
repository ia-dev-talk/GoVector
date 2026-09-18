import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  captureWizardState,
  createWizardStateTracker,
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
  name = '',
  type = 'text',
  value = '',
  checked = false,
  role = '',
  ariaChecked = '',
}) {
  return {
    id,
    name,
    type,
    value,
    checked,
    tagName: type === 'select-one' ? 'SELECT' : 'INPUT',
    getAttribute(attribute) {
      if (attribute === 'role') return role || null;
      if (attribute === 'aria-checked') return ariaChecked || null;
      if (attribute === 'data-field') return null;
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

test('step navigation discovers fields without making the wizard dirty', () => {
  const tracker = createWizardStateTracker();

  assert.equal(
    tracker.observe(fakeRoot([
      control({ id: 'customer-name', value: 'Alice' }),
    ])),
    false,
  );
  assert.equal(
    tracker.observe(fakeRoot([
      control({ id: 'scheduled-date', type: 'date', value: '2026-08-21' }),
    ])),
    false,
  );
  assert.equal(tracker.isChanged(), false);
});

test('a real edit remains dirty across steps and clears after exact restoration', () => {
  const tracker = createWizardStateTracker();
  const initialCustomer = fakeRoot([
    control({ id: 'customer-name', value: 'Alice' }),
  ]);

  tracker.observe(initialCustomer);
  assert.equal(
    tracker.observe(fakeRoot([
      control({ id: 'customer-name', value: 'Bob' }),
    ])),
    true,
  );

  assert.equal(
    tracker.observe(fakeRoot([
      control({ id: 'scheduled-date', type: 'date', value: '2026-08-21' }),
    ])),
    true,
  );

  assert.equal(tracker.observe(initialCustomer), false);
  assert.equal(tracker.isChanged(), false);
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

test('guard boundary protects dismissal paths without treating step DOM as the baseline', () => {
  const source = readSource('../components/GuardedJobWizard.jsx');

  assert.match(source, /createWizardStateTracker\(\)/);
  assert.match(source, /onPointerDownCapture=\{observeCurrentFields\}/);
  assert.match(source, /onKeyDownCapture=\{observeCurrentFields\}/);
  assert.match(source, /onBeforeInputCapture=\{observeCurrentFields\}/);
  assert.match(source, /onInputCapture=\{scheduleDirtyReconciliation\}/);
  assert.match(source, /onChangeCapture=\{scheduleDirtyReconciliation\}/);
  assert.doesNotMatch(source, /initialStateRef/);
  assert.match(source, /role="alertdialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /inert=\{confirmOpen \? true : undefined\}/);
  assert.match(source, /Abandonner les modifications \?/);
  assert.match(source, /Continuer la saisie/);
  assert.match(source, /persistedRef\.current = true/);
});

test('creation adapters keep the guarded wizard boundary', () => {
  const adapterPaths = [
    '../components/AddJobButton.jsx',
    '../components/AddJobModal.jsx',
  ];

  adapterPaths.forEach((relativePath) => {
    const source = readSource(relativePath);
    assert.match(source, /from '\.\/GuardedJobWizard'/);
    assert.doesNotMatch(source, /from '\.\/JobWizard'/);
  });
});

test('full intervention edit adapter uses its own unsaved-change guard', () => {
  const adapter = readSource('../components/EditJobWindow.jsx');
  const editor = readSource('../components/AdvancedJobEditor.jsx');
  const styles = readSource('../components/AdvancedJobEditor.css');

  assert.match(adapter, /from '\.\/AdvancedJobEditor'/);
  assert.doesNotMatch(adapter, /from '\.\/JobWizard'/);
  assert.match(editor, /dirty && !window\.confirm/);
  assert.match(editor, /Fermer sans enregistrer les modifications \?/);
  assert.match(editor, /setDirty\(false\)/);
  assert.match(styles, /\.aje-modal\s*\{[\s\S]*?height:\s*min\(94dvh,\s*1000px\)/);
  assert.match(styles, /\.aje-modal\s*\{[\s\S]*?display:\s*flex/);
  assert.match(styles, /\.aje-body\s*\{[\s\S]*?flex:\s*1 1 auto/);
  assert.match(styles, /\.aje-body\s*\{[\s\S]*?overflow-y:\s*auto/);
  assert.match(styles, /\.aje-footer\s*\{[\s\S]*?flex:\s*0 0 auto/);
});
