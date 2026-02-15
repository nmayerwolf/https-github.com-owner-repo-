import { expect, test } from '@playwright/test';

test('app boot smoke renders a primary screen', async ({ page }) => {
  await page.goto('/');

  const loading = page.getByRole('heading', { name: 'Cargando mercado...' });
  const auth = page.getByRole('heading', { name: 'Iniciar sesión' });
  const dashboard = page.getByRole('heading', { name: 'Resumen Portfolio' });

  await Promise.race([
    loading.waitFor({ state: 'visible', timeout: 15_000 }),
    auth.waitFor({ state: 'visible', timeout: 15_000 }),
    dashboard.waitFor({ state: 'visible', timeout: 15_000 })
  ]);

  await expect(loading.or(auth).or(dashboard)).toBeVisible();
});
