import { expect, test } from '@playwright/test';

import { pickOption } from './helpers';

test('an Owner publishes a Lodging from the panel and it reaches every surface', async ({ page }) => {
  await page.goto('/app/owner');
  await page.getByRole('button', { name: 'Agregar alojamiento' }).click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Nombre del alojamiento')).toBeVisible();

  // 1. Básico
  await page.getByLabel('Nombre del alojamiento').fill('Posada del Molino');
  await pickOption(page, 'Tipo', 'Cabaña');
  await page.getByRole('button', { name: 'Siguiente' }).click();

  // 2. Ubicación (towns limited to the Owner's country)
  await pickOption(page, 'Pueblo o ciudad', 'Tilcara');
  await page.getByLabel('Dirección').fill('Belgrano 450');
  await page.getByRole('button', { name: 'Siguiente' }).click();

  // 3. Detalles
  await expect(page.getByRole('heading', { name: 'Detalles' })).toBeVisible();
  await page.getByLabel('Descripción corta').fill('Cabaña de adobe frente al Pucará.');
  await page.getByLabel('Servicios (uno por línea)').fill('Parrilla\nWifi');
  await page.getByRole('button', { name: 'Siguiente' }).click();

  // 4. Fotos y precio
  await expect(page.getByRole('heading', { name: 'Fotos y precio' })).toBeVisible();
  await page.getByLabel(/Precio por noche/).fill('85000');
  await page.getByRole('button', { name: 'Publicar' }).click();

  // Back in the panel right away, with the "Nuevo" chip instead of a rating.
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Posada del Molino' }) });
  await expect(card).toBeVisible();
  await expect(card.getByText('Nuevo', { exact: true })).toBeVisible();

  // Survives a reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Posada del Molino' })).toBeVisible();

  // Public catalog.
  await page.goto('/lodgings');
  await expect(page.getByRole('heading', { name: 'Posada del Molino' })).toBeVisible();

  // Owner storefront.
  await page.goto('/owners/ramon-guaymas');
  await expect(page.getByRole('heading', { name: 'Posada del Molino' })).toBeVisible();

  // Its ficha shows the exact address and the map with the pin.
  await page.getByRole('link', { name: 'Posada del Molino' }).first().click();
  await expect(page.getByText('Belgrano 450, Tilcara')).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon')).toBeVisible();
});

test('the wizard validates the current step before moving on', async ({ page }) => {
  await page.goto('/app/owner');
  await page.getByRole('button', { name: 'Agregar alojamiento' }).click();

  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByText('Escribí el nombre, como lo conocen tus huéspedes.')).toBeVisible();
  // Still on step 1: the name field never left.
  await expect(page.getByLabel('Nombre del alojamiento')).toBeVisible();

  await page.getByLabel('Nombre del alojamiento').fill('Posada del Molino');
  await page.getByRole('button', { name: 'Siguiente' }).click();

  // Atrás keeps what was typed.
  await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(page.getByLabel('Nombre del alojamiento')).toHaveValue('Posada del Molino');
});
