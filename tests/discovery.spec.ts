import { test, expect } from '@playwright/test';

/**
 * Targeted tests for the asset-discovery probe. These verify the specific
 * trap documented in DECISIONS.md: Vite (and many static servers) reply to a
 * missing file with 200 OK + text/html (the SPA fallback). A naive HEAD-200
 * probe would treat that as success. Discovery uses a Content-Type check to
 * defeat it.
 */
test.describe('Asset discovery probe', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Vite still serves index.html for unknown constellation indices', async ({ page }) => {
    // If this test starts failing because Vite returns a real 404, then the
    // fallback trap no longer applies and the Content-Type check in
    // ConstellationManager.discoverAvailable could be relaxed. Update or
    // remove this test if so.
    const r = await page.evaluate(async () => {
      const res = await fetch('/assets/constellation_99.json');
      return {
        status: res.status,
        contentType: res.headers.get('content-type') ?? '',
      };
    });
    expect(r.status).toBe(200);
    expect(r.contentType.toLowerCase()).toContain('text/html');
  });

  test('discoverAvailable rejects the HTML fallback and finds only real pairs', async ({
    page,
  }) => {
    const found = await page.evaluate(async () => {
      const mod = await import('/src/ConstellationManager.ts');
      return mod.ConstellationManager.discoverAvailable();
    });
    expect(found).toContain(1);
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found).not.toContain(99);
  });

  test('probeAssetForTest returns true for a real JSON, false for an HTML fallback', async ({
    page,
  }) => {
    const { realJson, missing, wrongType } = await page.evaluate(async () => {
      const mod = await import('/src/ConstellationManager.ts');
      const realJson = await mod.probeAssetForTest(
        '/assets/constellation_01.json',
        'application/json',
      );
      const missing = await mod.probeAssetForTest(
        '/assets/constellation_99.json',
        'application/json',
      );
      const wrongType = await mod.probeAssetForTest('/assets/constellation_01.json', 'image/');
      return { realJson, missing, wrongType };
    });
    expect(realJson).toBe(true);
    expect(missing).toBe(false);
    expect(wrongType).toBe(false);
  });
});
