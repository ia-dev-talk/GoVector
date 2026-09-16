import { expect, test } from '@playwright/test';

const PASSWORD = process.env.GOVECTOR_E2E_PASSWORD;
if (!PASSWORD) {
  throw new Error('GOVECTOR_E2E_PASSWORD est obligatoire pour la suite demo-real-acceptance-v3.');
}

const USERS = Object.freeze({
  admin: process.env.GOVECTOR_E2E_ADMIN_USERNAME || 'admin.govector',
  orienteur: process.env.GOVECTOR_E2E_ORIENTEUR_USERNAME || 'orienteur.casablanca',
  fieldAgent: process.env.GOVECTOR_E2E_FIELD_AGENT_USERNAME || 'agent.casablanca',
  technicianAmine: process.env.GOVECTOR_E2E_TECHNICIAN_USERNAME || 'amine.benali',
  technicianNabil: process.env.GOVECTOR_E2E_TECHNICIAN_NABIL_USERNAME || 'nabil.lkhair',
  client: process.env.GOVECTOR_E2E_CLIENT_USERNAME || 'client.magillan',
});

const EXPECTED_ROLES = Object.freeze({
  admin: 'ADMIN',
  orienteur: 'ORIENTEUR',
  fieldAgent: 'CHEF_ORIENTEUR',
  technicianAmine: 'TECHNICIAN',
  technicianNabil: 'TECHNICIAN',
  client: 'CLIENT',
});

const ADMIN_PAGES = [
  'dashboard',
  'supervision',
  'carte',
  'interventions',
  'planning',
  'agents-terrain',
  'techniciens',
  'personnel',
  'secteurs',
  'stocks',
  'rapports',
  'parametres',
];

const ORIENTEUR_PAGES = [
  'dashboard',
  'carte',
  'interventions',
  'planning',
  'agents-terrain',
  'techniciens',
  'stocks',
  'rapports',
];

const OFFICE_ONLY_FORBIDDEN_TO_ORIENTEUR = [
  'supervision',
  'personnel',
  'secteurs',
  'parametres',
];

function authorization(token) {
  return { Authorization: `Bearer ${token}` };
}

async function webLogin(request, username, password = PASSWORD) {
  return request.post('/api/v1/auth/login', {
    form: { username, password },
  });
}

async function fieldLogin(request, username, password = PASSWORD) {
  return request.post('/api/v1/tech/login', {
    data: { username, password },
  });
}

async function rawLogin(request, username, password = PASSWORD) {
  const fieldUsers = new Set([
    USERS.fieldAgent,
    USERS.technicianAmine,
    USERS.technicianNabil,
  ]);
  return fieldUsers.has(username)
    ? fieldLogin(request, username, password)
    : webLogin(request, username, password);
}

function normalizeAuthenticatedUser(payload, username) {
  return payload.user || {
    id: payload.user_id,
    username,
    role: payload.role,
    technician_id: payload.technician_id ?? null,
    orienteur_id: payload.orienteur_id ?? null,
  };
}

async function apiSession(request, username) {
  const response = await rawLogin(request, username);
  expect(response.status(), `Connexion impossible pour ${username}: ${await response.text()}`).toBe(200);
  const payload = await response.json();
  expect(payload.access_token, `Token absent pour ${username}`).toBeTruthy();
  return {
    token: payload.access_token,
    user: normalizeAuthenticatedUser(payload, username),
  };
}

async function openUiSession(page, request, username) {
  const session = await apiSession(request, username);
  await page.addInitScript(({ token, user }) => {
    window.localStorage.setItem('token', token);
    window.localStorage.setItem('user', JSON.stringify(user));
  }, session);
  await page.goto('/');
  await expect(page.locator('#bluevector-main-content')).toBeVisible({ timeout: 15_000 });
  return session;
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
  const failedRequests = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.request().method()} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    const url = request.url();
    if (!/tile\.openstreetmap|fonts\.googleapis|fonts\.gstatic/i.test(url)) {
      failedRequests.push(`${request.method()} ${url} :: ${request.failure()?.errorText || 'failed'}`);
    }
  });
  return { pageErrors, serverErrors, failedRequests };
}

