import {
  test,
  expect,
} from '@playwright/test';

const USERNAME =
  process.env.BLUEVECTOR_E2E_USERNAME ||
  'admin';

const PASSWORD =
  process.env.BLUEVECTOR_E2E_PASSWORD ||
  'mdp123';

const ADMIN_PAGES = [
  {
    id: 'dashboard',
    heading: 'Pilotage du jour',
  },
  {
    id: 'supervision',
    heading: 'Supervision des exceptions',
  },
  {
    id: 'carte',
    heading: 'Carte live',
  },
  {
    id: 'interventions',
    heading: 'Interventions',
  },
  {
    id: 'personnel',
    heading: 'Personnel',
  },
  {
    id: 'secteurs',
    heading: 'Secteurs',
  },
  {
    id: 'stocks',
    heading: 'Stocks',
  },
  {
    id: 'rapports',
    heading: 'Rapports',
  },
  {
    id: 'parametres',
    heading: 'Paramètres',
  },
];


async function login(
  page,
  username = USERNAME,
  password = PASSWORD,
) {
  await page.goto('/');

  await page
    .getByLabel('Nom d’utilisateur')
    .fill(username);

  await page
    .getByLabel('Mot de passe')
    .fill(password);

  await page
    .getByRole('button', {
      name: 'Se connecter',
    })
    .click();

  await expect(
    page.locator(
      '#bluevector-main-content',
    ),
  ).toBeVisible();
}


async function waitForPageReady(
  page,
  heading,
) {
  await expect(
    page.getByRole('heading', {
      name: heading,
      exact: typeof heading === 'string',
    }).first(),
  ).toBeVisible({
    timeout: 20_000,
  });

  await expect(
    page.getByText(
      'Impossible d’afficher cette page',
    ),
  ).toHaveCount(0);
}


function watchRuntime(page) {
  const pageErrors = [];
  const serverErrors = [];

  page.on(
    'pageerror',
    (error) => {
      pageErrors.push(
        error.message,
      );
    },
  );

  page.on(
    'response',
    (response) => {
      if (
        response.status() >= 500
      ) {
        serverErrors.push(
          `${response.status()} ${response.url()}`,
        );
      }
    },
  );

  return () => {
    expect.soft(
      pageErrors,
      'Aucune exception JavaScript non gérée',
    ).toEqual([]);

    expect.soft(
      serverErrors,
      'Aucune réponse HTTP 5xx',
    ).toEqual([]);
  };
}


test(
  'BV-E2E-001 - mauvais login refusé proprement',
  async ({ page }) => {
    await page.goto('/');

    await page
      .getByLabel(
        'Nom d’utilisateur',
      )
      .fill('admin');

    await page
      .getByLabel('Mot de passe')
      .fill(
        'mot-de-passe-invalide',
      );

    await page
      .getByRole('button', {
        name: 'Se connecter',
      })
      .click();

    await expect(
      page.getByRole('alert'),
    ).toContainText(
      'Nom d’utilisateur ou mot de passe incorrect',
    );

    await expect(
      page.locator(
        '#bluevector-main-content',
      ),
    ).toHaveCount(0);
  },
);


test(
  'BV-E2E-002 - admin ouvre tous les espaces principaux',
  async ({ page }) => {
    test.setTimeout(180_000);

    const verifyRuntime =
      watchRuntime(page);

    await login(page);

    await expect(
      page.locator(
        '#bluevector-sidebar',
      ),
    ).toBeVisible();

    for (
      const pageEntry of ADMIN_PAGES
    ) {
      await test.step(
        `Navigation ${pageEntry.id}`,
        async () => {
          const button =
            page.locator(
              `button[data-page-id="${pageEntry.id}"]`,
            );

          await expect(
            button,
          ).toBeVisible();

          await button.click();

          await expect(
            button,
          ).toHaveAttribute(
            'aria-current',
            'page',
          );

          await waitForPageReady(
            page,
            pageEntry.heading,
          );
        },
      );
    }

    verifyRuntime();
  },
);


