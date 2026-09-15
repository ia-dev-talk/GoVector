import { expect, test } from '@playwright/test';
import path from 'node:path';

const PASSWORD = process.env.GOVECTOR_E2E_PASSWORD || 'mdp123';
const USERS = {
  admin: process.env.GOVECTOR_E2E_ADMIN_USERNAME || 'admin',
  orienteur: process.env.GOVECTOR_E2E_ORIENTEUR_USERNAME || 'wahid',
  fieldAgent: process.env.GOVECTOR_E2E_FIELD_AGENT_USERNAME || 'chef',
  technician: process.env.GOVECTOR_E2E_TECHNICIAN_USERNAME || 'amine.benali',
};

const IMPORT_FIXTURE = path.join(
  process.cwd(),
  'e2e',
  'fixtures',
  'demo-import.csv',
);

function authorization(token) {
  return { Authorization: `Bearer ${token}` };
}

async function apiLogin(request, username) {
  const response = await request.post('/api/v1/auth/login', {
    form: { username, password: PASSWORD },
  });
  expect(
    response.status(),
    `Connexion API impossible pour ${username}: ${await response.text()}`,
  ).toBe(200);
  const payload = await response.json();
  expect(payload.access_token, `Token absent pour ${username}`).toBeTruthy();
  return payload.access_token;
}

async function loginUi(page, username) {
  await page.goto('/');
  await page.getByLabel("Nom d'utilisateur").fill(username);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(
    page.locator('#bluevector-main-content'),
    `Connexion UI impossible pour ${username}`,
  ).toBeVisible({ timeout: 15_000 });
}

async function openWorkspacePage(page, pageId) {
  const button = page.locator(`button[data-page-id="${pageId}"]`);
  await expect(button, `Page ${pageId} absente de la navigation`).toBeVisible();
  await button.click();
  await page.waitForTimeout(450);
}

function watchRuntime(page) {
  const pageErrors = [];
  const serverErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  return { pageErrors, serverErrors };
}

async function readabilityAudit(page) {
  return page.locator('#bluevector-main-content').evaluate((root) => {
    const parseColor = (value) => {
      const match = String(value || '').match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].split(',').map((item) => Number.parseFloat(item.trim()));
      if (parts.length < 3 || parts.slice(0, 3).some((item) => !Number.isFinite(item))) return null;
      return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
    };

    const luminance = ([r, g, b]) => {
      const channel = (value) => {
        const normalized = value / 255;
        return normalized <= 0.03928
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

    const contrast = (foreground, background) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };

    const backgroundFor = (element) => {
      let current = element;
      while (current && current instanceof Element) {
        const style = getComputedStyle(current);
        if (style.backgroundImage && style.backgroundImage !== 'none') return null;
        const parsed = parseColor(style.backgroundColor);
        if (parsed && parsed[3] >= 0.85) return parsed;
        current = current.parentElement;
      }
      return [255, 255, 255, 1];
    };

    const hasOwnText = (element) => Array.from(element.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0,
    );

    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number.parseFloat(style.opacity || '1') > 0.15;
    };

    const badContrast = [];
    const tinyText = [];
    const examined = [];

    root.querySelectorAll('*').forEach((element) => {
      if (!hasOwnText(element) || !visible(element)) return;
      if (element.closest('[disabled], [aria-disabled="true"], .sr-only')) return;
      if (['SCRIPT', 'STYLE', 'OPTION'].includes(element.tagName)) return;

      const text = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 100);
      if (!text) return;

      const style = getComputedStyle(element);
      const foreground = parseColor(style.color);
      const background = backgroundFor(element);
      const fontSize = Number.parseFloat(style.fontSize || '0');

      examined.push({ text, fontSize, color: style.color, background: background && `rgb(${background.slice(0, 3).join(',')})` });

      if (fontSize > 0 && fontSize < 9) {
        tinyText.push({ text, fontSize, selector: element.className || element.tagName });
      }

      if (!foreground || !background || foreground[3] < 0.8) return;
      const ratio = contrast(foreground, background);
      if (ratio < 2.4) {
        badContrast.push({
          text,
          ratio: Number(ratio.toFixed(2)),
          color: style.color,
          background: `rgb(${background.slice(0, 3).join(',')})`,
          selector: typeof element.className === 'string' ? element.className : element.tagName,
        });
      }
    });

    return {
      badContrast: badContrast.slice(0, 40),
      tinyText: tinyText.slice(0, 40),
      examinedCount: examined.length,
      mainFontFamily: getComputedStyle(root).fontFamily,
    };
  });
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('fr');
}

