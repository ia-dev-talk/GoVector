import { test, expect } from '@playwright/test';

const USERNAME = process.env.BLUEVECTOR_E2E_USERNAME || 'admin';
const PASSWORD = process.env.BLUEVECTOR_E2E_PASSWORD || 'mdp123';

const DELIVERY_PAGES = [
  { id: 'dashboard', heading: 'Pilotage du jour' },
  { id: 'supervision', heading: 'Supervision des exceptions' },
  { id: 'interventions', heading: 'Interventions' },
  { id: 'personnel', heading: 'Personnel' },
  { id: 'stocks', heading: 'Stocks' },
];

const DELIVERY_VIEWPORTS = [
  { label: 'phone-360x800', width: 360, height: 800 },
  { label: 'phone-390x844', width: 390, height: 844 },
  { label: 'phone-430x932', width: 430, height: 932 },
  { label: 'long-tablet-600x1024', width: 600, height: 1024 },
  { label: 'long-tablet-720x1280', width: 720, height: 1280 },
  { label: 'tablet-768x1024', width: 768, height: 1024 },
  { label: 'long-tablet-800x1280', width: 800, height: 1280 },
  { label: 'tablet-landscape-1024x600', width: 1024, height: 600 },
];

async function login(page) {
  await page.goto('/');
  await page.getByLabel('Nom d’utilisateur').fill(USERNAME);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('#bluevector-main-content')).toBeVisible();
}

function watchRuntime(page) {
  const pageErrors = [];
  const serverErrors = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  return () => {
    expect.soft(pageErrors, 'Aucune exception JavaScript non gérée').toEqual([]);
    expect.soft(serverErrors, 'Aucune réponse HTTP 5xx').toEqual([]);
  };
}

async function openPage(page, pageEntry) {
  const sidebar = page.locator('#bluevector-sidebar');

  if (!(await sidebar.isVisible())) {
    const openMenu = page.getByRole('button', {
      name: 'Ouvrir la navigation',
    });
    await expect(openMenu).toBeVisible();
    await openMenu.click();
    await expect(sidebar).toBeVisible();
  }

  const button = sidebar.locator(
    `button[data-page-id="${pageEntry.id}"]`,
  );
  await expect(button).toBeVisible();
  await button.click();

  await expect(
    page.getByRole('heading', {
      name: pageEntry.heading,
      exact: true,
    }).first(),
  ).toBeVisible({ timeout: 20_000 });

  await expect(page.getByText('Impossible d’afficher cette page')).toHaveCount(0);
}

async function expectViewportContained(page, label) {
  const metrics = await page.evaluate(() => {
    const main = document.querySelector('#bluevector-main-content');
    const rect = main?.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;

    return {
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      mainLeft: rect?.left ?? -1,
      mainRight: rect?.right ?? -1,
      viewportWidth,
    };
  });

  expect(
    metrics.documentWidth,
    `${label}: pas de débordement horizontal du document`,
  ).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(
    metrics.bodyWidth,
    `${label}: pas de débordement horizontal du body`,
  ).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.mainLeft, `${label}: contenu principal visible à gauche`).toBeGreaterThanOrEqual(-1);
  expect(metrics.mainRight, `${label}: contenu principal visible à droite`).toBeLessThanOrEqual(
    metrics.viewportWidth + 1,
  );
}

for (const viewport of DELIVERY_VIEWPORTS) {
  test(`BV-QA-RWD - surfaces de livraison contenues sur ${viewport.label}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const verifyRuntime = watchRuntime(page);

    await login(page);

    for (const pageEntry of DELIVERY_PAGES) {
      await test.step(`${viewport.label} / ${pageEntry.id}`, async () => {
        await openPage(page, pageEntry);
        await expectViewportContained(page, `${viewport.label} / ${pageEntry.id}`);
      });
    }

    verifyRuntime();
  });
}

test('BV-QA-RWD - workspace Interventions survit aux changements de taille à chaud', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const verifyRuntime = watchRuntime(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await openPage(page, { id: 'interventions', heading: 'Interventions' });

  for (const viewport of DELIVERY_VIEWPORTS) {
    await test.step(`resize ${viewport.label}`, async () => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await expect(
        page.getByRole('heading', { name: 'Interventions', exact: true }),
      ).toBeVisible();
      await expectViewportContained(page, `resize ${viewport.label}`);
    });
  }

  verifyRuntime();
});
