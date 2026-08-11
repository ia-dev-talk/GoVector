import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getFileColumnOverrides,
  getFileHeaderRowOverrides,
  getScopedImportKey,
} from './import-mapping.js';

const iamFile = { name: 'commandes.xlsx', size: 120, lastModified: 1 };
const orangeFile = { name: 'commandes.xlsx', size: 240, lastModified: 2 };

test('column corrections remain isolated between imported files', () => {
  const mappings = {
    [getScopedImportKey(iamFile, 'CLIENT')]: 'INTITULE_CLIENT',
    [getScopedImportKey(orangeFile, 'CLIENT')]: 'REFERENCE',
    [getScopedImportKey(iamFile, 'COLONNE INUTILE')]: null,
  };

  assert.deepEqual(getFileColumnOverrides(mappings, iamFile), {
    CLIENT: 'INTITULE_CLIENT',
    'COLONNE INUTILE': null,
  });
  assert.deepEqual(getFileColumnOverrides(mappings, orangeFile), {
    CLIENT: 'REFERENCE',
  });
});

test('header row corrections remain isolated between files and sheets', () => {
  const mappings = {
    [getScopedImportKey(iamFile, 'Commandes')]: 3,
    [getScopedImportKey(iamFile, 'Synthèse')]: 5,
    [getScopedImportKey(orangeFile, 'Commandes')]: 1,
  };

  assert.deepEqual(getFileHeaderRowOverrides(mappings, iamFile), {
    Commandes: 3,
    Synthèse: 5,
  });
  assert.deepEqual(getFileHeaderRowOverrides(mappings, orangeFile), {
    Commandes: 1,
  });
});
