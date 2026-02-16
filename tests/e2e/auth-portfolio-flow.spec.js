import { expect, test } from '@playwright/test';

const sampleCandles = (base = 180) => {
  const c = Array.from({ length: 90 }, (_, i) => base + i * 0.1);
  return {
    c,
    h: c.map((x) => x + 1),
    l: c.map((x) => x - 1),
    v: c.map((_, i) => 1000 + i)
  };
};

test('login and add position in portfolio', async ({ page }) => {
  let loggedIn = true;
  const positions = [];

  await page.addInitScript(() => {
    localStorage.setItem('nexusfin_watchlist', JSON.stringify(['AAPL']));
    localStorage.setItem(
      'nexusfin_config',
      JSON.stringify({
        riskProfile: 'moderado',
        horizon: 'mediano',
        sectors: ['tech'],
        maxPE: 50,
        minDivYield: 0,
        minMktCap: 100,
        rsiOS: 30,
        rsiOB: 70,
        volThresh: 2,
        minConfluence: 2
      })
    );
  });

  await page.route(/^https?:\/\/(localhost|127\.0\.0\.1):3001\/api\/.*$/, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method().toUpperCase();
    const isPath = (target) => path === target || path === `${target}/`;

    const corsHeaders = {
      'access-control-allow-origin': 'http://127.0.0.1:4173',
      'access-control-allow-credentials': 'true',
      'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'access-control-allow-headers': 'Content-Type,Authorization,X-CSRF-Token'
    };

    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }

    const json = (status, body, extraHeaders = {}) =>
      route.fulfill({
        status,
        headers: { 'content-type': 'application/json', ...corsHeaders, ...extraHeaders },
        body: JSON.stringify(body)
      });

    if (isPath('/api/auth/login') && method === 'POST') {
      loggedIn = true;
      return json(200, { token: 'e2e-token' });
    }

    if (isPath('/api/auth/me') && method === 'GET') {
      if (!loggedIn) return json(401, { error: 'TOKEN_REQUIRED', message: 'Token requerido' });
      return json(200, {
        id: 'u1',
        email: 'e2e@nexusfin.app',
        displayName: 'E2E User',
        onboardingCompleted: true
      });
    }

    if (isPath('/api/auth/csrf') && method === 'GET') {
      if (!loggedIn) return json(401, { error: 'TOKEN_REQUIRED', message: 'Token requerido' });
      return json(200, { csrfToken: 'csrf-e2e' });
    }

    if (isPath('/api/auth/logout') && method === 'POST') {
      loggedIn = false;
      return json(200, { ok: true });
    }

    if (isPath('/api/health') && method === 'GET') return json(200, { status: 'ok' });
    if (isPath('/api/config') && method === 'GET') {
      return json(200, {
        riskProfile: 'moderado',
        horizon: 'mediano',
        sectors: ['tech'],
        maxPE: 50,
        minDivYield: 0,
        minMktCap: 100,
        rsiOS: 30,
        rsiOB: 70,
        volThresh: 2,
        minConfluence: 2
      });
    }

    if (isPath('/api/watchlist') && method === 'GET') {
      return json(200, { symbols: [{ symbol: 'AAPL', name: 'Apple', category: 'equity' }] });
    }

    if (isPath('/api/portfolio') && method === 'GET') return json(200, { positions });
    if (isPath('/api/portfolio') && method === 'POST') {
      const body = req.postDataJSON();
      const created = {
        id: `p-${positions.length + 1}`,
        symbol: String(body.symbol || '').toUpperCase(),
        name: body.name,
        category: body.category,
        buyDate: body.buyDate,
        buyPrice: Number(body.buyPrice),
        quantity: Number(body.quantity),
        sellDate: null,
        sellPrice: null,
        notes: body.notes || ''
      };
      positions.unshift(created);
      return json(200, created);
    }

    if (isPath('/api/market/quote') && method === 'GET') return json(200, { c: 190.25, pc: 188.1, dp: 1.14 });
    if (isPath('/api/market/candles') && method === 'GET') return json(200, sampleCandles(180));
    if (isPath('/api/market/crypto-candles') && method === 'GET') return json(200, sampleCandles(30000));
    if (isPath('/api/market/forex-candles') && method === 'GET') return json(200, sampleCandles(1));
    if (isPath('/api/market/commodity') && method === 'GET') return json(200, { prices: Array.from({ length: 90 }, (_, i) => 80 + i * 0.1) });

    return json(200, {});
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Horsai' })).toBeVisible({ timeout: 45_000 });
  const navItems = page.locator('nav.bottom-nav a.nav-item');
  await expect(navItems).toHaveCount(5);
  await expect(page.locator('nav.bottom-nav')).toContainText('Agente IA');
  await expect(page.locator('nav.bottom-nav')).toContainText('Mercados');
  await expect(page.locator('nav.bottom-nav')).toContainText('Cartera');
  await expect(page.locator('nav.bottom-nav')).toContainText('Noticias');
  await expect(page.locator('nav.bottom-nav')).toContainText('Ajustes');
  await expect(page.locator('a.nav-item.active[href="/alerts"]')).toBeVisible();

  const migrationHeading = page.getByRole('heading', { name: 'Migrar datos locales' });
  if (await migrationHeading.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await page.getByRole('button', { name: /m[aá]s tarde/i }).click();
    await expect(migrationHeading).toBeHidden();
  }
  await page.locator('a.nav-item[href="/portfolio"]').click();
  await expect(page.getByRole('heading', { name: 'Nueva posición' })).toBeVisible();

  await page.getByLabel('Símbolo').fill('AAPL');
  await page.getByLabel('Nombre').fill('Apple Inc.');
  await page.getByLabel('Fecha compra').fill('2026-02-15');
  await page.getByLabel('Precio compra').fill('190');
  await page.getByLabel('Cantidad').fill('2');
  await page.getByRole('button', { name: 'Agregar' }).click();

  await expect(page.locator('.pos-sym', { hasText: 'AAPL' }).first()).toBeVisible();
});
