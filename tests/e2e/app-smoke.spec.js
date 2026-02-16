import { expect, test } from '@playwright/test';

test('app boot smoke renders a primary screen', async ({ page }) => {
  await page.goto('/');

  const loading = page.getByRole('heading', { name: 'Cargando mercado...' });
  const auth = page.getByRole('heading', { name: 'Continuar con Google' });
  const dashboard = page.getByRole('heading', { name: 'Horsy' });
  await expect(loading.or(auth).or(dashboard)).toBeVisible({ timeout: 15_000 });
});
