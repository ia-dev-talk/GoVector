import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeCanonicalOptions,
  canonicalLinkState,
  catalogRowKey,
  isCustomCatalogItem,
  normalizeCatalogCode,
  removeCatalogItem,
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


test('catalog deletion policy only exposes server-classified custom rows', () => {
  assert.equal(isCustomCatalogItem({ metadata: { custom: true } }), true);
  assert.equal(isCustomCatalogItem({ metadata: { custom: false } }), false);
  assert.equal(isCustomCatalogItem({ metadata: {} }), false);
  assert.equal(isCustomCatalogItem(null), false);
});


test('canonical choices only include active system behaviors', () => {
  const items = [
    { code: 'installation', label: 'Installation', active: true, metadata: { custom: false } },
    { code: 'repair', label: 'Réparation', active: false, metadata: { custom: false } },
    { code: 'vip', label: 'VIP', active: true, metadata: { custom: true, canonical: 'installation' } },
  ];

  assert.deepEqual(activeCanonicalOptions(items).map((item) => item.code), ['installation']);
  assert.equal(canonicalLinkState(items[2], items).status, 'active');
  assert.equal(
    canonicalLinkState({ ...items[2], metadata: { custom: true, canonical: 'repair' } }, items).status,
    'archived',
  );
});


test('removing a custom catalog row does not mutate the source collection', () => {
  const source = [
    { code: 'junior', metadata: { custom: false } },
    { code: 'expert_ftth', metadata: { custom: true } },
    { code: 'senior', metadata: { custom: false } },
  ];

  const next = removeCatalogItem(source, 1);

  assert.deepEqual(next.map((item) => item.code), ['junior', 'senior']);
  assert.equal(source.length, 3);
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


test('active aliases cannot keep an archived canonical behavior', () => {
  const values = {
    job_types: [
      { code: 'installation', label: 'Installation', active: false, metadata: { custom: false } },
      {
        code: 'installation_vip',
        label: 'Installation VIP',
        active: true,
        metadata: { custom: true, canonical: 'installation' },
      },
    ],
  };

  const messages = validateBusinessCatalogDraft(values);

  assert.equal(messages.length, 1);
  assert.match(messages[0], /installation_vip/);
  assert.match(messages[0], /installation/);
  assert.match(messages[0], /archivé/);
});


test('archived aliases may preserve an archived canonical for history', () => {
  const values = {
    field_actions: [
      { code: 'scan', label: 'Scan', active: false, metadata: { custom: false } },
      {
        code: 'scan_legacy',
        label: 'Scan legacy',
        active: false,
        metadata: { custom: true, canonical: 'scan' },
      },
    ],
  };

  assert.deepEqual(validateBusinessCatalogDraft(values), []);
});


test('settings navigation has no duplicate user-facing labels', () => {
  const labels = SETTINGS_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.label));
  assert.equal(new Set(labels).size, labels.length);
});