function normalizeCollection(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.jobs)) return payload.jobs;
  return [];
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleUpperCase('fr');
}

async function fetchJobs(request, token, params = 'limit=500') {
  const response = await request.get(`/api/v1/jobs/?${params}`, {
    headers: authorization(token),
  });
  return { response, jobs: response.ok() ? normalizeCollection(await response.json()) : [] };
}

async function auditReadability(page) {
  return page.locator('#bluevector-main-content').evaluate((root) => {
    const parseRgb = (value) => {
      const match = String(value || '').match(/rgba?\(([^)]+)\)/i);
      if (!match) return null;
      const values = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
      if (values.length < 3 || values.slice(0, 3).some((value) => !Number.isFinite(value))) return null;
      return [values[0], values[1], values[2], Number.isFinite(values[3]) ? values[3] : 1];
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
        const parsed = parseRgb(style.backgroundColor);
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
    const lowContrast = [];
    const tinyText = [];
    root.querySelectorAll('*').forEach((element) => {
      if (!visible(element) || element.closest('[disabled], [aria-disabled="true"], .sr-only')) return;
      const ownText = Array.from(element.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent.trim())
        .filter(Boolean)
        .join(' ')
        .slice(0, 100);
      if (!ownText) return;
      const style = getComputedStyle(element);
      const fontSize = Number.parseFloat(style.fontSize || '0');
      if (fontSize > 0 && fontSize < 9) {
        tinyText.push({ text: ownText, fontSize, className: String(element.className || element.tagName) });
      }
      const foreground = parseRgb(style.color);
      const background = backgroundFor(element);
      if (!foreground || !background || foreground[3] < 0.8) return;
      const contrast = ratio(foreground, background);
      if (contrast < 2.0) {
        lowContrast.push({
          text: ownText,
          ratio: Number(contrast.toFixed(2)),
          color: style.color,
          background: `rgb(${background.slice(0, 3).join(',')})`,
          className: String(element.className || element.tagName),
        });
      }
    });
    return {
      lowContrast: lowContrast.slice(0, 80),
      tinyText: tinyText.slice(0, 80),
    };
  });
}

