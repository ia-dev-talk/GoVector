import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/admin/v1/clients', (route) => route.fulfill({ json: [{ id: 12, name: 'Entreprise Casablanca', is_active: true }] }));
});

// Run against the Vite dev server; this isolated harness is not shipped in dist.
const analysis = {
  next_step: 'Examiner les preuves terrain avant la validation bureau.',
  lifecycle: { label: 'En attente de validation' }, current_visit: null,
  material: { movement_count: 2, unlinked_visit_count: 1 },
  findings: [{ code: 'material_without_visit', label: 'Un mouvement sans passage identifié', severity: 'info' }],
  limitations: ['Disponibilité des candidats non évaluée.'], generated_at: '2026-09-04T12:00:00Z',
};

test('analysis is on demand, handles errors, and clears when changing dossier', async ({ page }, testInfo) => {
  let count = 0;
  await page.route('**/orienteur-agent/jobs/*/assessment', async (route) => {
    count += 1;
    await route.fulfill({ json: analysis });
  });
  await page.goto('/e2e/orienteur-harness.html');
  await expect(page.getByRole('button', { name: 'Analyser le dossier' })).toBeVisible();
  expect(count).toBe(0);
  await page.getByRole('button', { name: 'Analyser le dossier' }).click();
  await expect(page.getByText(analysis.next_step)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('assessment-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('assessment-mobile.png') });
  await page.evaluate(() => window.renderAssessment(2));
  await expect(page.getByText(analysis.next_step)).toHaveCount(0);
  await page.unroute('**/orienteur-agent/jobs/*/assessment');
  await page.route('**/orienteur-agent/jobs/*/assessment', (route) => route.fulfill({ status: 403, json: {} }));
  await page.getByRole('button', { name: 'Analyser le dossier' }).click();
  await expect(page.getByRole('alert')).toContainText('responsables autorisés');
});

test('closure editor is reachable and preserves five-photo requirements, other settings and operator precedence', async ({ page }, testInfo) => {
  let saved;
  const values = {
    gps_stale_after_minutes: 25,
    orienteur_observation: { appointment_grace_minutes: 75, flag_missing_sector: false },
    completion_policy: { default: { minimum_photos: 5 }, by_job_type: {}, by_operator: { ORANGE: { minimum_photos: 8 } } },
  };
  await page.route('**/settings/catalog', (route) => route.fulfill({ json: { values: { job_types: [] } } }));
  await page.route('**/settings/operational', async (route) => {
    if (route.request().method() === 'PUT') saved = route.request().postDataJSON();
    await route.fulfill({ json: { revision: saved ? 8 : 7, values: saved?.values ?? values } });
  });
  await page.goto('/e2e/orienteur-harness.html');
  await page.evaluate(() => window.renderSettingsPage());
  await page.getByRole('button', { name: /Clôture terrain/ }).click();
  const photos = page.getByRole('spinbutton').first();
  await expect(photos).toHaveValue('5');
  await photos.fill('6');
  await page.getByLabel('Entreprise cliente', { exact: true }).selectOption('12');
  await page.getByRole('button', { name: 'Ajouter la règle client' }).click();
  await page.getByRole('button', { name: 'Enregistrer la politique' }).click();
  await expect(page.getByRole('button', { name: 'Enregistrer la politique' })).toBeDisabled();
  expect(saved.expected_revision).toBe(7);
  expect(saved.values.completion_policy.default.minimum_photos).toBe(6);
  expect(saved.values.completion_policy.by_operator.ORANGE.minimum_photos).toBe(8);
  expect(saved.values.completion_policy.by_client_organization['12'].minimum_photos).toBe(6);
  expect(saved.values.orienteur_observation.appointment_grace_minutes).toBe(75);
  await page.screenshot({ path: testInfo.outputPath('closure-settings-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('closure-settings-mobile.png'), fullPage: true });
});

test('closure editor cannot save when the authoritative settings failed to load', async ({ page }) => {
  await page.route('**/settings/catalog', (route) => route.fulfill({ json: { values: {} } }));
  await page.route('**/settings/operational', (route) => route.fulfill({ status: 503, json: {} }));
  await page.goto('/e2e/orienteur-harness.html');
  await page.evaluate(() => window.renderCompletion());
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enregistrer la politique' })).toBeDisabled();
  await expect(page.getByRole('spinbutton').first()).toBeDisabled();
});

test('settings save preserves other policies and the revision, invalid input is blocked', async ({ page }) => {
  let saved;
  let document = { revision: 4, values: {
    gps_stale_after_minutes: 20, gps_history_retention_days: 90,
    completion_policy: { default: { minimum_photos: 2 } },
    orienteur_observation: { appointment_grace_minutes: 30, flag_missing_sector: true },
  } };
  await page.route('**/settings/operational', async (route) => {
    if (route.request().method() === 'PUT') {
      saved = route.request().postDataJSON();
      document = { revision: 5, values: saved.values };
    }
    await route.fulfill({ json: document });
  });
  await page.goto('/e2e/orienteur-harness.html');
  await page.evaluate(() => window.renderSettings());
  const input = page.getByLabel('Tolérance après le rendez-vous (minutes)');
  await expect(input).toHaveValue('30');
  await input.fill('1441');
  await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled();
  await input.fill('75');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enregistrer', exact: true })).toBeDisabled();
  expect(saved.expected_revision).toBe(4);
  expect(saved.values.completion_policy.default.minimum_photos).toBe(2);
  expect(saved.values.gps_stale_after_minutes).toBe(20);
  expect(saved.values.orienteur_observation.appointment_grace_minutes).toBe(75);
  await page.reload();
  await page.evaluate(() => window.renderSettings());
  await expect(input).toHaveValue('75');
});