test.describe('GoVector - acceptation réelle de la démo', () => {
  test('DEMO-001 — matrice RBAC réelle des quatre rôles', async ({ request }) => {
    const tokens = {
      admin: await apiLogin(request, USERS.admin),
      orienteur: await apiLogin(request, USERS.orienteur),
      fieldAgent: await apiLogin(request, USERS.fieldAgent),
      technician: await apiLogin(request, USERS.technician),
    };

    const checks = [
      {
        label: 'import Excel',
        path: '/api/v1/import/excel/contract',
        expected: { admin: 200, orienteur: 200, fieldAgent: 403, technician: 403 },
      },
      {
        label: 'liste globale/scopée des interventions',
        path: '/api/v1/jobs/?limit=5',
        expected: { admin: 200, orienteur: 200, fieldAgent: 403, technician: 200 },
      },
      {
        label: 'lecture référentiel secteurs',
        path: '/api/v1/sectors/?limit=5',
        expected: { admin: 200, orienteur: 200, fieldAgent: 200, technician: 200 },
      },
    ];

    for (const check of checks) {
      for (const role of Object.keys(tokens)) {
        const response = await request.get(check.path, {
          headers: authorization(tokens[role]),
        });
        expect.soft(
          response.status(),
          `${check.label} — rôle ${role}: ${await response.text()}`,
        ).toBe(check.expected[role]);
      }
    }
  });

  test('DEMO-002 — Orienteur bureau voit et analyse réellement un import', async ({ page }) => {
    const runtime = watchRuntime(page);
    await loginUi(page, USERS.orienteur);
    await openWorkspacePage(page, 'interventions');

    const actions = page.getByRole('button', { name: /^Actions$/ });
    await expect(actions).toBeVisible();
    await actions.click();

    const importAction = page.getByRole('menuitem').filter({ hasText: 'Importer' });
    await expect(
      importAction,
      "L'Orienteur bureau doit pouvoir ouvrir l'import depuis Actions",
    ).toBeVisible();
    await importAction.click();

    await expect(page.getByRole('heading', { name: "Centre d'import GoVector" })).toBeVisible();
    await expect(page.getByText('Déposez vos fichiers Excel')).toBeVisible();

    const fileInput = page.locator('.import-window input[type="file"]').first();
    await fileInput.setInputFiles(IMPORT_FIXTURE);

    const previewResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST'
        && /\/api\/v1\/import\/excel(?:\?|$)/.test(response.url()),
      { timeout: 20_000 },
    );

    await page.getByRole('button', { name: /^Analyser$/ }).click();
    const previewResponse = await previewResponsePromise;
    expect(
      previewResponse.status(),
      `Analyse Excel refusée pour ORIENTEUR: ${await previewResponse.text()}`,
    ).toBe(200);

    await expect(page.getByText(/Accès Orienteur bureau ou Admin requis/i)).toHaveCount(0);
    await expect(page.getByText(/Erreur lors de l'analyse/i)).toHaveCount(0);
    expect.soft(runtime.pageErrors, 'Erreurs JavaScript pendant import Orienteur').toEqual([]);
    expect.soft(runtime.serverErrors, 'Erreurs HTTP 5xx pendant import Orienteur').toEqual([]);
  });

  test('DEMO-003 — Agent terrain ne doit jamais entrer dans le workspace global', async ({ page }) => {
    await loginUi(page, USERS.fieldAgent);

    await expect(
      page.locator('button[data-page-id="interventions"]'),
      'CHEF_ORIENTEUR est Agent terrain : le workspace global Interventions doit être absent',
    ).toHaveCount(0);

    await expect(page.getByRole('button', { name: /Nouvelle intervention/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Actions$/ })).toHaveCount(0);
  });

  test('DEMO-004 — lisibilité réelle: contrastes, fonds et taille de police', async ({ page }, testInfo) => {
    const runtime = watchRuntime(page);
    await loginUi(page, USERS.admin);

    const pages = [
      'dashboard',
      'interventions',
      'planning',
      'agents-terrain',
      'techniciens',
      'secteurs',
      'stocks',
      'rapports',
      'parametres',
    ];

    const audit = {};
    for (const pageId of pages) {
      const nav = page.locator(`button[data-page-id="${pageId}"]`);
      if (!(await nav.isVisible().catch(() => false))) {
        audit[pageId] = { navigationMissing: true };
        expect.soft(false, `Navigation ADMIN manquante: ${pageId}`).toBeTruthy();
        continue;
      }
      await nav.click();
      await page.waitForTimeout(500);
      const result = await readabilityAudit(page);
      audit[pageId] = result;

      expect.soft(
        result.badContrast,
        `${pageId}: texte presque invisible / couleur de fond incompatible`,
      ).toEqual([]);
      expect.soft(
        result.tinyText,
        `${pageId}: police inférieure à 9px`,
      ).toEqual([]);
      expect.soft(
        result.mainFontFamily.toLowerCase(),
        `${pageId}: famille de police globale inattendue`,
      ).toContain('segoe ui');
    }

    await testInfo.attach('readability-audit.json', {
      body: Buffer.from(JSON.stringify(audit, null, 2)),
      contentType: 'application/json',
    });

    expect.soft(runtime.pageErrors, 'Erreurs JavaScript pendant parcours visuel').toEqual([]);
    expect.soft(runtime.serverErrors, 'Erreurs HTTP 5xx pendant parcours visuel').toEqual([]);
  });

  test('DEMO-005 — secteurs créés et interventions réellement reliées', async ({ request }) => {
    const token = await apiLogin(request, USERS.admin);
    const headers = authorization(token);

    const [sectorResponse, jobsResponse, techniciansResponse, assignmentsResponse] = await Promise.all([
      request.get('/api/v1/sectors/?limit=500', { headers }),
      request.get('/api/v1/jobs/?limit=500', { headers }),
      request.get('/api/v1/technicians/?limit=500', { headers }),
      request.get('/api/v1/sectors/technician-assignments', { headers }),
    ]);

    expect(sectorResponse.status(), await sectorResponse.text()).toBe(200);
    expect(jobsResponse.status(), await jobsResponse.text()).toBe(200);
    expect(techniciansResponse.status(), await techniciansResponse.text()).toBe(200);
    expect(assignmentsResponse.status(), await assignmentsResponse.text()).toBe(200);

    const sectors = await sectorResponse.json();
    const jobs = await jobsResponse.json();
    const techniciansPayload = await techniciansResponse.json();
    const technicians = Array.isArray(techniciansPayload)
      ? techniciansPayload
      : techniciansPayload.items || [];
    const assignments = await assignmentsResponse.json();

    const activeSectors = sectors.filter((sector) => sector.is_active !== false);
    const byId = new Map(activeSectors.map((sector) => [Number(sector.id), sector]));
    const byName = new Map(activeSectors.map((sector) => [normalizeName(sector.name), sector]));

    const detachedJobs = [];
    const invalidLinks = [];

    for (const job of jobs) {
      const rawName = job.sector_raw || job.route_criteria || '';
      const matchingByName = byName.get(normalizeName(rawName));

      if (!job.sector_id && matchingByName) {
        detachedJobs.push({
          id: job.id,
          job_number: job.job_number,
          raw_sector: rawName,
          expected_sector_id: matchingByName.id,
        });
        continue;
      }

      if (job.sector_id) {
        const linked = byId.get(Number(job.sector_id));
        if (!linked) {
          invalidLinks.push({ id: job.id, job_number: job.job_number, sector_id: job.sector_id, reason: 'sector_id inexistant/inactif' });
        } else if (job.sector_name && normalizeName(job.sector_name) !== normalizeName(linked.name)) {
          invalidLinks.push({ id: job.id, job_number: job.job_number, sector_id: job.sector_id, sector_name: job.sector_name, registry_name: linked.name });
        }
      }
    }

    const techWithSectors = new Set(
      assignments
        .filter((item) => Array.isArray(item.sector_ids) && item.sector_ids.length > 0)
        .map((item) => Number(item.technician_id)),
    );
    const activeTechniciansWithoutSector = technicians
      .filter((tech) => tech.is_active !== false)
      .filter((tech) => !techWithSectors.has(Number(tech.id)))
      .map((tech) => ({ id: tech.id, name: tech.name, status: tech.status, team_id: tech.team_id }));

    expect.soft(
      detachedJobs,
      'Interventions avec un nom de secteur reconnu mais sans sector_id réel',
    ).toEqual([]);
    expect.soft(invalidLinks, 'Interventions reliées à un secteur invalide').toEqual([]);
    expect.soft(
      activeTechniciansWithoutSector,
      "Techniciens actifs visibles mais sans aucun secteur opérationnel: l'affectation risque d'échouer",
    ).toEqual([]);
  });

  test('DEMO-006 — plage Jour/Semaine/Mois/Année: backend + contrôles Web', async ({ page, request }) => {
    const token = await apiLogin(request, USERS.admin);
    const rangeResponse = await request.get(
      '/api/v1/jobs/?scheduled_from=2026-09-01&scheduled_to=2026-09-30&limit=500',
      { headers: authorization(token) },
    );
    expect(rangeResponse.status(), `Le backend ne supporte pas la plage mensuelle: ${await rangeResponse.text()}`).toBe(200);

    await loginUi(page, USERS.admin);
    await openWorkspacePage(page, 'interventions');
    const main = page.locator('#bluevector-main-content');

    await expect.soft(main.getByText(/Semaine/i), 'Sélecteur Semaine absent').toBeVisible();
    await expect.soft(main.getByText(/Mois/i), 'Sélecteur Mois absent').toBeVisible();
    await expect.soft(main.getByText(/Année/i), 'Sélecteur Année absent').toBeVisible();
  });

  test('DEMO-007 — modification complète: modal scrollable, footer atteignable, QGIS visible', async ({ page }) => {
    await loginUi(page, USERS.admin);
    await openWorkspacePage(page, 'interventions');

    const firstRow = page.locator('.ag-center-cols-container .ag-row').first();
    await expect(firstRow, 'Aucune intervention affichée pour tester la modification').toBeVisible({ timeout: 10_000 });
    await firstRow.dblclick();

    const editButton = page.getByRole('button', { name: /Modifier/i }).first();
    await expect(editButton, 'Bouton Modifier introuvable après ouverture du détail').toBeVisible({ timeout: 10_000 });
    await editButton.click();

    const dialog = page.getByRole('dialog', { name: "Modifier l’intervention" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Importer QGIS' })).toBeVisible();

    const geometry = await page.evaluate(() => {
      const modal = document.querySelector('.aje-modal');
      const body = document.querySelector('.aje-body');
      const footer = document.querySelector('.aje-footer');
      const save = Array.from(document.querySelectorAll('.aje-footer button'))
        .find((button) => button.textContent.includes('Enregistrer'));
      if (!modal || !body || !footer || !save) return null;
      const modalRect = modal.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const saveRect = save.getBoundingClientRect();
      const before = body.scrollTop;
      body.scrollTop = body.scrollHeight;
      const after = body.scrollTop;
      return {
        viewportHeight: window.innerHeight,
        modalTop: modalRect.top,
        modalBottom: modalRect.bottom,
        footerTop: footerRect.top,
        footerBottom: footerRect.bottom,
        saveTop: saveRect.top,
        saveBottom: saveRect.bottom,
        bodyClientHeight: body.clientHeight,
        bodyScrollHeight: body.scrollHeight,
        scrollBefore: before,
        scrollAfter: after,
      };
    });

    expect(geometry, 'Structure de la fenêtre de modification incomplète').not.toBeNull();
    expect.soft(geometry.modalBottom, 'La modale dépasse le viewport').toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect.soft(geometry.footerBottom, 'Le footer Enregistrer est hors écran').toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect.soft(geometry.saveBottom, 'Le bouton Enregistrer est hors écran').toBeLessThanOrEqual(geometry.viewportHeight + 1);
    expect.soft(geometry.bodyScrollHeight, 'Le corps de la modale ne possède pas sa zone scrollable').toBeGreaterThan(geometry.bodyClientHeight);
    expect.soft(geometry.scrollAfter, 'Impossible de descendre dans la modification complète').toBeGreaterThan(0);
  });

  test('DEMO-008 — pages métier ADMIN et ORIENTEUR sans crash serveur', async ({ browser }) => {
    const cases = [
      { username: USERS.admin, pages: ['dashboard', 'interventions', 'planning', 'agents-terrain', 'techniciens', 'secteurs', 'stocks', 'rapports', 'parametres'] },
      { username: USERS.orienteur, pages: ['dashboard', 'interventions', 'planning', 'agents-terrain', 'techniciens', 'stocks', 'rapports'] },
    ];

    for (const item of cases) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const runtime = watchRuntime(page);
      await loginUi(page, item.username);

      for (const pageId of item.pages) {
        const nav = page.locator(`button[data-page-id="${pageId}"]`);
        expect.soft(await nav.count(), `${item.username}: navigation ${pageId} absente`).toBe(1);
        if (await nav.count()) {
          await nav.click();
          await page.waitForTimeout(350);
        }
      }

      expect.soft(runtime.pageErrors, `${item.username}: erreurs JavaScript`).toEqual([]);
      expect.soft(runtime.serverErrors, `${item.username}: réponses HTTP 5xx`).toEqual([]);
      await context.close();
    }
  });
});
