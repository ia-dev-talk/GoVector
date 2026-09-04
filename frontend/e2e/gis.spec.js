import { test, expect } from '@playwright/test';

test('client GIS flow previews, persists a draft, publishes and downloads a complete layer', async ({ page }, testInfo) => {
  const datasets = [];
  const geometry = { type: 'LineString', coordinates: [[-7.62, 33.59], [-7.61, 33.60]] };
  await page.route('**/admin/v1/clients', (route) => route.fulfill({ json: [
    { id: 12, name: 'Entreprise Casablanca', is_active: true }, { id: 13, name: 'Entreprise Rabat', is_active: true },
  ] }));
  await page.route('**/api/v1/gis-datasets**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/preview')) {
      await route.fulfill({ json: { sha256: 'a'.repeat(64), feature_count: 1, source_type: 'KML',
        bbox: [-7.62, 33.59, -7.61, 33.60], warnings: [], sample_is_partial: false,
        sample: [{ name: 'Câble A', type: 'LineString', geometry }],
        layers: [{ folder_path: 'Réseau', geometry_type: 'LineString', feature_count: 1 }] } });
    } else if (url.pathname.endsWith('/publish')) {
      expect(request.postDataJSON()).toEqual({ expected_revision: 1 });
      datasets[0].status = 'PUBLISHED'; datasets[0].revision = 2;
      await route.fulfill({ json: datasets[0] });
    } else if (url.pathname.endsWith('/layers')) {
      await route.fulfill({ json: [{ id: 55, name: 'Réseau', geometry_type: 'LineString', feature_count: 1 }] });
    } else if (url.pathname.endsWith('/geojson')) {
      expect(url.searchParams.get('layer_id')).toBe('55');
      await route.fulfill({ contentType: 'application/geo+json', json: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry, properties: {} }] } });
    } else if (request.method() === 'POST') {
      expect(request.postData()).toContain('name="expected_sha256"');
      expect(request.postData()).toContain('a'.repeat(64));
      datasets.push({ id: 8, name: 'Réseau Casablanca', client_organization_id: 12, status: 'DRAFT', revision: 1, feature_count: 1, source_filename: 'network.kml' });
      await route.fulfill({ json: { ...datasets[0], reused: false } });
    } else {
      const clientId = Number(url.searchParams.get('client_organization_id'));
      await route.fulfill({ json: { items: datasets.filter((d) => d.client_organization_id === clientId), next_after_id: null } });
    }
  });
  await page.goto('/e2e/orienteur-harness.html');
  await page.waitForFunction(() => typeof window.renderGis === 'function');
  await page.evaluate(() => window.renderGis());
  await page.getByText('Jeux de données SIG · KML/KMZ et QGIS', { exact: true }).click();
  await page.getByLabel('Entreprise du jeu de données').selectOption('12');
  await page.getByLabel('Nom du jeu de données').fill('Réseau Casablanca');
  await page.getByLabel('Fichier KML ou KMZ').setInputFiles({ name: 'network.kml', mimeType: 'application/xml', buffer: Buffer.from('<kml/>') });
  await page.getByRole('button', { name: 'Analyser le fichier' }).click();
  await expect(page.locator('.leaflet-overlay-pane svg path')).toHaveCount(1);
  await expect(page.getByText('1 objet(s), 1 couche(s)')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('gis-preview-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('gis-preview-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(page.getByText('Brouillon · révision 1 · 1 objet(s)')).toBeVisible();
  await page.getByRole('button', { name: 'Voir l’aperçu' }).click();
  await expect(page.getByText('Aperçu enregistré : Réseau Casablanca')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enregistrer le brouillon' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Fermer l’aperçu' }).click();
  await page.getByRole('button', { name: 'Publier', exact: true }).click();
  await expect(page.getByText('Publié · révision 2 · 1 objet(s)')).toBeVisible();
  await page.getByRole('button', { name: 'Exporter les couches' }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Réseau · LineString (1)' }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('bluevector-8-couche-55.geojson');
  await page.getByLabel('Entreprise du jeu de données').selectOption('13');
  await expect(page.getByText('Réseau Casablanca', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Aucun jeu de données chargé pour cette entreprise.')).toBeVisible();
});

test('an invalid GIS file cannot become a draft', async ({ page }) => {
  await page.route('**/admin/v1/clients', (route) => route.fulfill({ json: [{ id: 1, name: 'Client', is_active: true }] }));
  await page.route('**/gis-datasets?**', (route) => route.fulfill({ json: { items: [], next_after_id: null } }));
  await page.route('**/gis-datasets/preview', (route) => route.fulfill({ status: 422, json: { detail: 'Géométrie invalide' } }));
  await page.goto('/e2e/orienteur-harness.html');
  await page.waitForFunction(() => typeof window.renderGis === 'function');
  await page.evaluate(() => window.renderGis());
  await page.locator('summary').click();
  await page.getByLabel('Entreprise du jeu de données').selectOption('1');
  await page.getByLabel('Fichier KML ou KMZ').setInputFiles({ name: 'invalid.kml', mimeType: 'application/xml', buffer: Buffer.from('invalid') });
  await page.getByRole('button', { name: 'Analyser le fichier' }).click();
  await expect(page.getByRole('alert')).toHaveText('Géométrie invalide');
  await expect(page.getByRole('button', { name: 'Enregistrer le brouillon' })).toHaveCount(0);
});
