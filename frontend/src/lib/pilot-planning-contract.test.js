import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const planningSource = readFileSync('src/pages/PlanningPage.jsx', 'utf8');
const interventionsSource = readFileSync('src/pages/InterventionsPage.jsx', 'utf8');
const layoutSource = readFileSync('src/components/layout/AppLayout.jsx', 'utf8');
const appSource = readFileSync('src/App.jsx', 'utf8');

test('pilot exposes a dedicated planning workspace instead of duplicating Interventions', () => {
  assert.match(planningSource, /<h1>Planning<\/h1>/);
  assert.match(planningSource, /api\.getJobs\(\{ scheduled_date:/);
  assert.match(planningSource, /api\.getTechnicians\(\)/);
  assert.match(planningSource, /Non affectées/);
  assert.match(planningSource, /Filtrer par technicien/);
  assert.match(planningSource, /onNavigate\(\s*'interventions'/);

  assert.match(interventionsSource, /page === 'planning'/);
  assert.match(interventionsSource, /<PlanningPage \{\.\.\.props\} \/>/);
  assert.match(appSource, /planning:\s*\[\s*'ADMIN',\s*'ORIENTEUR'/);
});

test('pilot sidebar keeps office workspaces explicit and uses field-agent business terminology', () => {
  for (const label of [
    'Tableau de bord',
    'Interventions',
    'Planning',
    'Agents terrain',
    'Techniciens',
    'Stock',
    'Rapports',
  ]) {
    assert.ok(layoutSource.includes(`label: '${label}'`), `navigation manquante : ${label}`);
  }

  assert.match(layoutSource, /CHEF_ORIENTEUR:[\s\S]*label: 'Agent terrain'/);
  assert.match(layoutSource, /ORIENTEUR:[\s\S]*label: 'Orienteur Bureau'/);
  assert.match(layoutSource, /const PRODUCT_NAME = 'BlueVector'/);
});
