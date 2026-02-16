import { expect, test } from '@playwright/test';

test('app boot smoke renders a primary screen', async ({ page }) => {
  await page.goto('/');

  const loading = page.getByRole('heading', { name: 'Cargando mercado...' });
  const auth = page.getByRole('heading', { name: 'Iniciar sesión con Google' });
  const dashboard = page.getByRole('heading', { name: 'Horsai' });

  await expect(async () => {
    const hasLoading = await loading.isVisible().catch(() => false);
    const hasAuth = await auth.isVisible().catch(() => false);
    const hasDashboard = await dashboard.isVisible().catch(() => false);
    expect(hasLoading || hasAuth || hasDashboard).toBe(true);
  }).toPass({ timeout: 15_000 });
});