test(
  'BV-E2E-003 - les espaces administrateur restent navigables et contenus sur téléphone',
  async ({ page }) => {
    test.setTimeout(180_000);

    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    const verifyRuntime =
      watchRuntime(page);

    await login(page);

    for (const pageEntry of ADMIN_PAGES) {
      await test.step(
        `Téléphone ${pageEntry.id}`,
        async () => {
          const openMenu =
            page.getByRole('button', {
              name: 'Ouvrir la navigation',
            });

          await openMenu.click();

          const sidebar =
            page.locator(
              '#bluevector-sidebar',
            );

          await expect(sidebar).toBeVisible();

          await sidebar
            .locator(
              `button[data-page-id="${pageEntry.id}"]`,
            )
            .click();

          await expect(
            sidebar,
          ).not.toBeVisible();

          await waitForPageReady(
            page,
            pageEntry.heading,
          );

          const viewportMetrics =
            await page.evaluate(() => {
              const main =
                document.querySelector(
                  '#bluevector-main-content',
                );
              const mainRect =
                main?.getBoundingClientRect();

              return {
                bodyWidth:
                  document.body.scrollWidth,
                documentWidth:
                  document.documentElement
                    .scrollWidth,
                mainLeft:
                  mainRect?.left ?? -1,
                mainRight:
                  mainRect?.right ?? -1,
                viewportWidth:
                  document.documentElement
                    .clientWidth,
              };
            });

          expect(
            viewportMetrics.documentWidth,
          ).toBe(
            viewportMetrics.viewportWidth,
          );
          expect(
            viewportMetrics.bodyWidth,
          ).toBeLessThanOrEqual(
            viewportMetrics.viewportWidth,
          );
          expect(
            viewportMetrics.mainLeft,
          ).toBeGreaterThanOrEqual(-1);
          expect(
            viewportMetrics.mainRight,
          ).toBeLessThanOrEqual(
            viewportMetrics.viewportWidth + 1,
          );
        },
      );
    }

    verifyRuntime();
  },
);


test(
  'BV-QA-010 - navigation et workspace Interventions restent utilisables sur téléphone',
  async ({ page }) => {
    test.setTimeout(45_000);

    await page.setViewportSize({
      width: 390,
      height: 844,
    });

    await login(page);

    const openMenu =
      page.getByRole(
        'button',
        {
          name:
            'Ouvrir la navigation',
        },
      );

    await expect(
      openMenu,
    ).toBeVisible();

    await openMenu.click();

    await expect(
      openMenu,
    ).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    await expect(
      page.locator(
        '#bluevector-sidebar',
      ),
    ).toBeVisible();

    await page
      .locator(
        'button[data-page-id="interventions"]',
      )
      .click();

    await expect(
      page.locator(
        '#bluevector-sidebar',
      ),
    ).not.toBeVisible();

    await expect(
      page.getByRole('heading', {
        name: 'Interventions',
        exact: true,
      }),
    ).toBeVisible({
      timeout: 15_000,
    });

    for (const width of [360, 390, 430]) {
      await test.step(
        `Workspace téléphone ${width}px`,
        async () => {
          await page.setViewportSize({
            width,
            height: 844,
          });

          const mobileLayout =
            await page.evaluate(() => {
              const viewportWidth =
                document.documentElement.clientWidth;

              const selectors = [
                '.intervention-workspace-date',
                '.intervention-kpi-card--v4',
                '.intervention-toolbar-actions > *',
                '.intervention-planning-panel',
              ];

              const clipped =
                selectors.flatMap(
                  (selector) =>
                    Array.from(
                      document.querySelectorAll(
                        selector,
                      ),
                    )
                      .filter((element) => {
                        const rect =
                          element
                            .getBoundingClientRect();

                        return (
                          rect.width > 0 &&
                          (
                            rect.left < -1 ||
                            rect.right >
                              viewportWidth + 1
                          )
                        );
                      })
                      .map((element) => ({
                        selector,
                        className:
                          element.className,
                      })),
                );

              const planningPanel =
                document.querySelector(
                  '.intervention-planning-panel',
                );

              return {
                clipped,
                documentWidth:
                  document.documentElement
                    .scrollWidth,
                planningWidth:
                  planningPanel
                    ?.getBoundingClientRect()
                    .width ?? 0,
                viewportWidth,
              };
            });

          expect(
            mobileLayout.clipped,
          ).toEqual([]);
          expect(
            mobileLayout.documentWidth,
          ).toBe(
            mobileLayout.viewportWidth,
          );
          expect(
            mobileLayout.planningWidth,
          ).toBeGreaterThanOrEqual(
            mobileLayout.viewportWidth - 32,
          );
        },
      );
    }
  },
);
