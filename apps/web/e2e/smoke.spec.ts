import { expect, test } from '@playwright/test';

test('the public explorer lists the seeded Lodgings', async ({ page }) => {
  await page.goto('/lodgings');
  await expect(page.getByRole('heading', { name: 'Alojamientos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Casa de Adobe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cabaña Viñas del Sol' })).toBeVisible();
});

test("the Owner panel lists Ramón's Lodgings", async ({ page }) => {
  await page.goto('/app/owner');
  await expect(page.getByText('Hola, Ramón')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Casa de Adobe' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cabaña Viñas del Sol' })).toBeVisible();
});
