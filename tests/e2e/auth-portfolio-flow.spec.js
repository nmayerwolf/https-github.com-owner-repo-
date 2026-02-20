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
  const portfolios = [{ id: 'pf-1', name: 'Core', isOwner: true, collaboratorCount: 0, completedAt: null }];
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

    if (isPath('/api/portfolio') && method === 'GET') return json(200, { positions, portfolios, activePortfolioId: portfolios[0]?.id || '' });
    if (isPath('/api/portfolio/portfolios') && method === 'GET') return json(200, { portfolios });
    if (isPath('/api/portfolio/invitations/received') && method === 'GET') return json(200, { invitations: [] });
    if (isPath('/api/portfolio/portfolios') && method === 'POST') {
      const body = req.postDataJSON();
      const createdPortfolio = {
        id: `pf-${portfolios.length + 1}`,
        name: String(body?.name || `Portfolio ${portfolios.length + 1}`),
        isOwner: true,
        collaboratorCount: 0,
        completedAt: null
      };
      portfolios.push(createdPortfolio);
      return json(201, createdPortfolio);
    }
    if (isPath('/api/portfolio') && method === 'POST') {
      const body = req.postDataJSON();
      const created = {
        id: `p-${positions.length + 1}`,
        portfolioId: body.portfolioId || portfolios[0].id,
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
    if (isPath('/api/market/news/recommended') && method === 'GET') {
      return json(200, {
        mode: 'ai',
        minScore: 6,
        total: 2,
        count: 2,
        items: [
          {
            id: 1,
            headline: 'Fed signals inflation risk for markets',
            summary: 'Macro update with broad impact.',
            source: 'Reuters',
            related: 'AAPL,MSFT',
            datetime: Math.floor(Date.now() / 1000) - 120,
            aiScore: 12,
            aiReasons: ['high:inflation', 'fresh:1h'],
            url: 'https://example.com/news-1'
          },
          {
            id: 2,
            headline: 'AAPL announces product launch',
            summary: 'New launch may impact growth outlook.',
            source: 'Bloomberg',
            related: 'AAPL',
            datetime: Math.floor(Date.now() / 1000) - 60,
            aiScore: 11,
            aiReasons: ['high:launch', 'watchlist:AAPL'],
            url: 'https://example.com/news-2'
          }
        ]
      });
    }
    if (isPath('/api/market/news') && method === 'GET') {
      return json(200, [
        {
          id: 3,
          headline: 'General market update',
          summary: 'Broad market context.',
          source: 'WSJ',
          related: '',
          datetime: Math.floor(Date.now() / 1000) - 300,
          url: 'https://example.com/news-3'
        }
      ]);
    }

    return json(200, {});
  });

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Horsai' })).toBeVisible({ timeout: 45_000 });
  const navItems = page.locator('nav.bottom-nav a.nav-item');
  await expect(navItems).toHaveCount(4);
  await expect(page.locator('nav.bottom-nav')).toContainText('Ideas');
  await expect(page.locator('nav.bottom-nav')).not.toContainText('Mercados');
  await expect(page.locator('nav.bottom-nav')).toContainText('Portfolio');
  await expect(page.locator('nav.bottom-nav')).toContainText('News');
  await expect(page.locator('nav.bottom-nav')).toContainText('Your AI Agent');
  await expect(page.locator('a.nav-item.active[href="/news"]')).toBeVisible();

  await page.goto('/markets');
  await expect(page).toHaveURL(/\/news$/);
  await expect(page.getByRole('heading', { name: 'News', exact: true })).toBeVisible();

  await page.goto('/markets/AAPL');
  await expect(page).toHaveURL(/\/news$/);
  await expect(page.getByRole('heading', { name: 'News', exact: true })).toBeVisible();

  const migrationHeading = page.getByRole('heading', { name: 'Migrar datos locales' });
  if (await migrationHeading.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await page.getByRole('button', { name: /m[aá]s tarde/i }).click();
    await expect(migrationHeading).toBeHidden();
  }
  await page.locator('a.nav-item[href="/news"]').click();
  await expect(page.getByRole('heading', { name: 'News', exact: true })).toBeVisible();
  await expect(page.getByText('AAPL announces product launch')).toBeVisible();

  await page.locator('a.nav-item[href="/portfolio"]').click();
  const addPortfolioBtn = page.getByRole('button', { name: /\+ Agregar portfolio/i });
  if (await addPortfolioBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
    page.once('dialog', async (dialog) => {
      await dialog.accept('Core');
    });
    await addPortfolioBtn.click();
  }
  await expect(page.getByRole('heading', { name: 'Nueva posición' })).toBeVisible();

  await page.getByLabel('Activo').fill('AAPL');
  await page.getByLabel('Fecha compra').fill('2026-02-15');
  await page.getByLabel('Precio compra').fill('190');
  await page.getByLabel('Monto total (USD)').fill('380');
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();

  await expect(page.locator('.pos-sym', { hasText: 'AAPL' }).first()).toBeVisible();
});
