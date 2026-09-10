import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const coreVisiblePilotFiles = [
  'index.html',
  'src/components/layout/AppLayout.jsx',
  'src/pages/DashboardHome.jsx',
  'src/features/reports-v3/ReportsQualityPanel.jsx',
  'src/components/export/ExportCenter.jsx',
];

const visiblePilotFiles = [
  ...coreVisiblePilotFiles,
  'src/features/intervention-detail/InterventionGraphicalTools.jsx',
  'src/features/intervention-detail/ImageAnnotationDialog.jsx',
  'src/features/intervention-detail/InterventionTimeline.jsx',
  'src/features/intervention-detail/InterventionEvidencePanel.jsx',
  'src/features/intervention-detail/SketchDialog.jsx',
  'src/features/stock-v3/SerializedEquipmentRegistry.jsx',
  'src/features/stock-v3/StockIssueModal.jsx',
  'src/pages/StocksPage.jsx',
];

const forbiddenVisibleFragments = [
  'Croquis BlueVector',
  'BlueVector crée',
  'par BlueVector',
  'Site BlueVector',
  'Preuve graphique BlueVector',
  'Emplacement BlueVector',
  'dans BlueVector',
  'bluevector-stock-',
];

test('pilot web surfaces expose GoVector without legacy visible branding', () => {
  for (const path of visiblePilotFiles) {
    const source = readFileSync(path, 'utf8');
    assert.match(source, /govector/i);
    if (coreVisiblePilotFiles.includes(path)) {
      assert.doesNotMatch(source, />[^<]*(?:BlueVector|FieldOpt)[^<]*</i);
      assert.doesNotMatch(source, /['"`]Export (?:BlueVector|FieldOpt)/i);
    }
    for (const fragment of forbiddenVisibleFragments) {
      assert.ok(!source.includes(fragment), `${path} contient encore ${fragment}`);
    }
  }
});
