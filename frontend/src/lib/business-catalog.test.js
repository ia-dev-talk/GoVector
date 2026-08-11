import assert from 'node:assert/strict';
import test from 'node:test';

import {
  catalogRowKey,
  normalizeCatalogCode,
  validateBusinessCatalogDraft,
} from './business-catalog.js';
import { SETTINGS_NAV_GROUPS } from '../features/settings-v3/settingsCatalog.js';


test('catalog rows keep a stable identity while their editable code changes', () => {
  assert.equal(catalogRowKey('technician_grades', 2), 'technician_grades:2');
});


test('catalog identifiers are normalized without losing subsequent keystrokes', () => {
  assert.equal(normalizeCatalogCode('Référent FTTH'), 'referent_ftth');
  assert.equal(normalizeCatalogCode('senior-n2'), 'senior-n2');
});


test('catalog validation rejects duplicate identifiers and empty labels', () => {
  const messages = validateBusinessCatalogDraft({
    technician_grades: [
      { code: 'senior', label: 'Senior' },
      { code: 'senior', label: '' },
    ],
  });

  assert.equal(messages.length, 2);
  assert.match(messages[0], /plusieurs fois/);
  assert.match(messages[1], /libellé obligatoire/);
});


test('catalog validation mirrors the backend identifier contract', () => {
  const messages = validateBusinessCatalogDraft({
    technician_grades: [
      { code: '1', label: 'Invalide' },
      { code: 'senior_n2', label: 'Senior N2' },
    ],
  });

  assert.equal(messages.length, 1);
  assert.match(messages[0], /commençant par une lettre/);
});


test('settings navigation has no duplicate user-facing labels', () => {
  const labels = SETTINGS_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label));
  assert.equal(new Set(labels).size, labels.length);
});
