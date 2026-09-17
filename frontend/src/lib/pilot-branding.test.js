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
  'BlueVector',
  'BlueVecto',
  'FieldOpt',
  'bluevector-stock-',
];

test('pilot web surfaces expose GoVector without historical visible branding', () => {
  for (const path of visiblePilotFiles) {
    const source = readFileSync(path, 'utf8');

    if (coreVisiblePilotFiles.includes(path)) {
      assert.match(source, /GoVector/i, `${path} doit afficher GoVector`);
    }

    for (const fragment of forbiddenVisibleFragments) {
      assert.ok(
        !source.includes(fragment),
        `${path} contient encore le branding visible historique ${fragment}`,
      );
    }
  }
});

test('pilot light theme loads contrast hardening last for legacy operational surfaces', () => {
  const main = readFileSync('src/main.jsx', 'utf8');
  const styles = readFileSync('src/styles/contrast-hardening.css', 'utf8');
  const deliveryIndex = main.indexOf("./styles/delivery-final-fixes.css");
  const contrastIndex = main.indexOf("./styles/contrast-hardening.css");

  assert.ok(deliveryIndex >= 0, 'la couche delivery finale doit rester chargée');
  assert.ok(
    contrastIndex > deliveryIndex,
    'le durcissement de contraste doit être chargé après le thème delivery',
  );

  for (const selector of [
    '.admin-section-title',
    '.rv3-kpi-main strong',
    '.st3-kpi-value',
    '.sv3-kpi-value',
    '.personnel-v3-kpi-copy strong',
    '.intervention-period-presets button.is-active',
    '.intervention-period-table-wrap',
  ]) {
    assert.ok(
      styles.includes(selector),
      `contraste light-theme non verrouillé pour ${selector}`,
    );
  }
});
