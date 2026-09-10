import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const coreVisiblePilotFiles = [
  'index.html',
  'src/components/login.jsx',
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
  'GoVector',
  'GOVECTOR',
  'FieldOpt',
  'govector-stock-',
];

test('pilot web surfaces expose BlueVector without legacy visible branding', () => {
  for (const path of visiblePilotFiles) {
    const source = readFileSync(path, 'utf8');

    if (coreVisiblePilotFiles.includes(path)) {
      assert.match(source, /BlueVector/i, `${path} doit afficher BlueVector`);
    }

    for (const fragment of forbiddenVisibleFragments) {
      assert.ok(
        !source.includes(fragment),
        `${path} contient encore le branding historique ${fragment}`,
      );
    }
  }
});
