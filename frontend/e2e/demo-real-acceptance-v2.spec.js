import { expect, test } from '@playwright/test';
import path from 'node:path';

const PASSWORD = process.env.GOVECTOR_E2E_PASSWORD;
if (!PASSWORD) {
  throw new Error('GOVECTOR_E2E_PASSWORD est obligatoire pour la suite demo-real-acceptance-v2.');
}

const USERS = {
  admin: process.env.GOVECTOR_E2E_ADMIN_USERNAME || 'admin.govector',
  orienteur: process.env.GOVECTOR_E2E_ORIENTEUR_USERNAME || 'orienteur.casablanca',
  fieldAgent: process.env.GOVECTOR_E2E_FIELD_AGENT_USERNAME || 'agent.casablanca',
  technicianAmine: process.env.GOVECTOR_E2E_TECHNICIAN_USERNAME || 'amine.benali',
  technicianNabil: process.env.GOVECTOR_E2E_TECHNICIAN_NABIL_USERNAME || 'nabil.lkhair',
  client: process.env.GOVECTOR_E2E_CLIENT_USERNAME || 'client.magillan',
};

const EXPECTED_ROLES = {
  admin: 'ADMIN',
  orienteur: 'ORIENTEUR',
  fieldAgent: 'CHEF_ORIENTEUR',
  technicianAmine: 'TECHNICIAN',
  technicianNabil: 'TECHNICIAN',
  client: 'CLIENT',
};

const IMPORT_FIXTURE = path.join(process.cwd(), 'e2e', 'fixtures', 'demo-import.csv');

function authorization(token) {
  return { Authorization: `Bearer ${token}` };
}

async function rawLogin(request, username) {
  return request.post('/api/v1/auth/login', {
    form: { username, password: PASSWORD },
  });
}

async function apiSession(request, username) {
  const response = await rawLogin(request, username);
  expect(
    response.status(),
    `Connexion API impossible pour ${username}: ${await response.text()}`,
  ).toBe(200);
  const payload = await response.json();
  expect(payload.access_token, `Token absent pour ${username}`).toBeTruthy();
  expect(payload.user, `Utilisateur absent pour ${username}`).toBeTruthy();
  return {
    token: payload.access_token,
    user: payload.user,
  };
}

async function openUiSession(page, request, username) {
  const session = await apiSession(request, username);
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem('token', token);
    window.localStorage.setItem('user', JSON.stringify(user));
  }, session);
  await page.goto('/');
  await expect(
    page.locator('#bluevector-main-content'),
    `Session UI impossible pour ${username}`,
  ).toBeVisible({ timeout: 15_000 });
  return session;
}

async function openWorkspacePage(page, pageId) {
  const button = page.locator(`button[data-page-id="${pageId}"]`);
  await expect(button, `Page ${pageId} absente de la navigation`).toBeVisible();
  await button.click();
  await page.waitForTimeout(500);
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

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('fr');
}

async function readabilityAudit(page) {
  return page.locator('#bluevector-main-content').evaluate((root) => {
    const parse = (value) => {
      const match = String(value || '').match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const parts = match[1].split(',').map((item) => Number.parseFloat(item.trim()));
      if (parts.length < 3 || parts.slice(0, 3).some((item) => !Number.isFinite(item))) return null;
      return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
    };

    const luminance = ([r, g, b]) => {
      const channel = (value) => {
        const x = value / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

    const ratio = (a, b) => {
      const l1 = luminance(a);
      const l2 = luminance(b);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    };

    const backgroundFor = (element) => {
      let current = element;
      while (current && current instanceof Element) {
        const style = getComputedStyle(current);
        if (style.backgroundImage && style.backgroundImage !== 'none') return null;
        const parsed = parse(style.backgroundColor);
        if (parsed && parsed[3] >= 0.85) return parsed;
        current = current.parentElement;
      }
      return [255, 255, 255, 1];
    };

    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };

    const findings = [];
    const tinyText = [];

    root.querySelectorAll('*').forEach((element) => {
      if (!visible(element)) return;
      if (element.closest('[disabled], [aria-disabled="true"], .sr-only')) return;
      const ownText = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 120);
      if (!ownText) return;

      const style = getComputedStyle(element);
      const foreground = parse(style.color);
      const background = backgroundFor(element);
      const fontSize = Number.parseFloat(style.fontSize || '0');

      if (fontSize > 0 && fontSize < 9) {
        tinyText.push({ text: ownText, fontSize, className: element.className || element.tagName });
      }

      if (!foreground || !background || foreground[3] < 0.8) return;
      const contrastRatio = ratio(foreground, background);
      const whiteOnBright = foreground[0] > 235 && foreground[1] > 235 && foreground[2] > 235
        && background[0] > 215 && background[1] > 215 && background[2] > 215;
      if (contrastRatio < 2.0 || whiteOnBright) {
        findings.push({
          text: ownText,
          ratio: Number(contrastRatio.toFixed(2)),
          color: style.color,
          background: `rgb(${background.slice(0, 3).join(',')})`,
          className: typeof element.className === 'string' ? element.className : element.tagName,
        });
      }
    });

    return {
      unreadable: findings.slice(0, 60),
      tinyText: tinyText.slice(0, 60),
      fontFamily: getComputedStyle(root).fontFamily,
    };
  });
}

