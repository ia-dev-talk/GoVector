import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  isPersistedWizardCounterText,
  isWizardMutatingButtonLabel,
  shouldWarnBeforeWizardClose,
} from './jobWizardUnsavedChanges.js';

function readSource(relativePath) {
  return readFileSync(
    new URL(relativePath, import.meta.url),
    'utf8',
  );
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

test('guard boundary protects all dismissal paths and stays accessible', () => {
  const source = readSource('../components/GuardedJobWizard.jsx');

  assert.match(source, /onInputCapture=\{markDirty\}/);
  assert.match(source, /onChangeCapture=\{markDirty\}/);
  assert.match(source, /onClickCapture=\{handleClickCapture\}/);
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