test.describe('GoVector — grande acceptation réelle V3', () => {
  test('V3-001 — santé serveur et version répondent sans erreur', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.status(), await response.text()).toBe(200);
    const payload = await response.json();
    expect(payload.status).toBe('healthy');
    expect(String(payload.version || '')).not.toBe('');
  });

  test('V3-002 — les 6 comptes authentifient avec exactement les rôles attendus', async ({ request }) => {
    for (const [key, username] of Object.entries(USERS)) {
      const response = await rawLogin(request, username);
      expect.soft(response.status(), `${key} ${username}: ${await response.text()}`).toBe(200);
      if (!response.ok()) continue;
      const payload = await response.json();
      const user = normalizeAuthenticatedUser(payload, username);
      expect.soft(String(user.role || '').toUpperCase(), `Rôle ${username}`).toBe(EXPECTED_ROLES[key]);
      expect.soft(payload.access_token, `Token ${username}`).toBeTruthy();
    }
  });

  test('V3-003 — un mauvais mot de passe est refusé sur Web et mobile', async ({ request }) => {
    const web = await webLogin(request, USERS.admin, `${PASSWORD}-incorrect`);
    const mobile = await fieldLogin(request, USERS.technicianAmine, `${PASSWORD}-incorrect`);
    expect.soft([400, 401, 403]).toContain(web.status());
    expect.soft([400, 401, 403]).toContain(mobile.status());
  });

  test('V3-004 — accès jobs selon rôle: bureau et techniciens oui, Agent terrain/client non', async ({ request }) => {
    const expected = [
      [USERS.admin, 200],
      [USERS.orienteur, 200],
      [USERS.fieldAgent, 403],
      [USERS.technicianAmine, 200],
      [USERS.technicianNabil, 200],
      [USERS.client, 403],
    ];
    for (const [username, expectedStatus] of expected) {
      const { token } = await apiSession(request, username);
      const response = await request.get('/api/v1/jobs/?limit=1', { headers: authorization(token) });
      expect.soft(response.status(), `GET /jobs pour ${username}: ${await response.text()}`).toBe(expectedStatus);
    }
  });

  test('V3-005 — navigation ADMIN expose tout le bureau et jamais le portail client', async ({ page, request }) => {
    await openUiSession(page, request, USERS.admin);
    for (const pageId of ADMIN_PAGES) {
      await expect.soft(page.locator(`button[data-page-id="${pageId}"]`), `ADMIN manque ${pageId}`).toBeVisible();
    }
    await expect(page.locator('button[data-page-id="client"]')).toHaveCount(0);
  });

  test('V3-006 — navigation ORIENTEUR expose l’opérationnel mais pas l’administration', async ({ page, request }) => {
    await openUiSession(page, request, USERS.orienteur);
    for (const pageId of ORIENTEUR_PAGES) {
      await expect.soft(page.locator(`button[data-page-id="${pageId}"]`), `ORIENTEUR manque ${pageId}`).toBeVisible();
    }
    for (const pageId of OFFICE_ONLY_FORBIDDEN_TO_ORIENTEUR) {
      await expect.soft(page.locator(`button[data-page-id="${pageId}"]`), `ORIENTEUR ne doit pas voir ${pageId}`).toHaveCount(0);
    }
  });

  test('V3-007 — CLIENT reste isolé du bureau et voit seulement sa surface', async ({ page, request }) => {
    await openUiSession(page, request, USERS.client);
    await expect(page.locator('button[data-page-id="client"]')).toBeVisible();
    for (const pageId of ADMIN_PAGES) {
      await expect.soft(page.locator(`button[data-page-id="${pageId}"]`), `CLIENT ne doit pas voir ${pageId}`).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: /Supprimer|Affecter|Importer|Créer une intervention/i })).toHaveCount(0);
  });

  test('V3-008 — Agent terrain n’hérite d’aucun workspace Web bureau', async ({ page, request }) => {
    await openUiSession(page, request, USERS.fieldAgent);
    for (const pageId of [...ADMIN_PAGES, 'client']) {
      await expect.soft(page.locator(`button[data-page-id="${pageId}"]`), `Agent terrain ne doit pas voir ${pageId}`).toHaveCount(0);
    }
  });

  test('V3-009 — Agent terrain accède à son équipe API et jamais aux jobs globaux', async ({ request }) => {
    const { token } = await apiSession(request, USERS.fieldAgent);
    const headers = authorization(token);
    const globalJobs = await request.get('/api/v1/jobs/?limit=5', { headers });
    expect(globalJobs.status(), await globalJobs.text()).toBe(403);

    const teamResponse = await request.get('/api/v1/orienteur-agent/me/jobs', { headers });
    expect(teamResponse.status(), await teamResponse.text()).toBe(200);
    const teamPayload = await teamResponse.json();
    expect(Array.isArray(teamPayload.jobs)).toBeTruthy();
    expect(teamPayload.count).toBe(teamPayload.jobs.length);
    expect.soft(teamPayload.count, 'Le compte Agent terrain de démo devrait avoir au moins un dossier équipe').toBeGreaterThan(0);

    const first = teamPayload.jobs[0]?.job;
    if (first?.id) {
      const [detail, fieldRecord, stockContext] = await Promise.all([
        request.get(`/api/v1/orienteur-agent/me/jobs/${first.id}`, { headers }),
        request.get(`/api/v1/orienteur-agent/me/jobs/${first.id}/field-record`, { headers }),
        request.get(`/api/v1/orienteur-agent/me/jobs/${first.id}/stock-context`, { headers }),
      ]);
      expect.soft(detail.status(), await detail.text()).toBe(200);
      expect.soft(fieldRecord.status(), await fieldRecord.text()).toBe(200);
      expect.soft(stockContext.status(), await stockContext.text()).toBe(200);
    }
  });

  test('V3-010 — les deux techniciens ont un profil mobile réel et des KPI lisibles', async ({ request }) => {
    for (const username of [USERS.technicianAmine, USERS.technicianNabil]) {
      const { token, user } = await apiSession(request, username);
      expect.soft(user.technician_id, `${username}: technician_id absent`).toBeTruthy();
      const kpis = await request.get('/api/v1/tech/jobs/kpis', { headers: authorization(token) });
      expect.soft(kpis.status(), `${username}: ${await kpis.text()}`).toBe(200);
      if (kpis.ok()) {
        const payload = await kpis.json();
        expect.soft(Number(payload.technician_id)).toBe(Number(user.technician_id));
        expect.soft(Number(payload.jobs_total)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('V3-011 — secteurs, interventions et techniciens de démo ne sont pas vides', async ({ request }) => {
    const { token } = await apiSession(request, USERS.admin);
    const headers = authorization(token);
    const [sectorsResponse, jobsResponse, techniciansResponse] = await Promise.all([
      request.get('/api/v1/sectors/?limit=500', { headers }),
      request.get('/api/v1/jobs/?limit=500', { headers }),
      request.get('/api/v1/technicians/?limit=500', { headers }),
    ]);
    expect(sectorsResponse.status(), await sectorsResponse.text()).toBe(200);
    expect(jobsResponse.status(), await jobsResponse.text()).toBe(200);
    expect(techniciansResponse.status(), await techniciansResponse.text()).toBe(200);
    const sectors = normalizeCollection(await sectorsResponse.json());
    const jobs = normalizeCollection(await jobsResponse.json());
    const technicians = normalizeCollection(await techniciansResponse.json());
    expect.soft(sectors.length, 'Aucun secteur de démo').toBeGreaterThan(0);
    expect.soft(jobs.length, 'Aucune intervention de démo').toBeGreaterThan(0);
    expect.soft(technicians.length, 'Aucun technicien de démo').toBeGreaterThanOrEqual(2);
  });

  test('V3-012 — aucune intervention ne référence un secteur opérationnel inexistant', async ({ request }) => {
    const { token } = await apiSession(request, USERS.admin);
    const headers = authorization(token);
    const [sectorResponse, jobsResponse] = await Promise.all([
      request.get('/api/v1/sectors/?limit=500', { headers }),
      request.get('/api/v1/jobs/?limit=500', { headers }),
    ]);
    const sectors = normalizeCollection(await sectorResponse.json()).filter((item) => item.is_active !== false);
    const jobs = normalizeCollection(await jobsResponse.json());
    const byId = new Set(sectors.map((item) => Number(item.id)));
    const byName = new Map(sectors.map((item) => [normalizeName(item.name), item]));
    const invalid = [];
    const detached = [];
    for (const job of jobs) {
      if (job.sector_id && !byId.has(Number(job.sector_id))) {
        invalid.push({ id: job.id, sector_id: job.sector_id });
      }
      const raw = job.sector_raw || job.route_criteria || '';
      if (!job.sector_id && byName.has(normalizeName(raw))) {
        detached.push({ id: job.id, raw });
      }
    }
    expect.soft(invalid, 'sector_id invalide').toEqual([]);
    expect.soft(detached, 'secteur texte reconnu mais sector_id absent').toEqual([]);
  });

  test('V3-013 — tous les techniciens actifs disposent d’un secteur opérationnel', async ({ request }) => {
    const { token } = await apiSession(request, USERS.admin);
    const headers = authorization(token);
    const [techResponse, assignmentsResponse] = await Promise.all([
      request.get('/api/v1/technicians/?limit=500', { headers }),
      request.get('/api/v1/sectors/technician-assignments', { headers }),
    ]);
    expect(techResponse.status(), await techResponse.text()).toBe(200);
    expect(assignmentsResponse.status(), await assignmentsResponse.text()).toBe(200);
    const technicians = normalizeCollection(await techResponse.json());
    const assignments = normalizeCollection(await assignmentsResponse.json());
    const covered = new Set(
      assignments
        .filter((item) => Array.isArray(item.sector_ids) && item.sector_ids.length > 0)
        .map((item) => Number(item.technician_id)),
    );
    const missing = technicians
      .filter((item) => item.is_active !== false)
      .filter((item) => !covered.has(Number(item.id)))
      .map((item) => ({ id: item.id, name: item.name, team_id: item.team_id }));
    expect.soft(missing, 'Techniciens actifs sans secteur').toEqual([]);
  });

  test('V3-014 — Planning Semaine/Mois/Année est réellement interactif sans 500', async ({ page, request }) => {
    const runtime = watchRuntime(page);
    await openUiSession(page, request, USERS.admin);
    await openWorkspacePage(page, 'planning');
    for (const label of [/Semaine/i, /Mois/i, /Année/i]) {
      const control = page.getByRole('button', { name: label }).first();
      await expect(control).toBeVisible();
      await control.click();
      await page.waitForTimeout(350);
    }
    expect.soft(runtime.pageErrors).toEqual([]);
    expect.soft(runtime.serverErrors).toEqual([]);
  });

  test('V3-015 — API planning accepte une plage mensuelle réelle', async ({ request }) => {
    const { token } = await apiSession(request, USERS.admin);
    const response = await request.get(
      '/api/v1/jobs/?scheduled_from=2026-09-01&scheduled_to=2026-09-30&limit=500',
      { headers: authorization(token) },
    );
    expect(response.status(), await response.text()).toBe(200);
    expect(Array.isArray(normalizeCollection(await response.json()))).toBeTruthy();
  });

  test('V3-016 — double-clic intervention ouvre le détail complet puis Modifier', async ({ page, request }) => {
    await openUiSession(page, request, USERS.admin);
    await openWorkspacePage(page, 'interventions');
    const firstRow = page.locator('.ag-center-cols-container .ag-row').first();
    await expect(firstRow, 'Aucune ligne intervention dans la grille').toBeVisible({ timeout: 15_000 });
    await firstRow.dblclick();
    await expect(page.getByRole('button', { name: /Modifier/i }).first()).toBeVisible({ timeout: 10_000 });
  });

  test('V3-017 — éditeur complet expose QGIS, scroll et action de sauvegarde', async ({ page, request }) => {
    await openUiSession(page, request, USERS.admin);
    await openWorkspacePage(page, 'interventions');
    const firstRow = page.locator('.ag-center-cols-container .ag-row').first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    await firstRow.dblclick();
    await page.getByRole('button', { name: /Modifier/i }).first().click();
    const modal = page.locator('.aje-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByRole('button', { name: /Importer QGIS/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Enregistrer toutes les modifications/i })).toBeVisible();
    const body = page.locator('.aje-body');
    const metrics = await body.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overflowY: getComputedStyle(element).overflowY,
    }));
    expect(['auto', 'scroll']).toContain(metrics.overflowY);
    expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);
  });

  test('V3-018 — ADMIN peut lire le dossier terrain d’une intervention', async ({ request }) => {
    const { token } = await apiSession(request, USERS.admin);
    const { jobs, response } = await fetchJobs(request, token, 'limit=20');
    expect(response.status(), await response.text()).toBe(200);
    expect(jobs.length).toBeGreaterThan(0);
    const fieldRecord = await request.get(`/api/v1/job-actions/${jobs[0].id}/field-record`, {
      headers: authorization(token),
    });
    expect(fieldRecord.status(), await fieldRecord.text()).toBe(200);
    const payload = await fieldRecord.json();
    for (const key of ['field_actions', 'technician_media', 'visits']) {
      expect.soft(Array.isArray(payload[key]), `field-record.${key} doit être un tableau`).toBeTruthy();
    }
  });

  test('V3-019 — ORIENTEUR peut lire le dossier terrain de son propre périmètre', async ({ request }) => {
    const { token } = await apiSession(request, USERS.orienteur);
    const { jobs, response } = await fetchJobs(request, token, 'limit=20');
    expect(response.status(), await response.text()).toBe(200);
    expect(jobs.length).toBeGreaterThan(0);
    const fieldRecord = await request.get(`/api/v1/jobs/${jobs[0].id}/field-record`, {
      headers: authorization(token),
    });
    expect(fieldRecord.status(), await fieldRecord.text()).toBe(200);
  });

  test('V3-020 — ADMIN parcourt toutes les pages métier sans exception JS ni 5xx', async ({ page, request }, testInfo) => {
    const runtime = watchRuntime(page);
    await openUiSession(page, request, USERS.admin);
    const visited = [];
    for (const pageId of ADMIN_PAGES) {
      await openWorkspacePage(page, pageId);
      visited.push(pageId);
    }
    await testInfo.attach('runtime-v3.json', {
      body: Buffer.from(JSON.stringify({ visited, ...runtime }, null, 2)),
      contentType: 'application/json',
    });
    expect.soft(runtime.pageErrors, 'Exceptions JS pendant le parcours ADMIN').toEqual([]);
    expect.soft(runtime.serverErrors, 'Réponses 5xx pendant le parcours ADMIN').toEqual([]);
  });

  test('V3-021 — ORIENTEUR parcourt toutes ses pages métier sans exception JS ni 5xx', async ({ page, request }) => {
    const runtime = watchRuntime(page);
    await openUiSession(page, request, USERS.orienteur);
    for (const pageId of ORIENTEUR_PAGES) {
      await openWorkspacePage(page, pageId);
    }
    expect.soft(runtime.pageErrors).toEqual([]);
    expect.soft(runtime.serverErrors).toEqual([]);
  });

  test('V3-022 — audit lisibilité complet ADMIN: contraste et textes >= 9px', async ({ page, request }, testInfo) => {
    await openUiSession(page, request, USERS.admin);
    const report = {};
    for (const pageId of ADMIN_PAGES) {
      await openWorkspacePage(page, pageId);
      const result = await auditReadability(page);
      report[pageId] = result;
      expect.soft(result.lowContrast, `${pageId}: contraste très faible`).toEqual([]);
      expect.soft(result.tinyText, `${pageId}: texte < 9px`).toEqual([]);
    }
    await testInfo.attach('readability-v3.json', {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: 'application/json',
    });
  });

  test('V3-023 — identité visible reste GoVector sur les surfaces principales', async ({ page, request }) => {
    await openUiSession(page, request, USERS.admin);
    await expect(page.getByText(/GoVector/i).first()).toBeVisible();
    for (const pageId of ['dashboard', 'interventions', 'secteurs', 'rapports']) {
      await openWorkspacePage(page, pageId);
      const visibleText = await page.locator('body').innerText();
      expect.soft(visibleText, `${pageId}: ancienne marque visible`).not.toMatch(/BlueVector/i);
    }
  });

  test('V3-024 — contrôle final réseau: aucune erreur serveur 5xx pendant le parcours critique', async ({ page, request }, testInfo) => {
    const runtime = watchRuntime(page);
    await openUiSession(page, request, USERS.admin);
    for (const pageId of ['dashboard', 'interventions', 'planning', 'secteurs', 'stocks', 'rapports']) {
      await openWorkspacePage(page, pageId);
    }
    await testInfo.attach('network-v3.json', {
      body: Buffer.from(JSON.stringify(runtime, null, 2)),
      contentType: 'application/json',
    });
    expect.soft(runtime.serverErrors).toEqual([]);
    expect.soft(runtime.pageErrors).toEqual([]);
  });
});