test.describe('GoVector — acceptation réelle V2', () => {
  test('V2-001 — les 6 comptes de démo authentifient avec le rôle attendu', async ({ request }) => {
    for (const [key, username] of Object.entries(USERS)) {
      const response = await rawLogin(request, username);
      expect.soft(
        response.status(),
        `Compte ${key} (${username}) invalide: ${await response.text()}`,
      ).toBe(200);
      if (response.status() !== 200) continue;
      const payload = await response.json();
      expect.soft(String(payload.user?.role || '').toUpperCase(), `Rôle inattendu pour ${username}`)
        .toBe(EXPECTED_ROLES[key]);
    }
  });

  test('V2-002 — le formulaire de connexion Web réel fonctionne pour ADMIN', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[name="username"]').fill(USERS.admin);
    await page.locator('input[name="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /Se connecter/i }).click();
    await expect(page.locator('#bluevector-main-content')).toBeVisible({ timeout: 15_000 });
  });

  test('V2-003 — Orienteur bureau ouvre et analyse réellement un import', async ({ page, request }) => {
    const runtime = watchRuntime(page);
    await openUiSession(page, request, USERS.orienteur);
    await openWorkspacePage(page, 'interventions');

    const actions = page.getByRole('button', { name: /^Actions$/ });
    await expect(actions).toBeVisible();
    await actions.click();
    const importAction = page.getByRole('menuitem').filter({ hasText: 'Importer' });
    await expect(importAction, "L'Orienteur doit voir l'action Importer").toBeVisible();
    await importAction.click();

    await expect(page.getByRole('heading', { name: "Centre d'import GoVector" })).toBeVisible();
    const fileInput = page.locator('.import-window input[type="file"]').first();
    await fileInput.setInputFiles(IMPORT_FIXTURE);

    const previewResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST'
        && /\/api\/v1\/import\/excel(?:\?|$)/.test(response.url()),
      { timeout: 20_000 },
    );
    await page.getByRole('button', { name: /^Analyser$/ }).click();
    const response = await previewResponsePromise;
    expect(response.status(), `Import preview ORIENTEUR refusé: ${await response.text()}`).toBe(200);
    await expect(page.getByText(/Accès Orienteur bureau ou Admin requis/i)).toHaveCount(0);
    expect.soft(runtime.pageErrors).toEqual([]);
    expect.soft(runtime.serverErrors).toEqual([]);
  });

  test('V2-004 — Agent terrain ne reçoit pas le workspace global bureau', async ({ page, request }) => {
    const login = await rawLogin(request, USERS.fieldAgent);
    test.skip(login.status() !== 200, `Compte ${USERS.fieldAgent} non authentifiable — couvert par V2-001`);
    const payload = await login.json();
    await page.addInitScript(({ token, user }) => {
      window.localStorage.setItem('token', token);
      window.localStorage.setItem('user', JSON.stringify(user));
    }, { token: payload.access_token, user: payload.user });
    await page.goto('/');
    await expect(page.locator('#bluevector-main-content')).toBeVisible({ timeout: 15_000 });

    const interventionsNav = page.locator('button[data-page-id="interventions"]');
    await expect(
      interventionsNav,
      'Agent terrain: le menu Interventions global ne doit pas être exposé comme un espace bureau',
    ).toHaveCount(0);
  });

  test('V2-005 — secteurs, interventions et techniciens sont réellement raccordés', async ({ request }) => {
    const { token } = await apiSession(request, USERS.admin);
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
    const techPayload = await techniciansResponse.json();
    const technicians = Array.isArray(techPayload) ? techPayload : techPayload.items || [];
    const assignments = await assignmentsResponse.json();

    const activeSectors = sectors.filter((item) => item.is_active !== false);
    const byId = new Map(activeSectors.map((item) => [Number(item.id), item]));
    const byName = new Map(activeSectors.map((item) => [normalizeName(item.name), item]));
    const detachedJobs = [];
    const invalidJobs = [];

    for (const job of jobs) {
      const raw = job.sector_raw || job.route_criteria || '';
      const matching = byName.get(normalizeName(raw));
      if (!job.sector_id && matching) {
        detachedJobs.push({ id: job.id, job_number: job.job_number, raw_sector: raw, expected_sector_id: matching.id });
      }
      if (job.sector_id && !byId.has(Number(job.sector_id))) {
        invalidJobs.push({ id: job.id, job_number: job.job_number, sector_id: job.sector_id });
      }
    }

    const techWithSectors = new Set(
      assignments
        .filter((item) => Array.isArray(item.sector_ids) && item.sector_ids.length > 0)
        .map((item) => Number(item.technician_id)),
    );
    const activeWithoutSector = technicians
      .filter((item) => item.is_active !== false)
      .filter((item) => !techWithSectors.has(Number(item.id)))
      .map((item) => ({ id: item.id, name: item.name, status: item.status, team_id: item.team_id }));

    expect.soft(detachedJobs, 'Interventions avec secteur texte connu mais sector_id absent').toEqual([]);
    expect.soft(invalidJobs, 'Interventions reliées à un secteur inexistant/inactif').toEqual([]);
    expect.soft(activeWithoutSector, 'Techniciens actifs sans secteur opérationnel').toEqual([]);
  });

  test('V2-006 — périodes backend + contrôles Semaine/Mois/Année visibles', async ({ page, request }) => {
    const { token } = await apiSession(request, USERS.admin);
    const rangeResponse = await request.get(
      '/api/v1/jobs/?scheduled_from=2026-09-01&scheduled_to=2026-09-30&limit=500',
      { headers: authorization(token) },
    );
    expect(rangeResponse.status(), await rangeResponse.text()).toBe(200);

    await openUiSession(page, request, USERS.admin);
    await openWorkspacePage(page, 'planning');
    await expect(page.getByText(/Semaine du/i)).toBeVisible();

    const monthControl = page.getByRole('button', { name: /Mois/i });
    const yearControl = page.getByRole('button', { name: /Année/i });
    expect.soft(await monthControl.count(), 'Contrôle Mois absent').toBeGreaterThan(0);
    expect.soft(await yearControl.count(), 'Contrôle Année absent').toBeGreaterThan(0);
  });

  test('V2-007 — modification complète: scroll, footer et QGIS réellement accessibles', async ({ page, request }) => {
    await openUiSession(page, request, USERS.admin);
    await openWorkspacePage(page, 'interventions');

    const firstRow = page.locator('.ag-center-cols-container .ag-row').first();
    await expect(firstRow, 'Aucune intervention visible dans la grille pour tester la modification').toBeVisible({ timeout: 15_000 });
    await firstRow.dblclick();

    const editButton = page.getByRole('button', { name: /Modifier/i }).first();
    await expect(editButton, 'Bouton Modifier absent dans le détail').toBeVisible({ timeout: 10_000 });
    await editButton.click();

    const modal = page.locator('.aje-modal');
    const body = page.locator('.aje-body');
    const footer = page.locator('.aje-footer');
    await expect(modal).toBeVisible();
    await expect(page.getByRole('button', { name: /Importer QGIS/i })).toBeVisible();

    const metrics = await body.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(['auto', 'scroll']).toContain(metrics.overflowY);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

    await body.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(footer).toBeVisible();
    await expect(page.getByRole('button', { name: /Enregistrer toutes les modifications/i })).toBeVisible();
  });

  test('V2-008 — pages métier: pas de texte blanc sur fond clair, pas de 500', async ({ page, request }, testInfo) => {
    const runtime = watchRuntime(page);
    await openUiSession(page, request, USERS.admin);

    const pages = ['dashboard', 'interventions', 'planning', 'agents-terrain', 'techniciens', 'secteurs', 'stocks', 'rapports', 'parametres'];
    const report = {};

    for (const pageId of pages) {
      await openWorkspacePage(page, pageId);
      const result = await readabilityAudit(page);
      report[pageId] = result;
      expect.soft(result.unreadable, `${pageId}: texte illisible / blanc sur fond clair`).toEqual([]);
      expect.soft(result.tinyText, `${pageId}: texte inférieur à 9px`).toEqual([]);
    }

    await testInfo.attach('readability-v2.json', {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: 'application/json',
    });

    expect.soft(runtime.pageErrors, 'Erreurs JavaScript pendant le parcours').toEqual([]);
    expect.soft(runtime.serverErrors, 'Erreurs serveur 5xx pendant le parcours').toEqual([]);
  });
});
