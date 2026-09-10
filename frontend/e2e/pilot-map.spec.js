import { expect, test } from '@playwright/test';

const neutralTile = `
  <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
    <rect width="256" height="256" fill="#dbe5ec" />
    <path d="M0 128h256M128 0v256" stroke="#a7bbc9" stroke-width="2" />
  </svg>
`;

test('pilot map renders keyless tiles, markers, zoom and responsive controls', async ({ page }, testInfo) => {
  const runtimeErrors = [];
  const unexpectedResponses = [];
  const tileUrls = [];

  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) {
      unexpectedResponses.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.route('https://*.tile.openstreetmap.org/**', async (route) => {
    tileUrls.push(route.request().url());
    await route.fulfill({ contentType: 'image/svg+xml', body: neutralTile });
  });

  await page.goto('/e2e/orienteur-harness.html');
  await page.waitForFunction(() => typeof window.renderPilotMap === 'function');
  await page.evaluate(() => window.renderPilotMap());

  await expect(page.getByRole('region', { name: /Carte contenant 1 technicien et 1 intervention/ })).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2);
  const markerGeometryIsVisible = await page.locator('.leaflet-marker-icon').evaluateAll((markers) => {
    const mapBounds = document.querySelector('.map-window-integrated').getBoundingClientRect();
    return markers.every((marker) => {
      const bounds = marker.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && bounds.left >= mapBounds.left &&
        bounds.top >= mapBounds.top && bounds.right <= mapBounds.right && bounds.bottom <= mapBounds.bottom;
    });
  });
  expect(markerGeometryIsVisible).toBe(true);
  await expect(page.locator('.leaflet-tile')).not.toHaveCount(0);
  await expect.poll(() => tileUrls.length).toBeGreaterThan(0);
  expect(tileUrls.every((url) => url.includes('.tile.openstreetmap.org/'))).toBe(true);

  await page.waitForTimeout(400);
  await page.screenshot({ path: testInfo.outputPath('pilot-map-desktop.png'), fullPage: true });
  await page.waitForFunction(() => Boolean(window.pilotMapInstance));
  const zoomBefore = await page.evaluate(() => window.pilotMapInstance.getZoom());
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => page.evaluate(() => window.pilotMapInstance.getZoom())).toBe(zoomBefore + 1);

  await page.setViewportSize({ width: 390, height: 844 });
  const recenterButton = page.getByRole('button', { name: 'Recentrer sur tous les marqueurs' });
  await expect(recenterButton).toBeVisible();
  await recenterButton.click();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pilot-map-mobile.png'), fullPage: true });

  expect(runtimeErrors).toEqual([]);
  expect(unexpectedResponses).toEqual([]);
  expect(await page.locator('body').innerText()).not.toMatch(
    /API key required|payment required|billing required|trial expired|upgrade/i,
  );
});
