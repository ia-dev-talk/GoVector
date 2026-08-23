import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasPersonnelServerConflict,
  isPersonnelDraftDirty,
  personnelDraftFingerprint,
  personnelServerFingerprint,
} from './personnelDraftGuard.js';

test('personnel draft fingerprint detects real control changes and reversions', () => {
  const baseline = personnelDraftFingerprint([
    { type: 'text', value: 'Nadia', checked: false },
    { type: 'checkbox', value: '4', checked: true },
  ]);
  const changed = personnelDraftFingerprint([
    { type: 'text', value: 'Nadia A.', checked: false },
    { type: 'checkbox', value: '4', checked: true },
  ]);
  const restored = personnelDraftFingerprint([
    { type: 'text', value: 'Nadia', checked: false },
    { type: 'checkbox', value: '4', checked: true },
  ]);

  assert.equal(isPersonnelDraftDirty(baseline, changed), true);
  assert.equal(isPersonnelDraftDirty(baseline, restored), false);
});

test('server fingerprint is stable for reordered sector and skill arrays', () => {
  const left = personnelServerFingerprint({
    id: 9,
    name: 'Nadia',
    sector_ids: [4, 2, 4],
    skills: ['SAV', 'Raccordement'],
    live_status: 'DISPONIBLE',
  });
  const right = personnelServerFingerprint({
    id: 9,
    name: 'Nadia',
    sector_ids: [2, 4],
    skills: ['Raccordement', 'SAV'],
    live_status: 'disponible',
  });

  assert.equal(left, right);
});

test('server conflict is reported only while a dirty draft exists', () => {
  const baseline = personnelServerFingerprint({ id: 9, phone: '0600000000' });
  const refreshed = personnelServerFingerprint({ id: 9, phone: '0611111111' });

  assert.equal(hasPersonnelServerConflict({
    dirty: true,
    baselineFingerprint: baseline,
    currentFingerprint: refreshed,
  }), true);
  assert.equal(hasPersonnelServerConflict({
    dirty: false,
    baselineFingerprint: baseline,
    currentFingerprint: refreshed,
  }), false);
  assert.equal(hasPersonnelServerConflict({
    dirty: true,
    baselineFingerprint: baseline,
    currentFingerprint: baseline,
  }), false);
});
