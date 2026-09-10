import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  JOB_TYPES_CONFIG,
  WIZARD_JOB_TYPE_OPTIONS,
  WIZARD_STEPS,
} from './job-types.js';

const wizardSource = readFileSync('src/components/JobWizard.jsx', 'utf8');

test('BlueVector exposes only the validated Praxedo intervention types', () => {
  assert.deepEqual(
    WIZARD_JOB_TYPE_OPTIONS.map((option) => option.label),
    ['FTTH Réalisable', 'PB', 'PM', 'PTO', 'SORTIE DE PCO IAM'],
  );
  assert.deepEqual(
    Object.values(JOB_TYPES_CONFIG).map((config) => config.avgDuration),
    [60, 15, 180, 15, 180],
  );
  for (const config of Object.values(JOB_TYPES_CONFIG)) {
    assert.deepEqual(config.fields, []);
    assert.deepEqual(config.required, []);
  }
});

test('the BlueVector wizard wires only creation qualification and assignment', () => {
  assert.deepEqual(
    WIZARD_STEPS.map((step) => step.id),
    ['creation', 'qualification', 'affectation'],
  );
  assert.match(
    wizardSource,
    /const stepRenderers = \[\s*renderPilotCreation,\s*renderPilotQualification,\s*renderStepAssignment,\s*\]/,
  );
  assert.doesNotMatch(wizardSource, /placeholder="fibre, routeur, PON"/);
  assert.doesNotMatch(wizardSource, /Créer une intervention FTTH/);
  assert.doesNotMatch(wizardSource, /Modifier une intervention FTTH/);
});

test('active wizard copy does not expose internal product or audit terminology', () => {
  const start = wizardSource.indexOf('const renderPilotCreation');
  const end = wizardSource.indexOf('const LEGACY_RENDER_STEP_TYPE');
  const activeCreationFlow = wizardSource.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(
    activeCreationFlow,
    /Praxedo|BlueVector|\bpilote\b|\blegacy\b|\bdebug\b|\bmock\b|source de vérité|\bIA\b|\bAI\b/i,
  );
  assert.doesNotMatch(activeCreationFlow, /\bNRO\b|\bSRO\b|\bPBO\b|G657A2|nombre de fibres/i);
});

test('required skills are a closed catalog-backed Praxedo reference', () => {
  for (const label of [
    'PB',
    'PM',
    'POSE DE CABLE SPCO',
    'PTO',
    'RACCORDEMENT REALISABLE',
    'RACCORDEMENT SAV',
  ]) {
    assert.ok(wizardSource.includes(`label: '${label}'`));
  }
  assert.match(wizardSource, /businessCatalog\?\.technician_skills/);
  assert.match(wizardSource, /type="checkbox"/);
});

test('login and navigation expose the BlueVector identity without legacy logo dependencies', () => {
  const appLayout = readFileSync('src/components/layout/AppLayout.jsx', 'utf8');
  const login = readFileSync('src/components/login.jsx', 'utf8');

  assert.match(appLayout, /const PRODUCT_NAME = 'BlueVector'/);
  assert.match(login, /const PRODUCT_NAME = 'BlueVector'/);
  assert.match(appLayout, /function ProductMark/);
  assert.match(appLayout, /\{PRODUCT_NAME\}/);
  assert.match(login, /\{PRODUCT_NAME\}/);
  assert.doesNotMatch(appLayout, /govector-logo\.png|GoVector|GOVECTOR/);
  assert.doesNotMatch(login, /govector-logo\.png|GoVector|GOVECTOR/);
});
