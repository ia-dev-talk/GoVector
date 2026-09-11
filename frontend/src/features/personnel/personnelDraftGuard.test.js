import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

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

test('Personnel general save uses the revision-guarded atomic profile endpoint', () => {
  const source = readFileSync(
    new URL('../../pages/PersonnelPage.jsx', import.meta.url),
    'utf8',
  );
  const saveStart = source.indexOf('const handleSaveTech = useCallback');
  const saveEnd = source.indexOf('const handleInspectorSave = useCallback', saveStart);
  assert.ok(saveStart >= 0 && saveEnd > saveStart);

  const saveBlock = source.slice(saveStart, saveEnd);
  assert.match(saveBlock, /profile-save/);
  assert.match(saveBlock, /expected_updated_at/);
  assert.doesNotMatch(saveBlock, /api\.updateTechnician\(/);
  assert.doesNotMatch(saveBlock, /personnelSectorApi\.updateAssignment\(/);
  assert.match(saveBlock, /error\?\.response\?\.status === 409/);
  assert.doesNotMatch(source, /OVERWRITE_TECHNICIAN_CHANGES_MESSAGE/);
  assert.match(source, /userRole === 'ADMIN' \|\| userRole === 'ORIENTEUR'/);
});

test('technician skills use the governed FTTH checklist and keep backend codes', () => {
  const source = readFileSync(
    new URL('./PersonnelInspector.jsx', import.meta.url),
    'utf8',
  );
  for (const code of [
    'PB',
    'PM',
    'POSE_CABLE_SPCO',
    'PTO',
    'RACCORDEMENT_REALISABLE',
    'RACCORDEMENT_SAV',
  ]) {
    assert.match(source, new RegExp(`code: '${code}'`));
  }
  assert.match(source, /type="checkbox"/);
  assert.match(source, /toggleSkill\(skill\.code\)/);
  assert.doesNotMatch(source, /value=\{form\.skills\.join/);
});
