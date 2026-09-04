import { test, expect } from '@playwright/test';

const result = {
  assessment_status: 'REVIEW', total_candidates: 2, candidate_limit: 1, truncated: true,
  generated_at: '2026-09-04T12:00:00Z', execution_enabled: false,
  candidates: [{ technician_id: 1, name: 'Technicien Casablanca', status: 'EXCLUDED', ready_for_assignment: false,
    checks: [
      { code: 'skills', state: 'FAIL', label: 'Compétences requises manquantes', source: 'Job.required_skills / Technician.skills', missing_skills: ['soudure-fibre'] },
      { code: 'planning', state: 'FAIL', label: 'Chevauchement planifié détecté', source: 'Assignment / Job.scheduled_date', overlapping_assignment_count: 1 },
      { code: 'travel_and_stock', state: 'UNKNOWN', label: 'Matériel requis non évalué', source: 'Besoins à confirmer' },
    ] }], limitations: ['Les disponibilités réelles restent à confirmer.'],
};

test('candidate comparison is explicit, read-only and displays unknowns and truncation', async ({ page }, testInfo) => {
  let calls = 0;
  await page.route('**/orienteur-agent/jobs/*/candidates', (route) => {
    expect(route.request().method()).toBe('GET'); calls += 1;
    return route.fulfill({ json: result });
  });
  await page.goto('/e2e/orienteur-harness.html');
  await expect(page.getByRole('button', { name: 'Examiner les candidats' })).toBeVisible();
  expect(calls).toBe(0);
  await page.getByRole('button', { name: 'Examiner les candidats' }).click();
  await expect(page.getByText('Analyse partielle : limite de 1 profil(s) par comparaison.')).toBeVisible();
  await page.getByText('Technicien Casablanca · Écart détecté').click();
  await expect(page.getByText(/soudure-fibre/)).toBeVisible();
  await expect(page.getByText(/À confirmer :/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Affecter/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('candidates-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('candidates-mobile.png'), fullPage: true });
  await page.evaluate(() => window.renderAssessment(2));
  await expect(page.getByText('Technicien Casablanca · Écart détecté')).toHaveCount(0);
  await page.unroute('**/orienteur-agent/jobs/*/candidates');
  await page.route('**/orienteur-agent/jobs/*/candidates', (route) => route.fulfill({ status: 403, json: {} }));
  await page.getByRole('button', { name: 'Examiner les candidats' }).click();
  await expect(page.getByRole('alert')).toHaveText('Vous ne pouvez pas examiner les candidats de cette intervention.');
});

test('a late comparison response cannot leak into another dossier', async ({ page }) => {
  let pending;
  await page.route('**/orienteur-agent/jobs/1/candidates', (route) => { pending = route; });
  await page.goto('/e2e/orienteur-harness.html');
  await page.getByRole('button', { name: 'Examiner les candidats' }).click();
  await expect.poll(() => Boolean(pending)).toBe(true);
  await page.evaluate(() => window.renderAssessment(2));
  await page.route('**/orienteur-agent/jobs/2/candidates', (route) => route.fulfill({ json: { ...result, assessment_status: 'NOT_APPLICABLE', candidates: [], total_candidates: 0, truncated: false } }));
  await page.getByRole('button', { name: 'Examiner les candidats' }).click();
  await expect(page.getByText('L’état actuel du dossier ne permet pas de préparer une nouvelle affectation.')).toBeVisible();
  await pending.fulfill({ json: result });
  await expect(page.getByText('Technicien Casablanca · Écart détecté')).toHaveCount(0);
});
